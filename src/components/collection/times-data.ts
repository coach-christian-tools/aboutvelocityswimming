import type { Database } from "@/lib/supabase/database.types";
export type Athlete = Database["public"]["Tables"]["public_athletes"]["Row"];
export type PublicRace = Pick<
  Database["public"]["Tables"]["public_swims"]["Row"],
  "id" | "athlete_id" | "swim_date" | "data"
>;
export interface RelayMember {
  leg: number;
  athleteId?: string;
  name: string;
  gender?: string;
  stroke?: string;
  timeMs?: number;
  leadOffEligible?: boolean;
}
export interface RaceSplit {
  distance: number;
  cumulativeMs: number;
  lapMs?: number;
}
export interface Race {
  id: string;
  athleteId: string;
  athleteName?: string;
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
  members?: RelayMember[];
  splits?: RaceSplit[];
  splitCoverage?: "complete" | "partial" | "unavailable";
  lineupCoverage?: "complete" | "partial" | "unavailable";
  resultOrigin?: "relay_leadoff";
  parentRelayResultId?: string;
}
export interface Filters {
  course: string;
  event: string;
  team: string;
  year: string;
  round: string;
  official: string;
  genders: string[];
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
  genders: ["F"],
  ageGroups: [],
  mode: "bests",
  relay: false,
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
// Keep the primary age buckets separate from the overlapping filter groups.
// Athlete scoring and motivational standards still use the primary buckets.
export const timesAgeGroups: [string, string][] = [
  ...ageGroups.map(([key, label]): [string, string] => [key, label]),
  ["10&U", "10 & Under"],
  ["12&U", "12 & Under"],
  ["13&O", "13 & Over"],
  ["15&O", "15 & Over"],
  ["Open", "Open"],
];
function ageRange(group: string): [number, number] | null {
  const key = group.replace(/\s/g, "").toUpperCase();
  if (key === "OPEN") return [0, Infinity];
  const range = /^(\d{1,3})[-–](\d{1,3})$/.exec(key);
  if (range && Number(range[1]) <= Number(range[2]))
    return [Number(range[1]), Number(range[2])];
  const bound = /^(\d{1,3})&(U|O)$/.exec(key);
  return bound
    ? bound[2] === "U"
      ? [0, Number(bound[1])]
      : [Number(bound[1]), Infinity]
    : null;
}
export function matchesAgeGroup(race: Race, group: string) {
  const range = ageRange(group);
  if (!race.relay)
    return Boolean(
      range &&
      race.ageAtSwim != null &&
      race.ageAtSwim >= range[0] &&
      race.ageAtSwim <= range[1],
    );
  const reported = race.relayAgeGroup || "";
  if (!reported) return false;
  if (reported === group) return true;
  const relayRange = ageRange(reported);
  // A relay category must fit entirely inside the selected category.
  return Boolean(
    range &&
    relayRange &&
    relayRange[0] >= range[0] &&
    relayRange[1] <= range[1],
  );
}
export function relayMemberName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || "Unreported";
  return `${parts[0]} ${Array.from(parts.at(-1)!)[0]}.`;
}
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
  const race: Race = {
    id: row.id,
    athleteId: isRelay && relay.leg == null ? "" : row.athlete_id,
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
    relayName:
      text(relay.teamName) ||
      text(d.relayName) ||
      (isRelay ? text(d.teamName) : ""),
    relayAgeGroup: isRelay ? text(d.ageGroup) : "",
    split: d.isSplit === true || d.isRelaySplit === true,
    meetId: text(meet.id) || `${text(meet.name)}_${row.swim_date}`,
    meet: text(meet.name) || "Unnamed meet",
    ...(Array.isArray(d.members)
      ? {
          members: d.members
            .flatMap((value) => {
              const member = object(value);
              if (
                !Number.isInteger(member.leg) ||
                Number(member.leg) < 1 ||
                Number(member.leg) > 4
              )
                return [];
              return [
                {
                  leg: Number(member.leg),
                  name: text(member.name),
                  ...(text(member.athleteId)
                    ? { athleteId: text(member.athleteId) }
                    : {}),
                  ...(["M", "F", "X"].includes(text(member.gender))
                    ? { gender: text(member.gender) }
                    : {}),
                  ...(text(member.stroke)
                    ? { stroke: text(member.stroke) }
                    : {}),
                  ...(typeof member.timeMs === "number" &&
                  Number.isFinite(member.timeMs) &&
                  member.timeMs > 0
                    ? { timeMs: member.timeMs }
                    : {}),
                  ...(typeof member.leadOffEligible === "boolean"
                    ? { leadOffEligible: member.leadOffEligible }
                    : {}),
                },
              ];
            })
            .sort((a, b) => a.leg - b.leg),
        }
      : {}),
    splits: Array.isArray(d.splits)
      ? d.splits
          .flatMap((value) => {
            const split = object(value);
            if (
              typeof split.distance !== "number" ||
              !Number.isFinite(split.distance) ||
              split.distance <= 0 ||
              typeof split.cumulativeMs !== "number" ||
              !Number.isFinite(split.cumulativeMs) ||
              split.cumulativeMs <= 0
            )
              return [];
            return [
              {
                distance: split.distance,
                cumulativeMs: split.cumulativeMs,
                ...(typeof split.lapMs === "number" &&
                Number.isFinite(split.lapMs) &&
                split.lapMs > 0
                  ? { lapMs: split.lapMs }
                  : {}),
              },
            ];
          })
          .sort((a, b) => a.distance - b.distance)
      : [],
    splitCoverage: ["complete", "partial", "unavailable"].includes(
      text(d.splitCoverage),
    )
      ? (d.splitCoverage as Race["splitCoverage"])
      : "unavailable",
    ...(d.resultOrigin === "relay_leadoff"
      ? { resultOrigin: "relay_leadoff" as const }
      : {}),
    ...(text(d.parentRelayResultId)
      ? { parentRelayResultId: text(d.parentRelayResultId) }
      : {}),
  };
  if (isRelay) race.lineupCoverage = relayLineupCoverage(race.members);
  return race;
}
export function validPerformance(race: Race) {
  return (
    race.status === "OK" &&
    Number.isFinite(race.time) &&
    race.time > 0 &&
    !race.split &&
    (!race.relay || race.relayLeg == null)
  );
}
export function validTime(race: Race) {
  return validPerformance(race) && !race.relay;
}
export function resultName(race: Race, names: Map<string, string>) {
  return race.relay
    ? race.relayName && /^[A-Z]$/.test(race.relayName)
      ? `${race.teamName || "Team"} ${race.relayName}`
      : race.relayName || `${race.teamName || "Team"} relay`
    : race.athleteName || names.get(race.athleteId) || race.athleteId;
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
  const groups: [string, string][] = [...timesAgeGroups];
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
    (!filters.genders.length || filters.genders.includes(race.gender || "")) &&
    (!filters.ageGroups.length ||
      filters.ageGroups.some((group) => matchesAgeGroup(race, group))) &&
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
    mode === "bests" && !relay
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
  const groups = recordAgeGroups(races);
  for (const race of races) {
    if (
      race.team !== team ||
      !validPerformance(race) ||
      !["F", "M", "X"].includes(race.gender ?? "")
    )
      continue;
    for (const [group] of groups) {
      if (!matchesAgeGroup(race, group)) continue;
      const key = recordKey(race.course, group, race.event, race.gender!);
      const previous = records.get(key);
      if (!previous || race.time < previous[0].time) records.set(key, [race]);
      else if (race.time === previous[0].time) {
        const holder = race.relay
          ? previous.findIndex((r) => r.id === race.id)
          : previous.findIndex((r) => r.athleteId === race.athleteId);
        if (holder === -1) previous.push(race);
        else if (race.date < previous[holder].date) previous[holder] = race;
      }
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

export function groupedEvents(options: [string, string][]) {
  const order = ["FR", "BK", "BR", "FL", "IM", "FR-R", "MED-R"];
  const labels: Record<string, string> = {
    FR: "Freestyle",
    BK: "Backstroke",
    BR: "Breaststroke",
    FL: "Butterfly",
    IM: "Individual Medley",
    "FR-R": "Freestyle Relays",
    "MED-R": "Medley Relays",
  };
  const keys = [
    ...new Set(options.map(([event]) => event.split("_")[1] || "Other")),
  ].sort(
    (a, b) =>
      (order.includes(a) ? order.indexOf(a) : 99) -
        (order.includes(b) ? order.indexOf(b) : 99) || a.localeCompare(b),
  );
  return keys.map((key) => ({
    label: labels[key] || "Other events",
    options: options
      .filter(([event]) => event.split("_")[1] === key)
      .sort(
        ([a], [b]) =>
          Number(a.split("_")[0]) - Number(b.split("_")[0]) ||
          a.localeCompare(b),
      ),
  }));
}

/** Event options follow the selected course and result category. */
export function timesEvents(course: string, relay = false) {
  const courses = course ? [course] : recordCourses.map(([key]) => key);
  return [...new Set(courses.flatMap((key) => recordEvents(key, [])))].filter(
    (event) => event.endsWith("-R") === relay,
  );
}
export function changeResultCategory(
  filters: Filters,
  relay: boolean,
  allEvents = false,
): Filters {
  return {
    ...filters,
    relay,
    event: allEvents ? "" : relay ? "200_FR-R" : "100_FR",
    mode: relay ? "performances" : "bests",
    ageGroups: [],
    genders: relay
      ? filters.genders
      : filters.genders.filter((gender) => gender !== "X"),
  };
}
export function changeTimesCourse(filters: Filters, course: string): Filters {
  const options = timesEvents(course, filters.relay);
  return {
    ...filters,
    course,
    event:
      !filters.event || options.includes(filters.event)
        ? filters.event
        : (options[0] ?? ""),
  };
}

/** Complete coverage includes all four reported members and their athlete links. */
export function relayLineupCoverage(
  members: RelayMember[] = [],
): NonNullable<Race["lineupCoverage"]> {
  const count = new Set(
    members
      .filter(
        (member) =>
          Number.isInteger(member.leg) &&
          member.leg >= 1 &&
          member.leg <= 4 &&
          member.name.trim(),
      )
      .map((member) => member.leg),
  ).size;
  const linkedLegs = new Set(
    members
      .filter(
        (member) =>
          Number.isInteger(member.leg) &&
          member.leg >= 1 &&
          member.leg <= 4 &&
          member.name.trim() &&
          member.athleteId?.trim(),
      )
      .map((member) => member.leg),
  ).size;
  return count === 4 && linkedLegs === 4
    ? "complete"
    : count
      ? "partial"
      : "unavailable";
}
