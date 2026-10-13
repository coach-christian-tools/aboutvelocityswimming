/** Prepare complete captured editions with fresh published baselines; never stages. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const root = "research/expanded-standards-2026-10-13";
const manifest = JSON.parse(
  await readFile(`${root}/prepared-manifest.json`, "utf8"),
);
await mkdir(`${root}/batches`, { recursive: true });
for (const item of manifest.filter((item) => item.status === "prepared")) {
  const prefix = `${root}/prepared/${item.id}`;
  const raw = await readFile(`${prefix}.evidence.json`, "utf8");
  const { rows, ...evidence } = JSON.parse(raw);
  const record = JSON.parse(await readFile(`${prefix}.json`, "utf8"));
  let count = 0;
  for (const row of rows) {
    const cut = record.cuts[row.course][row.gender][row.ageGroup][
      row.eventCode
    ].cutsByTier.find((c) => c.tierName === row.tier);
    if (!cut || cut.timeMs !== row.timeMs)
      throw new Error(`Evidence mismatch: ${item.id}`);
    count++;
  }
  if (count !== item.cuts) throw new Error(`Coverage mismatch: ${item.id}`);
  evidence.coverage = {
    cuts: count,
    courses: Object.keys(record.cuts),
    pages: [...new Set(rows.map((row) => row.page))],
  };
  evidence.rowEvidenceFile = `${prefix}.evidence.json`;
  evidence.rowEvidenceSha256 = createHash("sha256").update(raw).digest("hex");
  evidence.sampleRows = rows.filter(
    (_, i) =>
      i === 0 ||
      i === rows.length - 1 ||
      i % Math.max(1, Math.floor(rows.length / 8)) === 0,
  );
  await writeFile(
    `${prefix}.batch-evidence.json`,
    JSON.stringify(evidence, null, 2) + "\n",
  );
  execFileSync(
    process.execPath,
    [
      "--env-file=.env.collection.local",
      "scripts/collection/prepare-standards.mjs",
      `${prefix}.json`,
      `${prefix}.batch-evidence.json`,
      `${root}/batches/${item.id}.json`,
    ],
    { stdio: "inherit" },
  );
}
