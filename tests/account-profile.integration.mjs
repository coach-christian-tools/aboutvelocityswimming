import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const config = JSON.parse(execFileSync("supabase", ["status", "--output", "json"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
}));
assert.equal(config.API_URL, "http://127.0.0.1:54321", "Tests require the local database.");
const make = (key = config.PUBLISHABLE_KEY) => createClient(config.API_URL, key, { auth: { persistSession: false } });
const admin = make(config.SERVICE_ROLE_KEY);
const bucket = "account-avatars";

await test("account profiles and photos persist and remain isolated to their owner", async () => {
  const users = [];
  const paths = [];
  try {
    for (let i = 0; i < 2; i++) {
      const email = `profile-${randomUUID()}@example.test`;
      const password = randomUUID();
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      assert.ifError(created.error);
      const client = make();
      users.push({ id: created.data.user.id, client, email, password });
      const provisioned = await admin.from("account_profiles").select("*").eq("user_id", created.data.user.id).single();
      assert.ifError(provisioned.error);
      assert.deepEqual(provisioned.data, { user_id: created.data.user.id, username: "", bio: "", avatar_path: null });
      assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
    }
    const [owner, other] = users;
    const profile = { user_id: owner.id, username: "swim.coach", bio: "Here for the team.", avatar_path: null };
    assert.ifError((await owner.client.from("account_profiles").upsert(profile)).error);
    const loaded = await owner.client.from("account_profiles").select("*").single();
    assert.ifError(loaded.error);
    assert.deepEqual(loaded.data, profile);
    assert.deepEqual((await other.client.from("account_profiles").select("*")).data.map(row => row.user_id), [other.id]);
    assert.ok((await make().from("account_profiles").select("*")).error);
    assert.ok((await other.client.from("account_profiles").upsert(profile)).error);
    assert.ok((await owner.client.from("account_profiles").update({ user_id: other.id }).eq("user_id", owner.id)).error);
    await other.client.from("account_profiles").update({ bio: "forged" }).eq("user_id", owner.id);
    assert.equal((await owner.client.from("account_profiles").select("bio").single()).data.bio, profile.bio);
    assert.ifError((await owner.client.auth.signOut()).error);
    assert.ifError((await owner.client.auth.signInWithPassword({ email: owner.email, password: owner.password })).error);
    assert.deepEqual((await owner.client.from("account_profiles").select("*").single()).data, profile, "Signing in preserves edited profiles");
    assert.ifError((await admin.from("account_profiles").delete().eq("user_id", other.id)).error);
    assert.ifError((await other.client.auth.signOut()).error);
    assert.ifError((await other.client.auth.signInWithPassword({ email: other.email, password: other.password })).error);
    assert.ifError((await other.client.from("account_profiles").select("*").single()).error);
    for (const invalid of [{ username: "<script>" }, { bio: "x".repeat(281) }, { avatar_path: `${other.id}/${randomUUID()}.png` }]) {
      assert.ok((await owner.client.from("account_profiles").update(invalid).eq("user_id", owner.id)).error);
    }

    const path = `${owner.id}/${randomUUID()}.png`;
    paths.push(path);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
    assert.ifError((await owner.client.storage.from(bucket).upload(path, png, { contentType: "image/png" })).error);
    assert.ifError((await owner.client.from("account_profiles").update({ avatar_path: path }).eq("user_id", owner.id)).error);
    const downloaded = await owner.client.storage.from(bucket).download(path);
    assert.ifError(downloaded.error);
    assert.deepEqual(Buffer.from(await downloaded.data.arrayBuffer()), png);
    assert.ok((await other.client.storage.from(bucket).download(path)).error);
    assert.ok((await make().storage.from(bucket).download(path)).error);
    assert.ok((await other.client.storage.from(bucket).upload(`${owner.id}/${randomUUID()}.png`, png, { contentType: "image/png" })).error);
    await other.client.storage.from(bucket).remove([path]);
    assert.ifError((await owner.client.storage.from(bucket).download(path)).error);
    assert.ok((await owner.client.storage.from(bucket).upload(`${owner.id}/${randomUUID()}.svg`, "<svg/>", { contentType: "image/svg+xml" })).error);
    const largePath = `${owner.id}/${randomUUID()}.png`;
    paths.push(largePath);
    assert.ifError((await owner.client.storage.from(bucket).upload(largePath, Buffer.concat([png, Buffer.alloc(6 * 1024 * 1024)]), { contentType: "image/png" })).error);
    assert.ifError((await owner.client.from("account_profiles").update({ username: "", bio: "", avatar_path: null }).eq("user_id", owner.id)).error);
    assert.ifError((await owner.client.storage.from(bucket).remove([path])).error);
    assert.ok((await owner.client.storage.from(bucket).download(path)).error);
  } finally {
    if (paths.length) await admin.storage.from(bucket).remove(paths);
    for (const user of users) {
      await user.client.auth.signOut();
      await admin.auth.admin.deleteUser(user.id);
    }
  }
});
