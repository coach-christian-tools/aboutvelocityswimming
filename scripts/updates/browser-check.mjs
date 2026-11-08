// Build A: npm run build. Build B: VELOCITY_TEST_BUILD=true npm run build.
// Uses only local servers and synthetic browser storage. All external requests
// are blocked; mocked auth failures never reach Supabase or send any email.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { chromium, devices } from "playwright";

const root = process.cwd();
const versions = [".next", ".next-velocity-test"].map((dir) =>
  readFileSync(`${dir}/BUILD_ID`, "utf8").trim(),
);
assert.notEqual(
  versions[0],
  versions[1],
  "Build twice before running the deployment test.",
);
const processes = [];
const artifactDir = "backups/update-verification";
mkdirSync(artifactDir, { recursive: true });
let browser, proxy;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function availablePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function start(testBuild) {
  const port = await availablePort();
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        VELOCITY_TEST_BUILD: testBuild ? "true" : "false",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  processes.push(child);
  let logs = "";
  child.stdout.on("data", (data) => {
    logs += data;
  });
  child.stderr.on("data", (data) => {
    logs += data;
  });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null)
      throw new Error(`Local Next server exited: ${logs}`);
    try {
      const result = await fetch(`http://127.0.0.1:${port}/api/app-version`);
      if (result.ok) return port;
    } catch {
      /* Starting. */
    }
    await delay(100);
  }
  throw new Error(`Local server did not start: ${logs}`);
}
try {
  const ports = [await start(false), await start(true)];
  let target = 0,
    metadataFailure = false,
    holdMetadata = null,
    navigationDelay = 0;
  let releaseOtp = null;
  const metadataRequests = [];
  proxy = createServer((req, res) => {
    const send = () => {
      if (req.url.startsWith("/api/app-version")) {
        metadataRequests.push(req.url);
        if (metadataFailure) {
          res.writeHead(503, { "Content-Type": "text/html" });
          res.end("Unavailable");
          return;
        }
      }
      const upstream = httpRequest(
        {
          hostname: "127.0.0.1",
          port: ports[target],
          path: req.url,
          method: req.method,
          headers: req.headers,
        },
        (response) => {
          res.writeHead(response.statusCode, response.headers);
          response.pipe(res);
        },
      );
      upstream.on("error", (error) => {
        res.writeHead(502);
        res.end(error.message);
      });
      req.pipe(upstream);
    };
    if (req.url.startsWith("/api/app-version") && holdMetadata) {
      holdMetadata(send);
      return;
    }
    if (navigationDelay && req.headers["sec-fetch-dest"] === "document")
      setTimeout(send, navigationDelay);
    else send();
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${proxy.address().port}`;
  for (let i = 0; i < ports.length; i++) {
    const result = await fetch(
      `http://127.0.0.1:${ports[i]}/api/app-version?check=test-${i}`,
    );
    assert.equal(
      (await result.json()).version,
      versions[i],
      "Build ID and endpoint agree after server start",
    );
    assert.match(result.headers.get("cache-control"), /no-store/);
  }
  browser = await chromium.launch({ headless: true });
  for (const [name, options] of [
    ["desktop", { viewport: { width: 1440, height: 1000 } }],
    ["android-chrome", devices["Pixel 7"]],
  ]) {
    target = 0;
    metadataFailure = false;
    navigationDelay = 0;
    const context = await browser.newContext(options);
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if (url.pathname === "/auth/v1/otp") {
        await new Promise((resolve) => {
          releaseOtp = resolve;
        });
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            msg: "Synthetic sign-in failure",
            error_code: "test_error",
          }),
        });
      }
      return route.abort();
    });
    await page.clock.install();
    const path = "/login?filter=two+words#update-check";
    await page.goto(origin + path, { waitUntil: "networkidle" });
    assert.equal(
      await page.locator('meta[name="app-version"]').getAttribute("content"),
      versions[0],
    );
    assert.equal(
      await page.getByRole("complementary", { name: "Website update" }).count(),
      0,
    );
    // A cache-busting load must not remove authentication cookies or local drafts.
    await context.addCookies([
      { name: "velocity-test-cookie", value: "keep", url: origin },
    ]);
    await page.evaluate(async () => {
      localStorage.setItem("velocity-test-local", "keep");
      sessionStorage.setItem("velocity-test-session", "keep");
      const request = indexedDB.open("velocity-update-test", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("drafts");
      await new Promise((resolve, reject) => {
        request.onsuccess = resolve;
        request.onerror = reject;
      });
      const db = request.result;
      const tx = db.transaction("drafts", "readwrite");
      tx.objectStore("drafts").put("keep", "sentinel");
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
      db.close();
    });
    target = 1;
    await page.clock.fastForward(11_000);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page
      .getByText("A new version is available.", { exact: true })
      .waitFor();
    const originalURL = page.url();
    await page.getByRole("button", { name: "Later", exact: true }).click();
    await page.clock.fastForward(29 * 60_000);
    assert.equal(page.url(), originalURL);
    assert.equal(
      await page
        .getByRole("button", { name: "Update now", exact: true })
        .count(),
      0,
    );
    await page.clock.fastForward(2 * 60_000);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page
      .getByRole("button", { name: "Update now", exact: true })
      .waitFor();
    await page.locator('input[type="email"]').fill("draft@example.test");
    await page.getByRole("button", { name: "Update now", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Update Velocity Swimming?",
    });
    await dialog.waitFor();
    assert.match(
      await dialog.innerText(),
      /unsaved changes on this page will be lost/,
    );
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent),
      "Keep working",
    );
    await page.keyboard.press("Escape");
    assert.equal(await dialog.count(), 0);
    assert.equal(
      await page.locator('input[type="email"]').inputValue(),
      "draft@example.test",
    );
    await page.getByRole("button", { name: "Update now", exact: true }).click();
    // If a rollback cancels the pending update, a later release must not reopen
    // a previously dismissed modal without a fresh click.
    target = 0;
    await page.clock.fastForward(11_000);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await dialog.waitFor({ state: "hidden" });
    target = 1;
    await page.clock.fastForward(11_000);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page
      .getByRole("button", { name: "Update now", exact: true })
      .waitFor();
    assert.equal(await dialog.count(), 0);
    await page.getByRole("button", { name: "Update now", exact: true }).click();
    await context.setOffline(true);
    await dialog
      .getByRole("button", { name: "Refresh now", exact: true })
      .click();
    await dialog.getByText("Reconnect to the internet to update.").waitFor();
    assert.equal(page.url(), originalURL);
    await context.setOffline(false);
    metadataFailure = true;
    await dialog
      .getByRole("button", { name: "Refresh now", exact: true })
      .click();
    await dialog
      .getByText("Could not check for updates. Please try again.")
      .waitFor();
    assert.equal(page.url(), originalURL);
    metadataFailure = false;
    await dialog
      .getByRole("button", { name: "Keep working", exact: true })
      .click();
    // OTP mutation is mocked, stays pending, then fails. Updater must stay disabled.
    const sendCode = page.getByRole("button", {
      name: "Send 8-Digit Code",
      exact: true,
    });
    await sendCode.click();
    await page.waitForFunction(
      () => document.querySelector('button[type="submit"]')?.disabled,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Update now", exact: true })
        .isDisabled(),
      true,
    );
    for (let i = 0; i < 50 && !releaseOtp; i++) await delay(50);
    assert.ok(releaseOtp, "Mocked OTP request started");
    releaseOtp();
    releaseOtp = null;
    await page.getByRole("alert").waitFor();
    await page
      .getByRole("button", { name: "Update now", exact: true })
      .waitFor({ state: "visible" });
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("button")).some(
        (button) => button.textContent === "Update now" && !button.disabled,
      ),
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Update now", exact: true })
        .isEnabled(),
      true,
    );
    // A mutation started during the final version check cancels refresh safely.
    let releaseMetadata;
    const metadataHeld = new Promise((resolve) => {
      holdMetadata = (send) => {
        holdMetadata = null;
        releaseMetadata = send;
        resolve();
      };
    });
    await page.getByRole("button", { name: "Update now", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Refresh now", exact: true })
      .click();
    await metadataHeld;
    await sendCode.evaluate((button) => button.form.requestSubmit());
    for (let i = 0; i < 50 && !releaseOtp; i++) await delay(50);
    assert.ok(releaseOtp, "Racing mocked OTP request started");
    releaseMetadata();
    await dialog
      .getByRole("button", { name: "Refresh now", exact: true })
      .waitFor();
    assert.equal(
      await dialog
        .getByRole("button", { name: "Refresh now", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(page.url(), originalURL);
    releaseOtp();
    releaseOtp = null;
    await page.getByRole("alert").waitFor();
    await dialog
      .getByRole("button", { name: "Keep working", exact: true })
      .click();
    // Slow successful navigation stays locked, then loads the real second build.
    await page.getByRole("button", { name: "Update now", exact: true }).click();
    navigationDelay = 500;
    await page.screenshot({ path: `${artifactDir}/${name}-confirmation.png` });
    await page.evaluate(() =>
      window.addEventListener(
        "pagehide",
        () => {
          const buttons = Array.from(
            document.querySelectorAll(
              'dialog[aria-labelledby="velocity-update-title"] button',
            ),
          );
          sessionStorage.setItem(
            "velocity-test-navigation-locked",
            String(
              buttons.length === 2 &&
                buttons.every((button) => button.disabled),
            ),
          );
        },
        { once: true },
      ),
    );
    await dialog
      .getByRole("button", { name: "Refresh now", exact: true })
      .click();
    await page.waitForLoadState("networkidle");
    navigationDelay = 0;
    await page.getByText("Website updated.", { exact: true }).waitFor();
    assert.equal(page.url(), originalURL);
    assert.equal(
      await page.evaluate(() =>
        sessionStorage.getItem("velocity-test-navigation-locked"),
      ),
      "true",
    );
    assert.equal(
      await page.locator('meta[name="app-version"]').getAttribute("content"),
      versions[1],
    );
    assert.equal(
      (await context.cookies()).find(
        (cookie) => cookie.name === "velocity-test-cookie",
      )?.value,
      "keep",
    );
    const stored = await page.evaluate(async () => {
      const request = indexedDB.open("velocity-update-test", 1);
      await new Promise((resolve, reject) => {
        request.onsuccess = resolve;
        request.onerror = reject;
      });
      const db = request.result,
        read = db.transaction("drafts").objectStore("drafts").get("sentinel");
      await new Promise((resolve, reject) => {
        read.onsuccess = resolve;
        read.onerror = reject;
      });
      db.close();
      return [
        localStorage.getItem("velocity-test-local"),
        sessionStorage.getItem("velocity-test-session"),
        read.result,
      ];
    });
    assert.deepEqual(stored, ["keep", "keep", "keep"]);
    await page
      .getByRole("heading", { name: "Sign In to Portal", exact: true })
      .waitFor();
    await page.screenshot({ path: `${artifactDir}/${name}-updated.png` });
    await page
      .getByRole("button", { name: "Dismiss update confirmation" })
      .click();
    await page.clock.fastForward(11_000);
    await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(
      await page.getByRole("complementary", { name: "Website update" }).count(),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      `${name}: real two-build update, Later, Cancel/Escape, offline/failed checks, in-flight OTP, URL, storage and no repeat prompt passed`,
    );
    await context.close();
  }
  assert.equal(
    new Set(metadataRequests).size,
    metadataRequests.length,
    "Every metadata fetch has a unique cache-busting URL",
  );
  console.log(
    "Both build identities, no-store headers and cache-busting checks passed.",
  );
} finally {
  await browser?.close();
  proxy?.closeAllConnections();
  await new Promise((resolve) => (proxy ? proxy.close(resolve) : resolve()));
  for (const child of processes) child.kill("SIGTERM");
}
