import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  inView,
  projectLocation,
  teamLocations,
  type DetailMap,
  type NationalMap,
} from "@/components/collection/map/geometry";
import type { WikiEntry } from "@/components/collection/wiki";
const team: WikiEntry = {
  id: "team",
  kind: "team",
  title: "Team",
  parent_id: null,
  source_url: "https://example.com",
  updated_at: "2026-10-10",
  starts_on: null,
  ends_on: null,
  effective_from: null,
  effective_until: null,
  data: { lscId: "usa-lsc-ie", geographicCoverage: "Wenatchee, WA" },
};
const detail: DetailMap = JSON.parse(
  readFileSync("public/maps/swimming/lsc/ie.json", "utf8"),
);
describe("Wiki map location integrity", () => {
  it("labels city fallbacks as estimates and projects Wenatchee inside the LSC viewport", () => {
    const [location] = teamLocations(team);
    expect(location.precision).toBe("city");
    const point = projectLocation("usa-lsc-ie", location)!;
    expect(inView(point, detail.viewBox)).toBe(true);
    expect(point[0]).toBeCloseTo(353, -1);
    expect(point[1]).toBeCloseTo(179, -1);
  });
  it("supports multiple listed cities, including punctuation variants", () => {
    const locations = teamLocations({
      ...team,
      data: {
        lscId: "usa-lsc-ie",
        geographicCoverage:
          "Coeur D' Alene, ID; Spokane, WA; surrounding communities",
      },
    });
    expect(locations).toHaveLength(2);
  });
  it("prefers reviewed geographic pool locations with safe evidence links", () => {
    const location = {
      latitude: 47.43,
      longitude: -120.32,
      label: "Public pool",
      precision: "pool",
      sourceUrl: "https://example.com/pool",
    };
    expect(
      teamLocations({
        ...team,
        data: { ...(team.data as object), locations: [location] },
      }),
    ).toEqual([location]);
  });
  it("rejects invalid coordinates and unsafe source links", () => {
    expect(
      teamLocations({
        ...team,
        data: {
          locations: [
            {
              latitude: 95,
              longitude: 0,
              label: "Bad",
              precision: "pool",
              sourceUrl: "https://example.com",
            },
            {
              latitude: 47,
              longitude: -120,
              label: "Bad source",
              precision: "pool",
              sourceUrl: "javascript:alert(1)",
            },
          ],
        },
      }),
    ).toEqual([]);
  });
  it("does not infer pool locations from private/contact addresses or fabricate unsupported projections", () => {
    expect(
      teamLocations({ ...team, data: { address: "Wenatchee, WA" } }),
    ).toEqual([]);
    expect(projectLocation("usa-lsc-pn", teamLocations(team)[0])).toBeNull();
  });
  it("ships four zones and a finite, nonempty boundary asset for every official LSC label", () => {
    const national: NationalMap = JSON.parse(
      readFileSync("public/maps/swimming/national.json", "utf8"),
    );
    expect(national.zones).toHaveLength(4);
    expect(national.lscs).toHaveLength(59);
    expect(new Set(national.lscs.map((item) => item.id)).size).toBe(59);
    for (const file of readdirSync("public/maps/swimming/lsc")) {
      const map: DetailMap = JSON.parse(
        readFileSync(`public/maps/swimming/lsc/${file}`, "utf8"),
      );
      expect(map.paths.length, file).toBeGreaterThan(0);
      expect(map.viewBox.every(Number.isFinite), file).toBe(true);
      expect(map.viewBox[2], file).toBeGreaterThan(0);
    }
  });
});
