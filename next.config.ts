import type { NextConfig } from "next";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  // The build wrapper creates one identity for every Next build worker.
  // Generating a UUID here is unsafe: Next evaluates this config more than once.
  const version =
    phase === PHASE_DEVELOPMENT_SERVER
      ? "development"
      : (process.env.VELOCITY_BUILD_ID ?? "development");
  return {
    env: { NEXT_PUBLIC_VELOCITY_BUILD_ID: version },
    generateBuildId: async () => {
      // Unlike next typegen, a real build invokes this callback.
      if (phase === PHASE_PRODUCTION_BUILD && !process.env.VELOCITY_BUILD_ID) {
        throw new Error(
          "Use npm run build so all build workers share one website version.",
        );
      }
      return version;
    },
    // Required by the schedule calendar: bundling Temporal breaks node-ical.
    serverExternalPackages: ["node-ical"],
    distDir:
      process.env.VELOCITY_TEST_BUILD === "true"
        ? ".next-velocity-test"
        : ".next",
    // Local evidence, exports and credentials must never enter a frontend release.
    outputFileTracingExcludes: {
      "/*": [
        "./backups/**/*",
        "./db_*.json",
        "./export.csv",
        "./scripts/**/serviceAccountKey*.json",
        "./.env*",
        "./supabase/.env*",
        "./scripts/legacy-firebase/**/*",
        "./firebase/**/*",
      ],
    },
  };
}
