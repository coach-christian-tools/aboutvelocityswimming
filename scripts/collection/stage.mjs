/** Stage a bounded, evidence-backed batch from this machine. Never publishes. */
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
const path = process.argv[2];
if (!path)
  throw new Error(
    "Usage: node --env-file=.env.collection.local scripts/collection/stage.mjs <batch.json>",
  );
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const token = process.env.VELOCITY_COLLECTOR_TOKEN;
if (!url || !key || !token)
  throw new Error(
    "Set the Supabase URL, publishable key, and scoped collector token in .env.collection.local.",
  );
const content = await readFile(path, "utf8");
if (Buffer.byteLength(content) > 2_000_000)
  throw new Error("Split collection into batches smaller than 2 MB.");
const batch = JSON.parse(content);
if (
  !Array.isArray(batch.writes) ||
  batch.writes.length < 1 ||
  batch.writes.length > 100
)
  throw new Error("A batch requires 1–100 proposed records.");
const client = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await client.rpc("stage_collection", {
  worker_token: token,
  batch,
});
if (error) throw new Error(error.message);
console.log(
  `Staged batch ${data}. Review at /tools/review. Nothing was published.`,
);
