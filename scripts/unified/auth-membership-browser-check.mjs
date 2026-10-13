import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";

const base = "http://127.0.0.1:3001";
const config = JSON.parse(
  execFileSync("supabase", ["status", "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
assert.equal(config.API_URL, "http://127.0.0.1:54321");
const client = createClient(config.API_URL, config.PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
const token = randomUUID();
const hash = createHash("sha256").update(token).digest("hex");
const id = "auth_browser_" + randomUUID().replaceAll("-", "");
const title = "Synthetic auth membership approval " + id;
const sql = (query) =>
  execFileSync(
    "docker",
    ["exec", "supabase_db_aboutvelocityswimming", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", query],
    { stdio: "pipe", encoding: "utf8" },
  );
let browser;
try {
  sql(`insert into private.collection_workers(name,token_hash,divisions) values('Auth browser fixture','${hash}',array['knowledge']);`);
  const staged = await client.rpc("stage_collection", {
    worker_token: token,
    batch: {
      division: "knowledge",
      scope: title,
      sourceUrl: "https://example.test/auth-membership",
      capturedAt: new Date().toISOString(),
      coverage: "partial",
      evidence: { text: "Synthetic auth browser check" },
      reads: [{ path: "knowledge_entries/" + id, before: null }],
      writes: [{ path: "knowledge_entries/" + id, after: { kind: "meet", title, sourceUrl: "https://example.test/auth-membership", startsOn: "2026-10-01", endsOn: "2026-10-01" } }],
    },
  });
  assert.ifError(staged.error);
  browser = await chromium.launch({ headless: true });
  const errors = [];
  const membership = [];
  const obsoleteLookups = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const watch = async (page) => {
    page.setDefaultTimeout(30000);
    await page.route("**/*.supabase.co/**", (route) => {
      errors.push("Refused a hosted Supabase request");
      return route.abort();
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("Error fetching family membership")) errors.push(message.text());
    });
    page.on("response", (response) => {
      if (new URL(response.url()).pathname === "/rest/v1/family_emails") membership.push(response.status());
    });
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/rest/v1/rpc/query_records") {
        const body = request.postDataJSON();
        if (body?.collection_path === "families" && body?.filters?.some((filter) => filter.field === "authorizedEmails")) obsoleteLookups.push(body);
      }
    });
  };
  const login = async (page, email) => {
    await page.goto(base + "/login");
    await page.getByRole("button", { name: /password/i }).click();
    await page.locator("input[type=email]").fill(email);
    await page.locator("input[type=password]").fill("Velocity-local-test-2026!");
    await page.locator("button[type=submit]").click();
    await page.waitForURL(base + "/tools");
  };
  const page = await context.newPage();
  await watch(page);
  await login(page, "coach@velocity-swimming.com");
  await page.goto(base + "/tools/review");
  await page.getByRole("searchbox", { name: "Search batches", exact: true }).fill(title);
  const article = page.locator("article").filter({ hasText: title });
  await article.getByRole("button", { name: "Approve all changes", exact: true }).click();
  await article.waitFor({ state: "detached" });
  const approved = await client.auth.signInWithPassword({ email: "coach@velocity-swimming.com", password: "Velocity-local-test-2026!" });
  assert.ifError(approved.error);
  const { data: result, error } = await client.from("collection_batches").select("status").eq("id", staged.data).single();
  assert.ifError(error);
  assert.equal(result.status, "approved");
  await client.auth.signOut({ scope: "local" });

  await page.goto(base + "/tools/workshare/admin/families/family-a");
  await page.getByRole("button", { name: "View Client", exact: true }).last().click();
  await page.waitForURL(base + "/tools/workshare");
  await page.getByText("Example Family A", { exact: true }).first().waitFor();
  const recovered = page.waitForResponse((response) => new URL(response.url()).pathname === "/rest/v1/family_emails");
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  assert.equal((await recovered).status(), 200);
  await page.getByRole("button", { name: "To Admin", exact: true }).last().waitFor();
  await page.getByText("Example Family A", { exact: true }).first().waitFor();

  // Expire only this synthetic browser's session timestamp so the real SDK
  // performs a token refresh and publishes the same-account auth event.
  const cookies = (await context.cookies(base)).filter((cookie) => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name));
  cookies.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  assert.ok(cookies.length > 0);
  const encoded = cookies.map((cookie) => cookie.value).join("");
  assert.ok(encoded.startsWith("base64-"));
  const session = JSON.parse(Buffer.from(encoded.slice(7), "base64url").toString());
  session.expires_at = Math.floor(Date.now() / 1000) - 30;
  const expired = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  let position = 0;
  await context.addCookies(cookies.map((cookie, index) => {
    const size = index === cookies.length - 1 ? expired.length - position : cookie.value.length;
    const value = expired.slice(position, position + size);
    position += size;
    return { ...cookie, value };
  }));
  const refresh = page.waitForResponse((response) => new URL(response.url()).pathname === "/auth/v1/token" && new URL(response.url()).searchParams.get("grant_type") === "refresh_token");
  const refreshedMembership = page.waitForResponse((response) => new URL(response.url()).pathname === "/rest/v1/family_emails");
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  assert.equal((await refresh).status(), 200);
  assert.equal((await refreshedMembership).status(), 200);
  await page.getByRole("button", { name: "To Admin", exact: true }).last().waitFor();
  await page.getByText("Example Family A", { exact: true }).first().waitFor();

  const familyContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const familyPage = await familyContext.newPage();
  await watch(familyPage);
  await login(familyPage, "family-a@example.test");
  await familyPage.goto(base + "/tools/workshare");
  await familyPage.getByText("Example Family A", { exact: true }).first().waitFor();
  assert.equal(await familyPage.getByRole("button", { name: "View Client", exact: true }).count(), 0);
  assert.equal(await familyPage.getByText("Example Family B", { exact: true }).count(), 0);
  assert.ok(membership.length >= 4);
  assert.ok(membership.every((status) => status === 200));
  assert.deepEqual(obsoleteLookups, []);
  assert.deepEqual(errors, []);
  console.log("Verified local staff approval, indexed membership, focus recovery, token refresh with client preview preserved, and family dashboard access.");
} finally {
  await browser?.close();
  await client.auth.signOut({ scope: "local" });
  sql(`begin; delete from public.collection_reviews where batch_id in (select b.id from public.collection_batches b join private.collection_workers w on w.id=b.worker_id where w.token_hash='${hash}'); delete from public.collection_batches where worker_id in (select id from private.collection_workers where token_hash='${hash}'); delete from public.knowledge_entries where id='${id}'; delete from private.collection_workers where token_hash='${hash}'; commit;`);
}
