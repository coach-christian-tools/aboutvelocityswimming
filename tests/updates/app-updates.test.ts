import test from "node:test";
import assert from "node:assert/strict";
import {
  CHECK_THROTTLE_MS,
  REMIND_AFTER_MS,
  UPDATE_QUERY_PARAM,
  createVersionMonitor,
  fetchDeploymentVersion,
  cleanUpdateUrl,
  updateUrl,
  watchForUpdates,
  validVersion,
  type UpdateNoticeState,
} from "../../src/lib/app-updates.ts";
import {
  holdUpdates,
  withUpdateHold,
  updatesBlocked,
  subscribeUpdateSafety,
} from "../../src/lib/update-safety.ts";

function setup(version = "build-b") {
  let time = 0,
    calls = 0;
  let latest = version;
  const notices: UpdateNoticeState[] = [];
  const monitor = createVersionMonitor({
    currentVersion: "build-a",
    now: () => time,
    onChange: (n) => notices.push(n),
    fetchVersion: async () => {
      calls++;
      return latest;
    },
  });
  return {
    monitor,
    notices,
    calls: () => calls,
    advance: (ms: number) => {
      time += ms;
    },
    version: (value: string) => {
      latest = value;
    },
  };
}

test("detects a new deployment and rollback against the running bundle", async () => {
  const s = setup();
  assert.equal(await s.monitor.check(), "build-b");
  assert.deepEqual(s.notices.at(-1), { version: "build-b", visible: true });
  s.version("build-older");
  await s.monitor.check({ force: true });
  assert.deepEqual(s.notices.at(-1), { version: "build-older", visible: true });
  s.version("build-a");
  await s.monitor.check({ force: true });
  assert.deepEqual(s.notices.at(-1), { version: null, visible: false });
});

test("coalesces simultaneous checks and throttles mobile lifecycle events", async () => {
  const s = setup();
  const first = s.monitor.check();
  assert.equal(s.monitor.check({ force: true }), first);
  await first;
  await s.monitor.check();
  assert.equal(s.calls(), 1);
  s.advance(CHECK_THROTTLE_MS);
  await s.monitor.check();
  assert.equal(s.calls(), 2);
});

test("Later suppresses reminders for thirty minutes without navigation", async () => {
  const s = setup();
  await s.monitor.check();
  s.monitor.later();
  assert.equal(s.notices.at(-1)?.visible, false);
  s.advance(REMIND_AFTER_MS - 1);
  await s.monitor.check();
  assert.equal(s.notices.at(-1)?.visible, false);
  s.advance(1);
  await s.monitor.check({ force: true });
  assert.equal(s.notices.at(-1)?.visible, true);
});

test("failed checks preserve known updates and disposal ignores pending responses", async () => {
  let fail = false;
  const notices: UpdateNoticeState[] = [];
  const monitor = createVersionMonitor({
    currentVersion: "a",
    onChange: (n) => notices.push(n),
    fetchVersion: async () => {
      if (fail) throw new Error("offline");
      return "b";
    },
  });
  await monitor.check();
  fail = true;
  assert.equal(await monitor.check({ force: true }), null);
  assert.deepEqual(notices.at(-1), { version: "b", visible: true });
  const pending = monitor.check({ force: true });
  monitor.dispose();
  const count = notices.length;
  await pending;
  assert.equal(notices.length, count);
  assert.equal(await monitor.check(), null);
});

test("invalid metadata never becomes an update", async () => {
  for (const version of [
    null,
    {},
    "",
    "<html>",
    "x".repeat(129),
    "/bad",
    "x:y",
  ])
    assert.equal(validVersion(version), false);
  const s = setup("<html>");
  assert.equal(await s.monitor.check(), null);
  assert.equal(s.notices.at(-1)?.visible, false);
});

