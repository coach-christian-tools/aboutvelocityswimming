import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const output = mkdtempSync(join(tmpdir(), "velocity-calendar-tests-"));
try {
  symlinkSync(resolve("node_modules"), join(output, "node_modules"), "dir");
  const compilation = spawnSync(process.execPath, [
    "node_modules/typescript/bin/tsc", "src/lib/calendar.ts", "src/lib/calendar-shared.ts", "--outDir", output,
    "--module", "commonjs", "--target", "ES2022", "--esModuleInterop", "--skipLibCheck", "--strict",
  ], { stdio: "inherit" });
  if (compilation.status !== 0) process.exitCode = compilation.status || 1;
  else {
    for (const timezone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
      const tests = spawnSync(process.execPath, ["--test", "tests/calendar.test.mjs"], {
        stdio: "inherit", env: { ...process.env, TZ: timezone, CALENDAR_MODULE_DIR: output },
      });
      if (tests.status !== 0) process.exitCode = tests.status || 1;
    }
  }
} finally { rmSync(output, { recursive: true, force: true }); }
