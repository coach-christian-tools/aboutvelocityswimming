import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";

// Exercise Next's real unstable_cache implementation against deterministic
// storage and time. Only the build-time server-only marker is stubbed.
globalThis.AsyncLocalStorage = AsyncLocalStorage;
const require = createRequire(import.meta.url);
const { workAsyncStorage } = require("next/dist/server/app-render/work-async-storage.external");
const serverPath = join(process.env.CALENDAR_MODULE_DIR, "calendar-server.js");
const compiledService = readFileSync(serverPath, "utf8");
function loadService(source) {
  const compiled = new Module(serverPath);
  compiled.filename = serverPath;
  const serverRequire = createRequire(serverPath);
  compiled.require = name => name === "server-only" ? {} : serverRequire(name);
  compiled._compile(source, serverPath);
  return compiled.exports.getMonthEvents;
}
const getMonthEvents = loadService(compiledService);

function feed(title = "Practice", padding = "") {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${padding ? `X-PADDING:${padding}\r\n` : ""}BEGIN:VEVENT\r\nUID:practice\r\nDTSTART;TZID=America/Los_Angeles:20261005T170000\r\nDTEND;TZID=America/Los_Angeles:20261005T180000\r\nRRULE:FREQ=WEEKLY;COUNT=12\r\nSUMMARY:${title}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
}

function harness(t, initialFeed = feed()) {
  const entries = new Map();
  const stores = [];
  let now = 0;
  let requests = 0;
  let upstream = async () => new Response(initialFeed);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    requests++;
    assert.match(url, /calendar\.google\.com.*basic\.ics$/);
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal);
    return upstream();
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const cache = {
    generateSimpleCacheKey: async key => createHash("sha256").update(key).digest("hex"),
    get: async key => {
      const entry = entries.get(key);
      return entry && { value: entry.value, isStale: now >= entry.expiresAt };
    },
    set: async (key, value) => {
      assert.ok(Buffer.byteLength(JSON.stringify(value)) < 2 * 1024 * 1024, "entry fits Next's Data Cache");
      entries.set(key, { value, expiresAt: now + value.revalidate * 1000 });
    },
  };
  return {
    entries,
    get requests() { return requests; },
    advance(ms) { now += ms; },
    upstream(callback) { upstream = callback; },
    read(month, readEvents = getMonthEvents) {
      const store = { incrementalCache: cache, route: "/schedule", isStaticGeneration: false };
      stores.push(store);
      return workAsyncStorage.run(store, () => readEvents(month));
    },
    async settle() {
      await Promise.all(stores.splice(0).flatMap(store => Object.values(store.pendingRevalidates ?? {})));
    },
  };
}

test("different months share one feed download and warm month results", async t => {
  const app = harness(t);
  const october = await app.read("2026-10");
  await app.settle();
  const november = await app.read("2026-11");
  await app.settle();
  assert.ok(october.some(event => event.startDay.startsWith("2026-10")));
  assert.ok(november.some(event => event.startDay.startsWith("2026-11")));
  assert.deepEqual(await app.read("2026-10"), october);
  await app.settle();
  assert.equal(app.requests, 1);
  assert.equal(app.entries.size, 3, "feed and both month results persist independently");
});

test("page and API bundles share cache keys even when their callback source is renamed", async t => {
  const app = harness(t);
  const apiRead = loadService(compiledService.replace(/\bsource\b/g, "renamedSource"));
  const initial = await app.read("2026-10");
  await app.settle();
  assert.deepEqual(await app.read("2026-10", apiRead), initial);
  await app.settle();
  assert.equal(app.requests, 1, "the second bundle reuses the feed snapshot");
  assert.equal(app.entries.size, 2, "the month cache is also shared across bundles");
});

test("a feed larger than 2 MB is compressed losslessly below the cache limit", async t => {
  const source = feed("Practice", "calendar history ".repeat(180000));
  assert.ok(Buffer.byteLength(source) > 2 * 1024 * 1024);
  const app = harness(t, source);
  assert.ok((await app.read("2026-10")).length > 0);
  await app.settle();
  const snapshot = [...app.entries.values()].map(entry => JSON.parse(entry.value.data.body)).find(value => value.compressed);
  assert.equal(gunzipSync(Buffer.from(snapshot.compressed, "base64")).toString(), source);
  assert.equal(snapshot.revision, createHash("sha256").update(source).digest("hex"));
});

test("stale events return while the feed refreshes, then all months use its new revision", async t => {
  const app = harness(t);
  await app.read("2026-10");
  await app.read("2026-11");
  await app.settle();
  app.advance(300001);
  let release;
  app.upstream(() => new Promise(resolve => { release = resolve; }));
  const stale = await app.read("2026-10");
  assert.equal(stale[0].title, "Practice", "the response does not await Google");
  assert.equal(typeof release, "function");
  release(new Response(feed("Practice moved")));
  await app.settle();
  assert.equal((await app.read("2026-10"))[0].title, "Practice moved");
  assert.equal((await app.read("2026-11"))[0].title, "Practice moved");
  await app.settle();
  assert.equal(app.requests, 2);
});

test("failed and malformed refreshes preserve the last valid snapshot, including for a new month", async t => {
  const app = harness(t);
  await app.read("2026-10");
  await app.settle();
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  t.after(() => { console.error = originalError; });
  for (const callback of [
    async () => new Response("Unavailable", { status: 503 }),
    async () => new Response("<html>Sign in</html>"),
    async () => new Response("BEGIN:VCALENDAR\r\nVERSION:2.0"),
    async () => { throw new DOMException("Timed out", "TimeoutError"); },
  ]) {
    app.advance(300001);
    app.upstream(callback);
    assert.equal((await app.read("2026-10"))[0].title, "Practice");
    await app.settle();
    assert.equal((await app.read("2026-11"))[0].title, "Practice");
    await app.settle();
  }
  assert.ok(errors.length >= 4, "Next reports failed background refreshes");
  app.upstream(async () => new Response(feed("Recovered")));
  await app.read("2026-10");
  await app.settle();
  assert.equal((await app.read("2026-10"))[0].title, "Recovered");
  await app.settle();
});

test("an empty cache propagates upstream errors and does not cache failures", async t => {
  const app = harness(t);
  app.upstream(async () => new Response("Unavailable", { status: 503 }));
  await assert.rejects(app.read("2026-10"), /Calendar returned 503/);
  app.upstream(async () => new Response("BEGIN:VCALENDAR\r\nVERSION:2.0"));
  await assert.rejects(app.read("2026-10"), /Invalid calendar response/);
  app.upstream(async () => { throw new DOMException("Timed out", "TimeoutError"); });
  await assert.rejects(app.read("2026-10"), /Timed out/);
  assert.equal(app.entries.size, 0);
  app.upstream(async () => new Response(feed()));
  assert.ok((await app.read("2026-10")).length > 0);
  await app.settle();
});
