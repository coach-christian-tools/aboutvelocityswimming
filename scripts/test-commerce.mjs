import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const output = mkdtempSync(join(tmpdir(), "velocity-commerce-"));
try {
  const compilation = spawnSync(process.execPath, [
    "node_modules/typescript/bin/tsc", "src/lib/commerce.ts", "--outDir", output,
    "--module", "commonjs", "--target", "ES2022", "--esModuleInterop", "--skipLibCheck", "--strict",
  ], { stdio: "inherit" });
  if (compilation.status !== 0) process.exitCode = compilation.status || 1;
  else {
    const tests = spawnSync(process.execPath, ["--test", "tests/commerce.test.mjs"], {
      stdio: "inherit", env: { ...process.env, COMMERCE_MODULE: join(output, "commerce.js") },
    });
    process.exitCode = tests.status ?? 1;
  }
} finally {
  rmSync(output, { recursive: true, force: true });
}
