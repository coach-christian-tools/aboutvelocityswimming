import { describe, expect, it } from "vitest";
import { isStaffRoute } from "@/lib/staff-routes";

describe("staff navigation boundaries", () => {
  it("includes the meet queue and existing staff descendants", () => {
    for (const path of [
      "/tools/review",
      "/tools/review/meets",
      "/tools/review/meets/history",
      "/tools/swim-resources/admin/import",
      "/tools/swim-resources/attendance/admin",
      "/tools/workshare/admin/jobs",
    ]) {
      expect(isStaffRoute(path), path).toBe(true);
    }
  });

  it("preserves public tools and does not match similar route prefixes", () => {
    for (const path of [
      "/",
      "/tools",
      "/tools/knowledge",
      "/tools/swim-resources/attendance",
      "/tools/reviewer",
      "/tools/swim-resources/administer",
    ]) {
      expect(isStaffRoute(path), path).toBe(false);
    }
  });
});
