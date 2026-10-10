import type { Database } from "@/lib/supabase/database.types";
export type Athlete = Database["public"]["Tables"]["public_athletes"]["Row"];
export type PublicRace = Database["public"]["Tables"]["public_swims"]["Row"];
export interface Race {
  id: string;
  athleteId: string;
  date: string;
  event: string;
  course: string;
  time: number;
  status: string;
  round: string;
  team: string;
  official: boolean | null;
  relay: boolean;
  meetId: string;
  meet: string;
}
export interface Filters {
  course: string;
  event: string;
  team: string;
  year: string;
  round: string;
  official: string;
}
export const initialFilters: Filters = {
  course: "SCY",
  event: "100_FR",
  team: "",
  year: "",
  round: "",
  official: "",
};
export const strokes: Record<string, string> = {
  FR: "Freestyle",
  BK: "Backstroke",
  BR: "Breaststroke",
  FL: "Butterfly",
  IM: "Individual medley",
};
export const rounds: Record<string, string> = {
  F: "Final",
  P: "Preliminary",
  S: "Semifinal",
  TT: "Time trial",
};
export function eventLabel(event: string) {
  const [distance, stroke] = event.split("_");
  return `${distance} ${strokes[stroke] ?? stroke}`;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function text(value: unknown) {
  return typeof value === "string" ? value : "";
}
export function athleteName(athlete: Athlete) {
  const name = object(object(athlete.data).name);
  return (
    [text(name.first), text(name.last)].filter(Boolean).join(" ") || athlete.id
  );
}
export function normalizeRace(row: PublicRace): Race {
  const d = object(row.data),
    meet = object(d.meet),
    code = text(d.eventCode).split("_");
  return {
    id: row.id,
    athleteId: row.athlete_id,
    date: row.swim_date,
    event: code.slice(0, 2).join("_"),
    course: text(d.course) || code[2] || "",
    time: typeof d.timeMs === "number" ? d.timeMs : 0,
    status: text(d.status),
    round: text(d.round),
    team: text(d.teamId),
    official: typeof d.isOfficial === "boolean" ? d.isOfficial : null,
    relay: d.isRelay === true,
    meetId: text(meet.id) || `${text(meet.name)}_${row.swim_date}`,
    meet: text(meet.name) || "Unnamed meet",
  };
}
export function validTime(race: Race) {
  return (
    race.status === "OK" &&
    Number.isFinite(race.time) &&
    race.time > 0 &&
    !race.relay
  );
}
export function matches(race: Race, filters: Filters) {
  return (
    !race.relay &&
    (!filters.course || race.course === filters.course) &&
    (!filters.event || race.event === filters.event) &&
    (!filters.team || race.team === filters.team) &&
    (!filters.year || race.date.startsWith(filters.year)) &&
    (!filters.round || race.round === filters.round) &&
    (!filters.official ||
      (filters.official === "official"
        ? race.official === true
        : race.official === false))
  );
}
export function bestTimes(races: Race[]) {
  const best = new Map<string, Race>();
  for (const race of races) {
    if (!validTime(race)) continue;
    const key = `${race.athleteId}:${race.event}:${race.course}`;
    const previous = best.get(key);
    if (
      !previous ||
      race.time < previous.time ||
      (race.time === previous.time && race.date > previous.date)
    )
      best.set(key, race);
  }
  return [...best.values()].sort(
    (a, b) => a.time - b.time || a.athleteId.localeCompare(b.athleteId),
  );
}
export function percentile(time: number, races: Race[]) {
  const valid = races.filter(validTime);
  if (!valid.length || !Number.isFinite(time) || time <= 0) return null;
  const faster = valid.filter((r) => r.time < time).length,
    tied = valid.filter((r) => r.time === time).length,
    slower = valid.length - faster - tied;
  return {
    value: ((slower + tied / 2) / valid.length) * 100,
    faster,
    tied,
    slower,
    count: valid.length,
    rank: faster + 1,
  };
}
export function rankedTimes(races: Race[]) {
  let rank = 0;
  return bestTimes(races).map((race, index, all) => {
    if (!index || race.time !== all[index - 1].time) rank = index + 1;
    return { race, rank };
  });
}
