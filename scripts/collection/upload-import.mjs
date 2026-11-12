import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { assertCollectionTarget } from "./target.mjs";

const run = promisify(execFile);
const parser = fileURLToPath(new URL("./velocity_import.py", import.meta.url));
const maxRows = 100;
const maxBytes = 1_500_000; // Room for the database's JSONB representation under its 2 MB cap.
const exampleLimit = 12;
const inputErrors = new Set([
  "Collector access denied.",
  "Invalid import source or batch.",
  "Send 1–100 import rows per request.",
  "Row is outside the collector division.",
  "Invalid import row.",
  "Too many linked records in one import row.",
  "A catalog meet requires a title, valid start date, and HTTPS source.",
  "A meet requires a name.",
  "A result requires a valid identity, event, date, status, and time.",
  "Invalid or unrelated linked record.",
  "Invalid linked record ID.",
]);

export function splitImportBatches(batches) {
  return batches.flatMap(({ rows, ...metadata }) => {
    const output = [];
    const baseBytes = Buffer.byteLength(JSON.stringify({ ...metadata, rows: [] }));
    let bytes = baseBytes;
    let chunk = [];
    for (const row of rows) {
      const rowBytes = Buffer.byteLength(JSON.stringify(row));
      if (baseBytes + rowBytes > maxBytes) {
        throw new Error("A normalized row exceeds the import request size limit.");
      }
      if (chunk.length === maxRows || bytes + 1 + rowBytes > maxBytes) {
        output.push({ ...metadata, rows: chunk });
        chunk = [];
        bytes = baseBytes;
      }
      bytes += rowBytes + (chunk.length > 0 ? 1 : 0);
      chunk.push(row);
    }
    if (chunk.length) output.push({ ...metadata, rows: chunk });
    return output;
  });
}

function incrementReasons(counts, exceptions) {
  for (const { reason } of exceptions) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
}

function compactReasons(counts) {
  return Array.from(counts, ([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, exampleLimit);
}

export async function stageImportBatches({ client, workerToken, batches }) {
  const totals = { staged: 0, duplicates: 0, blocked: 0 };
  const batchIds = new Set();
  const exceptions = new Map();
  for (const [index, batch] of batches.entries()) {
    const { data, error } = await client.rpc("stage_velocity_import", {
      worker_token: workerToken,
      batch,
    }).abortSignal(AbortSignal.timeout(30_000));
    if (error) {
      const code = /^[A-Z\d]{5}$/.test(error.code ?? "") ? ` (${error.code})` : "";
      const description = inputErrors.has(error.message)
        ? error.message
        : "Rerun the same manifest to resume.";
      throw new Error(`Upload stopped at request ${index + 1} of ${batches.length}${code}. ${description}`);
    }
    if (!data || typeof data.batchId !== "string" || !Array.isArray(data.exceptions) ||
      !Object.keys(totals).every((key) => Number.isSafeInteger(data[key]) && data[key] >= 0)) {
      throw new Error("Upload returned an unexpected receipt. Rerun the same manifest to resume.");
    }
    batchIds.add(data.batchId);
    for (const key of Object.keys(totals)) totals[key] += data[key];
    incrementReasons(exceptions, data.exceptions);
  }
  return {
    ...totals,
    captureBatches: batchIds.size,
    batchIds: [...batchIds].slice(0, exampleLimit),
    exceptionExamples: compactReasons(exceptions),
  };
}

async function prepareCapture(manifest, mappings, output) {
  const args = [parser, manifest, "--output", output];
  if (mappings) args.push("--mappings", mappings);
  try {
    await run("python3", args);
  } catch (error) {
    throw new Error(error.stderr?.trim() || "Could not prepare the capture with Python 3.");
  }
  return JSON.parse(await readFile(output, "utf8"));
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean" },
      "dry-run": { type: "boolean" },
      mappings: { type: "string" },
      "local-report": { type: "string" },
    },
  });
  if (values.help) {
    console.log("npm run collection:import -- <manifest.json> [--mappings <reviewed.json>] [--dry-run] [--local-report <private.json>]");
    return;
  }
  if (positionals.length !== 1) throw new Error("Supply one manifest path. Use --help for the options.");
  const started = performance.now();
  const directory = await mkdtemp(join(tmpdir(), "velocity-import-"));
  try {
    const output = join(directory, "capture.json");
    const { project, batches, holds, duplicates } = await prepareCapture(positionals[0], values.mappings, output);
    const requests = splitImportBatches(batches);
    if (values["local-report"]) await copyFile(output, values["local-report"], constants.COPYFILE_EXCL);
    const examples = new Map();
    incrementReasons(examples, holds);
    const summary = {
      candidates: batches.reduce((count, batch) => count + batch.rows.length, 0),
      localExceptions: holds.length,
      localDuplicates: duplicates.length,
      localExceptionExamples: compactReasons(examples),
      requests: requests.length,
      payloadBytes: requests.reduce((count, batch) => count + Buffer.byteLength(JSON.stringify(batch)), 0),
      preparationMs: Math.round(performance.now() - started),
    };
    if (values["dry-run"] || requests.length === 0) {
      console.log(JSON.stringify({ ...summary, staged: 0, dryRun: Boolean(values["dry-run"]) }));
      return;
    }
    const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      VELOCITY_COLLECTOR_TOKEN: workerToken } = process.env;
    if (!url || !key || !workerToken) {
      throw new Error("Set the Supabase URL, publishable key, and scoped collector token in .env.collection.local.");
    }
    assertCollectionTarget({ evidence: { project } }, url);
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const uploading = performance.now();
    const result = await stageImportBatches({ client, workerToken, batches: requests });
    console.log(JSON.stringify({ ...summary, ...result, uploadMs: Math.round(performance.now() - uploading), review: "/tools/review" }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
