import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
const env = { ...process.env, VELOCITY_TEST_BUILD: "true" };
for (const line of readFileSync("supabase/.env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
}
if (env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321")
  throw new Error("Local wrapper refuses hosted backends.");
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", ...process.argv.slice(2)],
  { stdio: "inherit", env },
);
child.on("exit", (code) => process.exit(code ?? 1));
