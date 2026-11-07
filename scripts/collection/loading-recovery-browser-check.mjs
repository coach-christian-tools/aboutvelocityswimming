import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import ts from "typescript";
import { chromium } from "playwright";

// Isolated HTTP fixtures exercise the actual browser loaders without approving data.
const modules = new Map(
  ["load-times", "save-review-decision"].map((name) => [
    `/${name}.js`,
    ts.transpileModule(
      readFileSync(`src/components/collection/${name}.ts`, "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
  ]),
);
let mode = "recover",
  reads = 0,
  writes = 0;
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  const moduleSource = modules.get(url.pathname);
  if (moduleSource) {
    response.setHeader("Content-Type", "application/javascript");
    response.end(moduleSource);
    return;
  }
  if (url.pathname === "/api/times") {
    reads++;
    response.setHeader("Content-Type", "application/json");
    response.setHeader("X-Request-ID", request.headers["x-request-id"]);
    response.statusCode =
      mode === "denied" ? 403 : mode === "fail" || reads === 1 ? 503 : 200;
    response.end(
      JSON.stringify(
        response.statusCode === 200
          ? { rows: [], expiresAt: Date.now() + 60000 }
          : { error: "Fixture failure" },
      ),
    );
    return;
  }
  if (url.pathname === "/api/collection/review") {
    writes++;
    response.statusCode = 504;
    response.end("<html>Gateway timeout</html>");
    return;
  }
  response.setHeader("Content-Type", "text/html");
  response.end("<!doctype html><title>Loading recovery checks</title>");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const logs = [],
    errors = [];
  page.on("console", (entry) => {
    if (entry.text().includes("[velocity")) logs.push(entry.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const load = () =>
    page.evaluate(async () => {
      const { loadTimes } = await import("/load-times.js");
      try {
        await loadTimes(
          "/api/times?view=meets&search=private-search",
          new AbortController().signal,
        );
        return "loaded";
      } catch (error) {
        return error.message;
      }
    });
  assert.equal(await load(), "loaded");
  assert.equal(reads, 2, "One failed read recovers automatically");
  mode = "fail";
  reads = 0;
  assert.match(await load(), /couldn’t load/);
  assert.equal(reads, 2, "Persistent failures stop after one retry");
  mode = "denied";
  reads = 0;
  assert.match(await load(), /couldn’t load/);
  assert.equal(reads, 1, "Access denials are not retried");
  mode = "fail";
  reads = 0;
  await page.evaluate(async () => {
    const { loadTimes } = await import("/load-times.js");
    const controller = new AbortController();
    const pending = loadTimes("/api/times?view=meets", controller.signal).catch(
      () => {},
    );
    setTimeout(() => controller.abort(), 100);
    await pending;
  });
  assert.equal(reads, 1, "Navigation cancels the pending retry");
  const result = await page.evaluate(async () => {
    const { saveReviewDecision } = await import("/save-review-decision.js");
    try {
      await saveReviewDecision(
        "fixture-batch",
        "approved",
        "private note",
        () => {},
      );
    } catch (error) {
      return error.message;
    }
  });
  assert.match(result, /Refresh the queue/);
  assert.equal(writes, 1, "An unconfirmed approval is never resubmitted");
  assert.ok(logs.some((line) => line.includes("request failed")));
  assert.ok(!logs.some((line) => /private-search|private note/.test(line)));
  assert.deepEqual(errors, []);
  console.log(
    "Loading recovery browser checks passed: automatic retry, retry limit, access denial, cancellation, ambiguous approval response and diagnostic privacy.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
