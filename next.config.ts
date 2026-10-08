import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required by the schedule calendar: bundling Temporal breaks node-ical.
  serverExternalPackages: ["node-ical"],
  distDir: process.env.WORKSHARE_TEST_BUILD === "true" ? ".next-workshare-test" : ".next",
  // Local evidence, exports and credentials must never enter a frontend release.
  outputFileTracingExcludes: {
    "/*": ["./backups/**/*", "./db_*.json", "./export.csv", "./scripts/**/serviceAccountKey*.json", "./.env*"],
  },
};

export default nextConfig;
