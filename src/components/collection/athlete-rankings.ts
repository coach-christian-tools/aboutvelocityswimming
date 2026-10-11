import { ageGroups, raceAgeGroup, validTime, type Race } from "./times-data";
import type { StandardSet } from "@/features/swim-resources/types/schema";

export interface AthleteRankingOptions {
  team: string;
  course: string;
  period: "recent" | "all";
  today: string;
}
export interface ScoredEvent {
  race: Race;
  standardTime: number;
  score: number;
}
export interface RankedAthlete {
  id: string;
  name: string;
  ageGroup: string;
  gender: string;
  latestDate: string;
  score: number | null;
  rank?: number;
  status: "ranked" | "provisional" | "unscored";
  events: ScoredEvent[];
  reasons: string[];
}
export interface AthleteRankingGroup {
  ageGroup: string;
  label: string;
  gender: string;
  athletes: RankedAthlete[];
}
export function twelveMonthsAgo(today: string) {
  const [year, month, day] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  return `${year - 1}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

/** Public results are the only source of affiliation and demographics. */
export function athleteRankings(
  races: Race[],
  names: Map<string, string>,
  standard: StandardSet | null,
  options: AthleteRankingOptions,
): AthleteRankingGroup[] {
  if (!options.team) return [];
  const cutoff = twelveMonthsAgo(options.today);
  const individual = races.filter(
    (r) =>
      !r.relay &&
      r.relayLeg == null &&
      !r.split &&
      r.date.slice(0, 10) <= options.today,
  );
  const buckets = new Map<
    string,
    {
      rows: Race[];
      ageGroup: string;
      gender: string;
      conflict: boolean;
      latestDate: string;
    }
  >();
  if (options.period === "recent") {
    const byAthlete = new Map<string, Race[]>();
    for (const r of individual) {
      if (r.date.slice(0, 10) < cutoff) continue;
      const rows = byAthlete.get(r.athleteId) ?? [];
      rows.push(r);
      byAthlete.set(r.athleteId, rows);
    }
    for (const [id, rows] of byAthlete) {
      const latestDate = rows.reduce(
        (latest, r) =>
          r.date.slice(0, 10) > latest ? r.date.slice(0, 10) : latest,
        "",
      );
      const latest = rows.filter((r) => r.date.slice(0, 10) === latestDate);
      if (!latest.some((r) => r.team === options.team)) continue;
      const conflict =
        new Set(
          latest.map((r) =>
            JSON.stringify([r.team, r.ageAtSwim ?? null, r.gender || ""]),
          ),
        ).size > 1;
      const last = latest[0];
      buckets.set(id, {
        rows: rows.filter(
          (r) =>
            r.team === options.team &&
            (conflict ||
              (raceAgeGroup(r) === raceAgeGroup(last) &&
                r.gender === last.gender)),
        ),
        ageGroup: conflict ? "" : raceAgeGroup(last),
        gender: conflict ? "" : last.gender || "",
        conflict,
        latestDate,
      });
    }
  } else {
    for (const r of individual) {
      if (r.team !== options.team) continue;
      const ageGroup = raceAgeGroup(r),
        gender = r.gender || "";
      const key = JSON.stringify([r.athleteId, ageGroup, gender]);
      const bucket = buckets.get(key) ?? {
        rows: [],
        ageGroup,
        gender,
        conflict: false,
        latestDate: "",
      };
      bucket.rows.push(r);
      if (r.date > bucket.latestDate) bucket.latestDate = r.date;
      buckets.set(key, bucket);
    }
  }
  const groups = new Map<string, AthleteRankingGroup>();
  for (const bucket of buckets.values()) {
    // A conflict can leave no matching swims; identify the athlete before eligibility filtering.
    const first = bucket.rows[0];
    if (!first) continue;
    const reasons = new Set<string>();
    if (!standard)
      reasons.add("Current verified motivational standards unavailable.");
    if (bucket.conflict)
      reasons.add("Latest-day records disagree on team, age, or gender.");
    if (!bucket.ageGroup) reasons.add("Recorded age group unavailable.");
    if (!["F", "M"].includes(bucket.gender))
      reasons.add("Gender benchmark unavailable.");
    const bests = new Map<string, Race>();
    for (const r of bucket.rows) {
      if (r.course !== options.course || !validTime(r) || r.official !== true)
        continue;
      const previous = bests.get(r.event);
      if (
        !previous ||
        r.time < previous.time ||
        (r.time === previous.time && r.date > previous.date)
      )
        bests.set(r.event, r);
    }
    const benchmarkAge = ["8&U", "9-10"].includes(bucket.ageGroup)
      ? "10&U"
      : bucket.ageGroup;
    const events: ScoredEvent[] = [];
    if (
      !bucket.conflict &&
      standard &&
      bucket.ageGroup &&
      ["F", "M"].includes(bucket.gender)
    ) {
      for (const race of bests.values()) {
        const cut = standard.cuts[options.course]?.[bucket.gender]?.[
          benchmarkAge
        ]?.[`${race.event}_${race.course}`]?.cutsByTier.find(
          (c) => c.tierName === "A",
        );
        if (cut && Number.isFinite(cut.timeMs) && cut.timeMs > 0)
          events.push({
            race,
            standardTime: cut.timeMs,
            score: (100 * cut.timeMs) / race.time,
          });
        else reasons.add("Some events have no matching A standard.");
      }
    }
    events.sort(
      (a, b) => b.score - a.score || a.race.event.localeCompare(b.race.event),
    );
    const top = events.slice(0, 3);
    if (!bests.size)
      reasons.add(
        `No eligible official ${options.course} results in this group and period.`,
      );
    const score = top.length
      ? Math.round(
          (top.reduce((sum, e) => sum + e.score, 0) / top.length) * 10,
        ) / 10
      : null;
    const athlete: RankedAthlete = {
      id: first.athleteId,
      name: names.get(first.athleteId) ?? first.athleteId,
      ageGroup: bucket.ageGroup,
      gender: bucket.gender,
      latestDate: bucket.latestDate,
      score,
      status:
        top.length === 3 ? "ranked" : top.length ? "provisional" : "unscored",
      events: top,
      reasons: [...reasons],
    };
    const key = JSON.stringify([bucket.ageGroup, bucket.gender]);
    const group = groups.get(key) ?? {
      ageGroup: bucket.ageGroup,
      label:
        ageGroups.find(([id]) => id === bucket.ageGroup)?.[1] ??
        "Age unavailable",
      gender: bucket.gender,
      athletes: [],
    };
    group.athletes.push(athlete);
    groups.set(key, group);
  }
  const order = { ranked: 0, provisional: 1, unscored: 2 };
  for (const group of groups.values()) {
    group.athletes.sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        (b.score ?? 0) - (a.score ?? 0) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
    let rank = 0,
      previous: number | null = null;
    group.athletes.forEach((a, index) => {
      if (a.status !== "ranked") return;
      if (a.score !== previous) rank = index + 1;
      a.rank = rank;
      previous = a.score;
    });
  }
  return [...groups.values()].sort(
    (a, b) =>
      (ageGroups.findIndex(([id]) => id === a.ageGroup) < 0
        ? 99
        : ageGroups.findIndex(([id]) => id === a.ageGroup)) -
        (ageGroups.findIndex(([id]) => id === b.ageGroup) < 0
          ? 99
          : ageGroups.findIndex(([id]) => id === b.ageGroup)) ||
      a.gender.localeCompare(b.gender),
  );
}
