import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const base = "http://127.0.0.1:3001";
const config = JSON.parse(execFileSync("supabase", ["status", "--output", "json"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
}));
assert.equal(config.API_URL, "http://127.0.0.1:54321");
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = "christiancutter02@gmail.com";
const listed = await admin.auth.admin.listUsers();
assert.ifError(listed.error);
const user = listed.data.users.find((candidate) => candidate.email === email);
assert.ok(user, "Run seed:local before the browser check.");
const original = await admin.from("account_profiles").select("*").eq("user_id", user.id).maybeSingle();
assert.ifError(original.error);
const browser = await chromium.launch({ headless: true });
const errors = [];
const bucket = admin.storage.from("account-avatars");
const read = async () => {
  const result = await admin.from("account_profiles").select("*").eq("user_id", user.id).single();
  assert.ifError(result.error);
  return result.data;
};
try {
  // Isolate this test from any profile already present in the local fixture.
  assert.ifError((await admin.from("account_profiles").delete().eq("user_id", user.id)).error);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.route("**/*.supabase.co/**", (route) => { errors.push("Refused hosted backend"); return route.abort(); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/login");
  await page.getByRole("button", { name: /password/i }).click();
  await page.locator("input[type=email]").fill(email);
  await page.locator("input[type=password]").fill("Velocity-local-test-2026!");
  await page.locator("button[type=submit]").click();
  await page.waitForURL(base + "/tools");
  await page.getByRole("heading", { name: "Account", level: 1, exact: true }).waitFor();
  await page.getByRole("region", { name: "Account management", exact: true }).waitFor();
  await page.getByLabel("Username", { exact: true }).waitFor();
  assert.equal((await read()).username, "", "Sign-in creates a persisted profile before the first save");
  // Recover if an already-signed-in account is missing its profile row.
  assert.ifError((await admin.from("account_profiles").delete().eq("user_id", user.id)).error);
  await page.reload();
  await page.getByLabel("Username", { exact: true }).waitFor();
  assert.equal((await read()).username, "", "Opening the profile repairs a missing row in an existing session");
  const account = page.getByRole("region", { name: "Account management", exact: true });
  const sidebar = page.getByRole("complementary", { name: "Navigation sidebar", exact: true });
  const navigation = sidebar.getByRole("navigation", { name: "Tools navigation", exact: true });
  const accountLink = navigation.getByRole("link", { name: "Account", exact: true });
  await accountLink.waitFor();
  assert.equal(await accountLink.getAttribute("aria-current"), "page");
  assert.ok(await account.getByRole("group", { name: "Signed-in account" }).getByText(email, { exact: true }).isVisible());
  assert.equal(await sidebar.getByText("Logged in as", { exact: true }).count(), 0);
  assert.equal(await sidebar.getByText(email, { exact: true }).count(), 0);
  assert.equal(await navigation.locator(":scope > ul").evaluate(element => getComputedStyle(element).borderTopWidth), "0px");
  assert.equal(await account.getByLabel(/^Bio\b/).count(), 0);

  const main = page.getByRole("main");
  const about = main.getByRole("region", { name: "About the tools", exact: true });
  await about.waitFor();
  for (const [name, description] of [
    ["Overview", /Data Observatory/],
    ["Velocity Times", /approved results and time standards/],
    ["Velocity Workshare", /volunteer opportunities/],
    ["Swim Atlas", /original source links/],
    ["Velocity Imports", /review proposed changes/],
  ]) {
    assert.ok(await about.getByText(name, { exact: true }).isVisible());
    assert.ok(await about.getByText(description).isVisible());
  }
  assert.equal(await main.getByRole("link").count(), 0);
  const save = page.getByRole("button", { name: "Save changes", exact: true });
  assert.equal(await save.count(), 0);
  await page.getByLabel("Username", { exact: true }).fill("temporary.name");
  assert.ok(await save.isVisible());
  await page.getByLabel("Username", { exact: true }).fill("");
  assert.equal(await save.count(), 0, "Reverting a field hides Save changes");
  await page.getByLabel("Username", { exact: true }).fill("discard.me");
  await page.getByRole("button", { name: "Discard changes" }).click();
  assert.equal(await page.getByLabel("Username", { exact: true }).inputValue(), "");
  assert.equal(await save.count(), 0, "Discarding changes hides Save changes");

  await page.getByLabel("Choose profile picture").setInputFiles({ name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await page.getByRole("alert").filter({ hasText: "Choose a JPG, PNG, or WebP" }).waitFor();
  const png = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 96; canvas.height = 96;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#0a856c"; ctx.fillRect(0, 0, 96, 96);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const largePhoto = Buffer.concat([Buffer.from(png, "base64"), Buffer.alloc(6 * 1024 * 1024)]);
  await page.getByLabel("Choose profile picture").setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: largePhoto });
  await page.getByRole("img", { name: "Your profile picture" }).waitFor();
  assert.ok(await save.isVisible());
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  assert.equal(await save.count(), 0, "Removing a new unsaved photo restores the unchanged state");
  await page.getByLabel("Choose profile picture").setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: largePhoto });
  await page.getByRole("img", { name: "Your profile picture" }).waitFor();
  await page.getByLabel("Username", { exact: true }).fill("velocity.swimmer");
  const existingBio = "Swimmer, volunteer, and lifelong fan of the pool.";
  assert.ifError((await admin.from("account_profiles").update({ bio: existingBio }).eq("user_id", user.id)).error);
  await save.click();
  await page.getByRole("status").filter({ hasText: "Profile saved" }).waitFor();
  assert.equal(await save.count(), 0, "Saving hides Save changes");
  const stored = await read();
  assert.equal(stored.username, "velocity.swimmer");
  assert.equal(stored.bio, existingBio, "Saving username and photo preserves a bio written after the page loaded");
  assert.ok(stored.avatar_path.startsWith(user.id + "/"));
  const uploaded = await bucket.download(stored.avatar_path);
  assert.ifError(uploaded.error);
  assert.equal(uploaded.data.size, largePhoto.length, "A photo over 5 MB uploads successfully");
  await page.reload();
  await page.getByRole("img", { name: "Your profile picture" }).waitFor();
  assert.equal(await page.getByLabel("Username", { exact: true }).inputValue(), stored.username);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "/tmp/velocity-account-desktop.png", fullPage: true, animations: "disabled" });
  await navigation.getByRole("link", { name: "Velocity Times", exact: true }).click();
  await page.waitForURL(base + "/tools/times/overview");
  await accountLink.click();
  await page.waitForURL(base + "/tools");
  await page.getByLabel("Username", { exact: true }).waitFor();

  const profileRequests = "**/rest/v1/account_profiles*";
  await page.route(profileRequests, (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Synthetic save failure" }) }) : route.continue());
  await page.getByLabel("Username", { exact: true }).fill("retry.swimmer");
  await save.click();
  await page.getByRole("alert").filter({ hasText: "We couldn’t save" }).waitFor();
  assert.equal(await page.getByLabel("Username", { exact: true }).inputValue(), "retry.swimmer");
  assert.equal((await read()).username, stored.username);
  await page.unroute(profileRequests);
  await save.click();
  await page.getByRole("status").filter({ hasText: "Profile saved" }).waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[aria-label="Navigation sidebar"]')).visibility === "hidden");
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: "/tmp/velocity-account-mobile.png", fullPage: true, animations: "disabled" });
  await page.evaluate(() => document.documentElement.dataset.theme = "dark");
  await page.screenshot({ path: "/tmp/velocity-account-dark.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  await save.click();
  await page.getByRole("status").filter({ hasText: "Profile saved" }).waitFor();
  assert.equal((await read()).avatar_path, null);
  assert.ok((await bucket.download(stored.avatar_path)).error);
  await page.reload();
  await page.getByLabel("Username", { exact: true }).waitFor();
  assert.equal(await page.getByRole("img", { name: "Your profile picture" }).count(), 0);
  await page.goto(base + "/account");
  await page.waitForURL(base + "/tools");
  await account.getByRole("group", { name: "Signed-in account" }).getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByText("Tools are temporarily locked", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Username", { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log("Verified account layout, tool descriptions and sidebar navigation, profile save/reload, private photo upload/removal, discard, validation, failed-save retry, mobile/dark layouts, account redirect, and sign-out.");
} finally {
  await browser.close();
  const current = await admin.from("account_profiles").select("avatar_path").eq("user_id", user.id).maybeSingle();
  if (current.data?.avatar_path && current.data.avatar_path !== original.data?.avatar_path) await bucket.remove([current.data.avatar_path]);
  if (original.data) await admin.from("account_profiles").upsert(original.data);
  else await admin.from("account_profiles").delete().eq("user_id", user.id);
}
