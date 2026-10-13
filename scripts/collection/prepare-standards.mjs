/** Prepare an edition against the public baseline. Does not stage or publish. */
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { validateStandard } from "../../src/components/collection/validate-standard.ts";
const [recordFile, evidenceFile, output] = process.argv.slice(2);
if (!output)
  throw new Error(
    "Usage: node --env-file=.env.collection.local scripts/collection/prepare-standards.mjs record.json evidence.json batch.json",
  );
const set = JSON.parse(await readFile(recordFile, "utf8"));
validateStandard(set, set.id);
const evidence = JSON.parse(await readFile(evidenceFile, "utf8"));
if (!evidence.sourceSha256 || !evidence.method)
  throw new Error("Source hash and extraction method required");
const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false } },
);
const { data, error } = await client
  .from("standards")
  .select("data")
  .eq("id", set.id)
  .maybeSingle();
if (error) throw error;
const path = `standards/${set.id}`;
const batch = {
  division: "times",
  scope: set.name,
  sourceUrl: set.sourceUrl,
  capturedAt: new Date().toISOString(),
  coverage: "complete",
  evidence,
  reads: [{ path, before: data?.data ?? null }],
  writes: [{ path, after: set }],
};
await writeFile(output, JSON.stringify(batch, null, 2) + "\n");
console.log(
  `Prepared ${set.name}; baseline ${data ? "existing edition" : "new edition"}. Nothing staged or published.`,
);
