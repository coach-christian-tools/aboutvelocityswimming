import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

// Generate once in the parent process. Config reloads and Next's build workers
// inherit the same identity, including when rebuilding the same Git commit.
const result = spawnSync(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, VELOCITY_BUILD_ID: randomUUID() },
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
