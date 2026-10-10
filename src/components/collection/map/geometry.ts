import type { Json } from "@/lib/supabase/database.types";
import { field, webUrl, type WikiEntry } from "../wiki";
import cities from "./city-centers.json";
export const boundarySource =
  "https://www.usaswimming.org/docs/default-source/governance/lsc-maps/lsc-zone-map.pdf";
export const citySource =
  "https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2025.html";
export type Location = {
  latitude: number;
  longitude: number;
  label: string;
  precision: "pool" | "city";
  sourceUrl: string;
};
export type DetailMap = {
  source: string;
  retrieved: string;
  viewBox: number[];
  paths: string[];
};
export type NationalMap = {
  source: string;
  zones: { id: string; name: string; paths: string[] }[];
  lines: string[];
  lscs: { id: string; code: string; page: number; x: number; y: number }[];
};
function object(
  value: Json | undefined,
): Record<string, Json | undefined> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}
export function teamLocations(team: WikiEntry): Location[] {
  const data = object(team.data);
  const locations = Array.isArray(data?.locations) ? data.locations : [];
  const approved = locations.flatMap((value) => {
    const loc = object(value);
    if (!loc) return [];
    const { latitude, longitude, label, precision, sourceUrl } = loc;
    if (
      typeof latitude !== "number" ||
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90 ||
      typeof longitude !== "number" ||
      !Number.isFinite(longitude) ||
      Math.abs(longitude) > 180 ||
      typeof label !== "string" ||
      !label.trim() ||
      (precision !== "pool" && precision !== "city") ||
      typeof sourceUrl !== "string" ||
      !webUrl(sourceUrl)
    )
      return [];
    return [{ latitude, longitude, label, precision, sourceUrl } as Location];
  });
  if (approved.length) return approved;
  // City estimates are derived only from the approved directory location, never from contact addresses.
  if (field(team.data, "lscId") !== "usa-lsc-ie") return [];
  return field(team.data, "geographicCoverage")
    .split(";")
    .flatMap((part) => {
      const match = Object.entries(cities).find(
        ([name]) =>
          name.toLowerCase().replace(/[^a-z,]/g, "") ===
          part
            .trim()
            .toLowerCase()
            .replace(/[^a-z,]/g, ""),
      );
      return match
        ? [
            {
              ...match[1],
              label: match[0],
              precision: "city" as const,
              sourceUrl: citySource,
            },
          ]
        : [];
    });
}
// Illustrative locator transform fitted to the ten numbered cities on official map page 18.
// Coordinates remain geographic in approved records; this transform is only a display adapter.
export function projectLocation(
  lscId: string,
  location: Location,
): [number, number] | null {
  if (lscId !== "usa-lsc-ie") return null;
  return [
    58.2986670509 * location.longitude +
      4.2834195469 * location.latitude +
      7164.8987609531,
    4.2022626214 * location.longitude -
      82.0685917857 * location.latitude +
      4580.2575012562,
  ];
}
export function inView(point: [number, number], view: number[]): boolean {
  return (
    point[0] >= view[0] &&
    point[0] <= view[0] + view[2] &&
    point[1] >= view[1] &&
    point[1] <= view[1] + view[3]
  );
}
