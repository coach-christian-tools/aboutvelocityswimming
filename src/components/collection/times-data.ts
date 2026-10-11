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
  teamName?: string;
  gender?: string;
  ageAtSwim?: number | null;
  official: boolean | null;
  relay: boolean;
  relayLeg?: number | null;
  relayName?: string;
  relayAgeGroup?: string;
  split?: boolean;
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
  gender: string;
  ageGroups: string[];
  mode: "bests" | "performances";
  relay?: boolean;
}
export const initialFilters: Filters = {
  course: "SCY",
  event: "100_FR",
  team: "",
  year: "",
  round: "",
  official: "",
  gender: "",
  ageGroups: [],
  mode: "bests",
};
export const ageGroups: [string, string, number, number][] = [
  ["8&U", "8 & under", 0, 8],
  ["9-10", "9–10", 9, 10],
  ["11-12", "11–12", 11, 12],
  ["13-14", "13–14", 13, 14],
  ["15-16", "15–16", 15, 16],
  ["17-18", "17–18", 17, 18],
  ["19&O", "19 & over", 19, Infinity],
];
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
  return `${distance} ${stroke === "FR-R" ? "Freestyle relay" : stroke === "MED-R" ? "Medley relay" : (strokes[stroke] ?? stroke)}`;
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
    code = text(d.eventCode).split("_"),
    relay = object(d.relay),
    isRelay = d.isRelay === true,
    stroke = code[1]?.replace(/-R$/, "");
  return {
    id: row.id,
    athleteId: row.athlete_id,
    date: row.swim_date,
    event: isRelay
      ? `${code[0]}_${stroke === "MED" || stroke === "IM" ? "MED" : stroke}-R`
      : code.slice(0, 2).join("_"),
    course:
      text(d.course) ||
      code.find((part) => ["SCY", "LCM", "SCM"].includes(part)) ||
      "",
    time: typeof d.timeMs === "number" ? d.timeMs : 0,
    status: text(d.status),
    round: text(d.round),
    team: text(d.teamId),
    teamName: text(d.teamName),
    gender: ["M", "F", "X"].includes(text(d.gender)) ? text(d.gender) : "",
    ageAtSwim:
      typeof d.ageAtSwim === "number" &&
      Number.isInteger(d.ageAtSwim) &&
      d.ageAtSwim >= 0
        ? d.ageAtSwim
        : null,
    official: typeof d.isOfficial === "boolean" ? d.isOfficial : null,
    relay: isRelay,
    relayLeg: relay.leg == null ? null : Number(relay.leg),
    relayName: text(relay.teamName),
    relayAgeGroup: isRelay ? text(d.ageGroup) : "",
    split: d.isSplit === true || d.isRelaySplit === true,
    meetId: text(meet.id) || `${text(meet.name)}_${row.swim_date}`,
    meet: text(meet.name) || "Unnamed meet",
  };
}
export function validPerformance(race: Race) {
  return (
    race.status === "OK" &&
    Number.isFinite(race.time) &&
    race.time > 0 &&
    (!race.relay || race.relayLeg == null)
  );
}
export function validTime(race: Race) {
  return validPerformance(race) && !race.relay;
}
export function resultName(race: Race, names: Map<string, string>) {
  return race.relay
    ? race.relayName || `${race.teamName || "Team"} relay`
    : (names.get(race.athleteId) ?? race.athleteId);
}
export function raceAgeGroup(race: Race) {
  if (race.relay) return race.relayAgeGroup || "";
  return race.ageAtSwim == null
    ? ""
    : ageGroups.find(
        ([, , min, max]) => race.ageAtSwim! >= min && race.ageAtSwim! <= max,
      )?.[0] || "";
}
export function recordAgeGroups(races: Race[]): [string, string][] {
  const groups: [string, string][] = ageGroups.map(([key, label]) => [
    key,
    label,
  ]);
  const extra = [
    ...new Set(
      races
        .filter((race) => race.relay && validPerformance(race))
        .map(raceAgeGroup),
    ),
  ]
    .filter((key) => key && !groups.some(([id]) => id === key))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return [
    ...groups,
    ...extra.map((key): [string, string] => [
      key,
      key.replace("&U", " & under").replace("&O", " & over"),
    ]),
  ];
}
export function matches(race: Race, filters: Filters) {
  return (
    race.relay === (filters.relay ?? false) &&
    (!race.relay || race.relayLeg == null) &&
    (!filters.course || race.course === filters.course) &&
    (!filters.event || race.event === filters.event) &&
    (!filters.team || race.team === filters.team) &&
    (!filters.year || race.date.startsWith(filters.year)) &&
    (!filters.gender || race.gender === filters.gender) &&
    (!filters.ageGroups.length ||
      filters.ageGroups.includes(raceAgeGroup(race))) &&
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
export function rankedTimes(
  races: Race[],
  mode: Filters["mode"] = "bests",
  relay = false,
) {
  let rank = 0;
  const eligible =
    mode === "bests"
      ? bestTimes(races)
      : races
          .filter((race) =>
            relay ? race.relay && validPerformance(race) : validTime(race),
          )
          .toSorted((a, b) => a.time - b.time || a.id.localeCompare(b.id));
  return eligible.map((race, index, all) => {
    if (!index || race.time !== all[index - 1].time) rank = index + 1;
    return { race, rank };
  });
}

export function dailyBestTimes(races: Race[]) {
  const best = new Map<string, Race>();
  for (const race of races) {
    if (!validTime(race)) continue;
    const key = `${race.athleteId}:${race.event}:${race.course}:${race.date.slice(0, 10)}`;
    const previous = best.get(key);
    if (!previous || race.time < previous.time) best.set(key, race);
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const recordCourses = [
  ["SCY", "Short course yards"],
  ["LCM", "Long course meters"],
  ["SCM", "Short course meters"],
] as const;
export function recordKey(
  course: string,
  ageGroup: string,
  event: string,
  gender: string,
) {
  return `${course}:${ageGroup}:${event}:${gender}`;
}
export function teamRecords(races: Race[], team: string) {
  const records = new Map<string, Race[]>();
  if (!team) return records;
  for (const race of races) {
    if (
      race.team !== team ||
      !validPerformance(race) ||
      !["F", "M", "X"].includes(race.gender ?? "")
    )
      continue;
    const group = raceAgeGroup(race);
    if (!group) continue;
    const key = recordKey(race.course, group, race.event, race.gender!);
    const previous = records.get(key);
    if (!previous || race.time < previous[0].time) records.set(key, [race]);
    else if (race.time === previous[0].time) {
      const holder = race.relay
        ? -1
        : previous.findIndex((r) => r.athleteId === race.athleteId);
      if (holder === -1) previous.push(race);
      else if (race.date < previous[holder].date) previous[holder] = race;
    }
  }
  for (const holders of records.values())
    holders.sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.athleteId.localeCompare(b.athleteId),
    );
  return records;
}
export function recordEvents(course: string, races: Race[]) {
  const meters = course !== "SCY";
  const distances: Record<string, number[]> = {
    FR: meters
      ? [50, 100, 200, 400, 800, 1500]
      : [25, 50, 100, 200, 500, 1000, 1650],
    BK: meters ? [50, 100, 200] : [25, 50, 100, 200],
    BR: meters ? [50, 100, 200] : [25, 50, 100, 200],
    FL: meters ? [50, 100, 200] : [25, 50, 100, 200],
    IM: course === "LCM" ? [200, 400] : [100, 200, 400],
  };
  const events = new Set(
    Object.entries(distances).flatMap(([stroke, values]) =>
      values.map((distance) => `${distance}_${stroke}`),
    ),
  );
  for (const distance of course === "SCY"
    ? [100, 200, 400, 800]
    : [200, 400, 800])
    events.add(`${distance}_FR-R`);
  for (const distance of course === "SCY" ? [100, 200, 400] : [200, 400])
    events.add(`${distance}_MED-R`);
  for (const race of races)
    if (race.course === course && validPerformance(race))
      events.add(race.event);
  const strokeOrder = [...Object.keys(distances), "FR-R", "MED-R"];
  return [...events].sort((a, b) => {
    const [ad, ast] = a.split("_");
    const [bd, bst] = b.split("_");
    return (
      strokeOrder.indexOf(ast) - strokeOrder.indexOf(bst) ||
      Number(ad) - Number(bd) ||
      a.localeCompare(b)
    );
  });
}
