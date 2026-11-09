import type { Race } from "@/components/collection/times-data";

export interface ArchiveFilters {
  search: string;
  year: string;
  team: string;
  course: string;
  meet: string;
  athlete: string;
  athleteOffset: number;
  resultOffset: number;
}
export interface ArchiveMeet {
  id: string;
  name: string;
  date: string;
  last_date: string;
  count: number;
  athletes: number;
  courses: string[];
}
export interface ArchivePoint {
  date: string;
  count: number;
}
export interface ArchiveAthlete {
  id: string;
  name: string;
  count: number;
  first: string;
  last: string;
  meets: number;
  months: ArchivePoint[];
  teams: { id: string; count: number }[];
}
export interface ArchiveData {
  totals: {
    swims: number;
    meets: number;
    athletes: number;
    first: string | null;
    last: string | null;
    unknownImports: number;
  };
  facets: { years: string[]; teams: { id: string; name: string }[] };
  years: { id: string; count: number; meets: number }[];
  meets: ArchiveMeet[];
  athletes: ArchiveAthlete[];
  raceGrowth: ArchivePoint[];
  importGrowth: ArchivePoint[];
  results: Race[];
}
export function archiveFilters(params: URLSearchParams): ArchiveFilters {
  const text = (key: string, max = 200) => {
    const value = (params.get(key) ?? "").trim();
    if (value.length > max || /[\u0000-\u001f]/.test(value))
      throw new Error("Invalid archive filter.");
    return value;
  };
  const year = text("year"),
    course = text("course");
  if (year && !/^\d{4}$/.test(year)) throw new Error("Choose a valid year.");
  if (!["", "SCY", "SCM", "LCM"].includes(course))
    throw new Error("Choose a valid course.");
  const offset = (key: string) => {
    const value = Number(params.get(key) ?? 0);
    if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000)
      throw new Error("Invalid archive page.");
    return value;
  };
  return {
    search: text("search", 100),
    year,
    team: text("team"),
    course,
    meet: text("meet"),
    athlete: text("athlete"),
    athleteOffset: offset("athleteOffset"),
    resultOffset: offset("resultOffset"),
  };
}

export const archiveColors = [
  "#57dac0",
  "#5aafe5",
  "#b6a0ed",
  "#eac67b",
  "#79c7cf",
  "#eb9d9f",
  "#a6cf83",
];
export function archiveColor(key: string) {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return archiveColors[hash % archiveColors.length];
}

/** Balanced binary treemap: area is exactly proportional to count. */
export function archiveTreemap<T extends { count: number }>(
  items: T[],
  width = 1000,
  height = 540,
): (T & { x: number; y: number; w: number; h: number })[] {
  const rows = items
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
  function partition(
    values: T[],
    x: number,
    y: number,
    w: number,
    h: number,
  ): (T & { x: number; y: number; w: number; h: number })[] {
    if (!values.length) return [];
    if (values.length === 1) return [{ ...values[0], x, y, w, h }];
    const total = values.reduce((sum, item) => sum + item.count, 0);
    let at = 1,
      sum = values[0].count;
    while (at < values.length - 1 && sum + values[at].count / 2 < total / 2)
      sum += values[at++].count;
    const ratio = sum / total;
    return w >= h
      ? [
          ...partition(values.slice(0, at), x, y, w * ratio, h),
          ...partition(values.slice(at), x + w * ratio, y, w * (1 - ratio), h),
        ]
      : [
          ...partition(values.slice(0, at), x, y, w, h * ratio),
          ...partition(values.slice(at), x, y + h * ratio, w, h * (1 - ratio)),
        ];
  }
  return partition(rows, 0, 0, width, height);
}

/** Include empty calendar months so gaps retain their real duration. */
export function archiveMonths(
  first: string | null,
  last: string | null,
): string[] {
  if (!first || !last) return [];
  const start = Number(first.slice(0, 4)) * 12 + Number(first.slice(5, 7)) - 1;
  const end = Number(last.slice(0, 4)) * 12 + Number(last.slice(5, 7)) - 1;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start ||
    end - start > 2400
  )
    return [];
  return Array.from(
    { length: end - start + 1 },
    (_, i) =>
      `${Math.floor((start + i) / 12)}-${String(((start + i) % 12) + 1).padStart(2, "0")}`,
  );
}
