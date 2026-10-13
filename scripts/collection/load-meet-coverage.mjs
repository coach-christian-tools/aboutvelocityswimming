/** Load capture receipts into the private staff ledger; never publishes meet facts. */
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const mode = args.find((arg) =>
  ["--local", "--staff", "--dry-run"].includes(arg),
);
const file = args.find((arg) => !arg.startsWith("--"));
if (!file || !mode || args.length !== 2) {
  throw new Error(
    "Usage: node scripts/collection/load-meet-coverage.mjs <database-coverage.json> <--dry-run|--local|--staff>",
  );
}
const content = await readFile(file, "utf8");
if (Buffer.byteLength(content) > 2_000_000)
  throw new Error("Coverage input must be smaller than 2 MB.");
const rows = JSON.parse(content);
const keys = [
  "id",
  "source_url",
  "year",
  "category",
  "scope",
  "checked_at",
  "status",
  "meet_count",
  "gaps",
];
if (!Array.isArray(rows) || !rows.length || rows.length > 1000)
  throw new Error("Supply 1–1000 coverage receipts.");
const ids = new Set();
const windows = new Set();
for (const row of rows) {
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row) ||
    Object.keys(row).some((key) => !keys.includes(key)) ||
    keys.some((key) => !(key in row))
  )
    throw new Error(
      "Every receipt must contain exactly the coverage table fields.",
    );
  if (
    typeof row.id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(row.id) ||
    ids.has(row.id)
  )
    throw new Error("Coverage IDs must be valid and unique.");
  ids.add(row.id);
  let source;
  try {
    source = new URL(row.source_url);
  } catch {
    throw new Error(`Invalid source URL for ${row.id}.`);
  }
  if (source.protocol !== "https:" || source.username || source.password)
    throw new Error(
      `Use an HTTPS source URL without credentials for ${row.id}.`,
    );
  if (
    !Number.isInteger(row.year) ||
    row.year < 1900 ||
    row.year > 2200 ||
    !["sanctioned", "approved", "observed", "unknown"].includes(row.category) ||
    typeof row.scope !== "string" ||
    !row.scope.trim() ||
    row.scope.length > 2000 ||
    typeof row.checked_at !== "string" ||
    !row.checked_at.includes("T") ||
    !Number.isFinite(Date.parse(row.checked_at)) ||
    !["not_checked", "partial", "complete", "blocked"].includes(row.status) ||
    !Number.isInteger(row.meet_count) ||
    row.meet_count < 0 ||
    !Array.isArray(row.gaps) ||
    row.gaps.length > 100 ||
    row.gaps.some(
      (gap) => typeof gap !== "string" || !gap.trim() || gap.length > 2000,
    )
  )
    throw new Error(`Invalid coverage fields for ${row.id}.`);
  const window = JSON.stringify([
    row.source_url,
    row.year,
    row.category,
    row.scope,
  ]);
  if (windows.has(window)) throw new Error("Coverage windows must be unique.");
  windows.add(window);
}
if (mode === "--dry-run") {
  console.log(
    `Validated ${rows.length} private coverage receipts. No data written.`,
  );
} else {
  let client;
  if (mode === "--local") {
    const config = JSON.parse(
      execFileSync("supabase", ["status", "--output", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
    if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(config.API_URL))
      throw new Error("Local ledger loading refuses hosted databases.");
    client = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  } else {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const token = process.env.VELOCITY_MEET_STAFF_ACCESS_TOKEN;
    if (!url || !key || !token)
      throw new Error(
        "Set Supabase URL, publishable key, and VELOCITY_MEET_STAFF_ACCESS_TOKEN for an authenticated staff session.",
      );
    client = createClient(url, key, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user)
      throw new Error("Staff authentication could not be verified.");
    const staff = await client.rpc("is_staff");
    if (staff.error || !staff.data)
      throw new Error(
        "Staff access is required to load private coverage receipts.",
      );
  }
  const { error } = await client
    .from("collection_coverage")
    .upsert(rows, { onConflict: "id" });
  if (error) throw new Error(error.message);
  console.log(
    `Loaded ${rows.length} private coverage receipts. Meet facts and review approvals were unchanged.`,
  );
}
