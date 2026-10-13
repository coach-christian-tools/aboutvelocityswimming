import { describe, it, expect } from "vitest";
import {
  standardFilters,
  defaultStandard,
  standardStatus,
  standardEventKeys,
  standardDiff,
} from "@/components/collection/standards-data";
import { validateStandard } from "@/components/collection/validate-standard";
import { eventColumn } from "@/components/collection/event-layout";
import { formatSwimTime } from "@/features/swim-resources/lib/domain/swim-time";
import type { StandardSet } from "@/features/swim-resources/types/schema";
import { currentStandard } from "@/features/swim-resources/lib/domain/standards";
const set: StandardSet = {
  id: "test",
  name: "Test",
  category: "motivational",
  governingBody: "USA_Swimming",
  seasonYears: "2024–2028",
  effectiveDate: "2024-09-01",
  expirationDate: "2028-08-31",
  sourceUrl: "https://example.test/standards",
  cuts: {
    SCY: {
      F: {
        "10&U": {
          "50_FR_SCY": {
            cutsByTier: [
              { tierName: "B", timeMs: 39790, timeDisplay: "39.79" },
            ],
          },
        },
        "11-12": {
          "200_MED-R_SCY": {
            cutsByTier: [
              { tierName: "A", timeMs: 138190, timeDisplay: "2:18.19" },
            ],
          },
        },
      },
    },
    LCM: {
      M: {
        Open: {
          "50_FR_LCM": {
            cutsByTier: [
              { tierName: "Qualifying", timeMs: 25000, timeDisplay: "25.00" },
            ],
          },
        },
      },
    },
  },
};
describe("standards reference", () => {
  it("defaults and resolves only exact cuts", () => {
    const f = standardFilters(set);
    expect(f.selection).toEqual({
      course: "SCY",
      gender: "F",
      age: "10&U",
      tier: "B",
    });
    expect(f.events["50_FR_SCY"].cutsByTier[0].timeMs).toBe(39790);
    expect(f.events["200_MED-R_SCY"]).toBeUndefined();
  });
  it("preserves supported selections and resets dependent unavailable options", () => {
    expect(
      standardFilters(set, {
        course: "LCM",
        gender: "F",
        age: "10&U",
        tier: "B",
      }).selection,
    ).toEqual({ course: "LCM", gender: "M", age: "Open", tier: "Qualifying" });
    expect(
      standardFilters(set, { age: "11-12", tier: "A" }).selection.age,
    ).toBe("11-12");
  });
  it("shows missing events and relay columns without conversions", () => {
    expect(standardEventKeys(set, "SCY")).toContain("200_MED-R_SCY");
    expect(eventColumn("200_MED-R_SCY")).toBe("IM");
    expect(eventColumn("800_FR-R_LCM")).toBe("DST");
    expect(standardEventKeys(set, "LCM")).toEqual(["50_FR_LCM"]);
  });
  it("selects current motivational editions and labels expired/upcoming", () => {
    const old = { ...set, id: "old", expirationDate: "2024-01-01" };
    expect(defaultStandard([old, set], "2026-10-13")?.id).toBe("test");
    expect(standardStatus(old, "2026-10-13")).toBe("Expired");
    expect(standardStatus(set, "2020-01-01")).toBe("Upcoming");
  });
  it("keeps specialized motivational editions out of the default athlete benchmark", () => {
    const para: StandardSet = {
      ...set,
      id: "para",
      standardType: "para",
      effectiveDate: "2024-10-29",
    };
    const single: StandardSet = {
      ...para,
      id: "single",
      standardType: "single-age",
    };
    expect(defaultStandard([para, single, set], "2026-10-13")?.id).toBe(set.id);
    expect(
      currentStandard([para, single, set], "motivational", "2026-10-13")?.id,
    ).toBe(set.id);
    expect(
      currentStandard([para, single], "motivational", "2026-10-13"),
    ).toBeNull();
  });
  it("reports added, changed and removed cuts", () => {
    const next = structuredClone(set);
    next.cuts.SCY!.F!["10&U"]!["50_FR_SCY"].cutsByTier[0].timeMs = 40000;
    delete next.cuts.LCM;
    expect(standardDiff(set, next)).toHaveLength(2);
    expect(standardDiff(null, set)).toHaveLength(3);
    expect(formatSwimTime(119999)).toBe("2:00.00");
  });
  it("validates source, dates, identity, course, times and duplicate tiers", () => {
    expect(() => validateStandard(set, "test")).not.toThrow();
    for (const change of [
      (s: StandardSet) => (s.expirationDate = "2024-02-30"),
      (s: StandardSet) => (s.sourceUrl = "javascript:alert(1)"),
      (s: StandardSet) => (s.id = "other"),
      (s: StandardSet) =>
        (s.cuts.SCY!.F!["10&U"]!["50_FR_SCY"].cutsByTier[0].timeMs = 0),
      (s: StandardSet) =>
        s.cuts.SCY!.F!["10&U"]!["50_FR_SCY"].cutsByTier.push(
          s.cuts.SCY!.F!["10&U"]!["50_FR_SCY"].cutsByTier[0],
        ),
    ]) {
      const broken = structuredClone(set);
      change(broken);
      expect(() => validateStandard(broken, "test")).toThrow();
    }
  });
});