test("metadata fetch bypasses caches, rejects HTML/status/invalid JSON and aborts", async (t) => {
  let requested = "",
    options: RequestInit | undefined;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    requested = url;
    options = init;
    return Response.json({ version: "build-b" });
  });
  assert.equal(await fetchDeploymentVersion(), "build-b");
  assert.match(requested, /^\/api\/app-version\?check=/);
  assert.equal(options?.cache, "no-store");
  assert.equal(options?.redirect, "error");
  for (const response of [
    new Response("no", { status: 500 }),
    new Response("<html>"),
    Response.json({ version: 2 }),
    new Response("{", { headers: { "content-type": "application/json" } }),
  ]) {
    t.mock.method(globalThis, "fetch", async () => response);
    await assert.rejects(fetchDeploymentVersion());
  }
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(
    globalThis,
    "fetch",
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) =>
        init.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        ),
      ),
  );
  const pending = fetchDeploymentVersion();
  const rejection = assert.rejects(pending, /aborted/);
  t.mock.timers.tick(10_000);
  await rejection;
});

test("cache-busting navigation preserves route, search, hash and Next history state", () => {
  const before =
    "https://example.test/tools/times?name=two+words&sort=fast#race";
  const changed = updateUrl(before, "build-b");
  const url = new URL(changed);
  assert.equal(url.pathname, "/tools/times");
  assert.equal(url.searchParams.get("name"), "two words");
  assert.equal(url.hash, "#race");
  assert.match(url.searchParams.get(UPDATE_QUERY_PARAM)!, /^build-b:/);
  const historyState = { __NA: true, tree: ["test"] };
  let cleaned = "";
  const win = {
    location: { href: changed },
    history: {
      state: historyState,
      replaceState(state: unknown, _title: string, href: string) {
        assert.equal(state, historyState);
        cleaned = href;
      },
    },
  } as unknown as Window & typeof globalThis;
  assert.equal(cleanUpdateUrl(win), "build-b");
  assert.equal(cleaned, before);
  assert.notEqual(updateUrl(before, "build-b"), changed);
});

test("foreground/online/pageshow events check while hidden and offline tabs do not", async () => {
  const s = setup();
  let interval: (() => void) | undefined;
  const win = Object.assign(new EventTarget(), {
    navigator: { onLine: true },
    setInterval: (fn: () => void) => {
      interval = fn;
      return 7;
    },
    clearInterval: (id: number) => assert.equal(id, 7),
  });
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const cleanup = watchForUpdates(
    s.monitor,
    win as unknown as Window & typeof globalThis,
    doc as unknown as Document,
  );
  await s.monitor.check();
  assert.equal(s.calls(), 1);
  for (const event of ["focus", "pageshow", "online"]) {
    s.advance(CHECK_THROTTLE_MS);
    win.dispatchEvent(new Event(event));
    await s.monitor.check();
  }
  assert.equal(s.calls(), 4);
  doc.visibilityState = "hidden";
  s.advance(CHECK_THROTTLE_MS);
  interval!();
  await Promise.resolve();
  assert.equal(s.calls(), 4);
  doc.visibilityState = "visible";
  win.navigator.onLine = false;
  win.dispatchEvent(new Event("focus"));
  await Promise.resolve();
  assert.equal(s.calls(), 4);
  win.navigator.onLine = true;
  doc.dispatchEvent(new Event("visibilitychange"));
  await s.monitor.check();
  assert.equal(s.calls(), 5);
  cleanup();
  s.advance(CHECK_THROTTLE_MS);
  win.dispatchEvent(new Event("focus"));
  await Promise.resolve();
  assert.equal(s.calls(), 5);
});

test("overlapping operations hold updates until all settle, including rejection and double release", async () => {
  let calls = 0;
  const unsubscribe = subscribeUpdateSafety(() => calls++);
  const first = holdUpdates(),
    second = holdUpdates();
  assert.equal(updatesBlocked(), true);
  first();
  first();
  assert.equal(updatesBlocked(), true);
  second();
  assert.equal(updatesBlocked(), false);
  assert.equal(calls, 4);
  await assert.rejects(
    withUpdateHold(async () => {
      assert.equal(updatesBlocked(), true);
      throw new Error("failed save");
    }),
    /failed save/,
  );
  assert.equal(updatesBlocked(), false);
  assert.equal(await withUpdateHold(async () => 42), 42);
  assert.equal(updatesBlocked(), false);
  await assert.rejects(
    withUpdateHold(() => {
      throw new Error("sync");
    }),
    /sync/,
  );
  unsubscribe();
  const before = calls;
  holdUpdates()();
  assert.equal(calls, before);
});
