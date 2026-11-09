import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
// Explicitly target only this repository's local Supabase container.
const project = readFileSync("supabase/config.toml", "utf8").match(
  /^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m,
)?.[1];
assert.ok(project, "A local Supabase project is required.");
execFileSync(
  "docker",
  [
    "exec",
    "-i",
    `supabase_db_${project}`,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  {
    input: readFileSync("tests/observatory.integration.sql"),
    stdio: ["pipe", "inherit", "inherit"],
  },
);
console.log(
  "Passed: archive filters, count reconciliation, pagination, import dates, and public read permissions. Fixtures rolled back.",
);
