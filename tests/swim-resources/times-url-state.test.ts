import { describe, expect, it } from "vitest";
import { initialFilters } from "@/components/collection/times-data";
import {
  readTimesSelection,
  writeTimesSelection,
} from "@/components/collection/times-url-state";

describe("shared times selections", () => {
  it("round trips multi-selects, relay settings, empty selections and special characters", () => {
    const filters = {
      ...initialFilters,
      genders: [],
      ageGroups: ["8&U", "19&O"],
      team: "A & B",
      relay: true,
    };
    const url = new URL(
      "https://example.com/tools/times?source=shared#results",
    );
    const href = writeTimesSelection(url, "filters", filters, initialFilters);
    const shared = new URL(href, url);
    expect(
      readTimesSelection(shared.searchParams.get("filters"), initialFilters),
    ).toEqual(filters);
    expect(shared.searchParams.get("source")).toBe("shared");
    expect(shared.hash).toBe("#results");
  });

  it("keeps consecutive updates and removes defaults without losing other selections", () => {
    const url = new URL("https://example.com/tools/times");
    writeTimesSelection(url, "view", "meets", "rankings");
    writeTimesSelection(url, "meetCourse", "LCM", "");
    writeTimesSelection(url, "search", "Meet & Invitational", "");
    writeTimesSelection(url, "meetCourse", "", "");
    expect(url.searchParams.get("view")).toBe("meets");
    expect(url.searchParams.has("meetCourse")).toBe(false);
    expect(readTimesSelection(url.searchParams.get("search"), "")).toBe(
      "Meet & Invitational",
    );
  });

  it("rejects malformed shared state and invalid pagination", () => {
    for (const raw of [
      "{",
      "null",
      "[]",
      '{"genders":null}',
      JSON.stringify({ ...initialFilters, ageGroups: [null] }),
    ])
      expect(readTimesSelection(raw, initialFilters)).toEqual(initialFilters);
    for (const raw of ["-1", "1.5", "null", '"2"', "1e100"])
      expect(readTimesSelection(raw, 0)).toBe(0);
    expect(readTimesSelection("2", 0)).toBe(2);
    expect(readTimesSelection("false", true)).toBe(false);
  });
});
