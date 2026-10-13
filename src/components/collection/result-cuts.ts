import type { StandardSet } from "@/features/swim-resources/types/schema";
import type { Race } from "./times-data";

export interface ResultCut {
  id: string;
  label: string;
  name: string;
  age: string;
  tier: string;
  time: number;
  motivational: boolean;
  season: string;
}
const tiers = ["B", "BB", "A", "AA", "AAA", "AAAA"];
function matchesAge(group: string, race: Race) {
  if (race.relay) return group === race.relayAgeGroup || group === "Open";
  if (group === "Open") return true;
  const age = race.ageAtSwim;
  if (age == null || !Number.isFinite(age) || age < 0) return false;
  const key = group.replace(/\s/g, "");
  const range = /^(\d+)[–-](\d+)$/.exec(key);
  if (range) return age >= +range[1] && age <= +range[2];
  const bound = /^(\d+)&([UO])$/i.exec(key);
  if (bound)
    return bound[2].toUpperCase() === "U" ? age <= +bound[1] : age >= +bound[1];
  return /^\d+$/.test(key) && age === +key;
}
function shortName(name: string) {
  if (/winter.*junior/i.test(name)) return "Winter Jr";
  if (/junior.*national/i.test(name)) return "Jr Nats";
  if (/u\.?\s?s\.?\s?open/i.test(name)) return "US Open";
  if (/national/i.test(name)) return "Nats";
  if (/futures/i.test(name)) return "Futures";
  if (/sectional/i.test(name)) return "Sectionals";
  if (/pro swim/i.test(name)) return "Pro Swim";
  if (/olympic.*trial/i.test(name)) return "OT";
  return name
    .replace(/\bUSA Swimming\b|\b20\d{2}\b|\bTime Standards\b/gi, "")
    .trim();
}

/** Published, exact-course benchmarks in effect on the swim date; not meet-entry eligibility. */
export function resultCuts(race: Race, sets: StandardSet[]): ResultCut[] {
  if (
    race.status !== "OK" ||
    !Number.isFinite(race.time) ||
    race.time <= 0 ||
    race.moderationStatus === "flagged" ||
    race.calculationEligible === false ||
    (race.split && race.resultOrigin !== "relay_leadoff")
  )
    return [];
  const day = race.date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const matches: ResultCut[] = [];
  for (const set of [...sets].sort(
    (a, b) =>
      b.effectiveDate.localeCompare(a.effectiveDate) ||
      a.id.localeCompare(b.id),
  )) {
    if (
      set.governingBody !== "USA_Swimming" ||
      (set.standardType && set.standardType !== "age-group") ||
      !set.category ||
      set.effectiveDate > day ||
      set.expirationDate < day ||
      /open water/i.test(set.name)
    )
      continue;
    const motivational = set.category === "motivational";
    const ages = set.cuts[race.course]?.[race.gender ?? ""] ?? {};
    for (const [age, events] of Object.entries(ages)) {
      // Prefer the familiar age-group motivational scale over single-age editions.
      if (motivational && (/^\d+$/.test(age) || age === "Open")) continue;
      if (!matchesAge(age, race)) continue;
      const event = events?.[`${race.event}_${race.course}`];
      const achieved = event?.cutsByTier
        .filter(
          (cut) =>
            cut.timeMs > 0 &&
            race.time <= cut.timeMs &&
            (!motivational || tiers.includes(cut.tierName)),
        )
        .sort((a, b) =>
          motivational
            ? tiers.indexOf(b.tierName) - tiers.indexOf(a.tierName)
            : a.timeMs - b.timeMs,
        )[0];
      if (!achieved) continue;
      const label = motivational ? achieved.tierName : shortName(set.name);
      matches.push({
        id: `${set.id}:${age}`,
        label,
        name: set.name,
        age,
        tier: achieved.tierName,
        time: achieved.timeMs,
        motivational,
        season: set.seasonYears,
      });
    }
  }
  const motivational = matches
    .filter((cut) => cut.motivational)
    .sort((a, b) => tiers.indexOf(b.tier) - tiers.indexOf(a.tier))[0];
  const national = matches.filter((cut) => !cut.motivational);
  const unique = national
    .filter(
      (cut, index) =>
        national.findIndex((other) => other.label === cut.label) === index,
    )
    .sort((a, b) => b.time - a.time || a.label.localeCompare(b.label));
  return [...(motivational ? [motivational] : []), ...unique];
}
