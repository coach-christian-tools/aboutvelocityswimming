import test from "node:test";
import assert from "node:assert/strict";
import { handleReminders } from "../supabase/functions/shift-reminders/worker.mjs";
const request = (secret) =>
  new Request("http://local/shift-reminders", {
    method: "POST",
    headers: { "x-cron-secret": secret },
  });
await test("reminder worker rejects forged calls and suppresses outbound test email", async () => {
  let calls = 0,
    deliveries = 0;
  const client = {
    rpc: async (_name, args) => {
      calls++;
      assert.equal(args.dry_run, true);
      return { data: [{}] };
    },
  };
  const config = {
    secret: "synthetic-secret",
    enabled: false,
    client,
    deliver: () => {
      deliveries++;
    },
  };
  assert.equal((await handleReminders(request("wrong"), config)).status, 401);
  assert.equal(calls, 0);
  const response = await handleReminders(request("synthetic-secret"), config);
  assert.deepEqual(await response.json(), { suppressed: true, eligible: 1 });
  assert.equal(deliveries, 0);
});
await test("reminder delivery uses durable idempotency and acknowledges only confirmed sends", async () => {
  const calls = [];
  const reminder = {
    registrationId: "test",
    date: "2026-10-11",
    emails: ["family@example.test"],
    name: "Avery",
    title: "Setup",
    when: "2026-10-11T18:00:00Z",
    key: "immutable-key",
  };
  const client = {
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data: name === "claim_shift_reminders" ? [reminder] : null };
    },
  };
  const config = {
    secret: "secret",
    enabled: true,
    client,
    apiKey: "synthetic",
    from: "test@example.test",
    deliver: async (_url, options) => {
      assert.equal(options.headers["Idempotency-Key"], "immutable-key");
      assert.match(JSON.parse(options.body).text, /Pacific/);
      return Response.json({ id: "provider-receipt" });
    },
  };
  assert.equal((await handleReminders(request("secret"), config)).status, 200);
  assert.equal(calls[1][1].delivery_id, "provider-receipt");
  config.deliver = async () => new Response("", { status: 503 });
  assert.equal((await handleReminders(request("secret"), config)).status, 503);
  assert.match(calls.at(-1)[1].failure, /503/);
});
