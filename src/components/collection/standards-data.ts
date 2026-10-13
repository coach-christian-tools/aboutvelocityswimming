import type { StandardSet } from "@/features/swim-resources/types/schema";
import { compareEvents } from "./event-layout";
export type StandardSelection = {
  course: string;
  gender: string;
  age: string;
  tier: string;
};
const preferred = (values: string[], requested: string, fallback: string) =>
  values.includes(requested)
    ? requested
    : values.includes(fallback)
      ? fallback
      : (values[0] ?? "");
export const ageOrder = (a: string, b: string) =>
  (parseInt(a) || 999) - (parseInt(b) || 999) || a.localeCompare(b);
export function standardFilters(
  set: StandardSet,
  selection: Partial<StandardSelection> = {},
) {
  const courses = Object.keys(set.cuts).sort(
    (a, b) =>
      ["SCY", "LCM", "SCM"].indexOf(a) - ["SCY", "LCM", "SCM"].indexOf(b),
  );
  const course = preferred(courses, selection.course ?? "", "SCY");
  const genders = Object.keys(set.cuts[course] ?? {}).sort();
  const gender = preferred(genders, selection.gender ?? "", "F");
  const ages = Object.keys(set.cuts[course]?.[gender] ?? {}).sort(ageOrder);
  const age = preferred(ages, selection.age ?? "", ages[0]);
  const events = set.cuts[course]?.[gender]?.[age] ?? {};
  const tiers = [
    ...new Set(
      Object.values(events).flatMap((event) =>
        event.cutsByTier.map((cut) => cut.tierName),
      ),
    ),
  ].sort((a, b) => {
    const order = ["B", "BB", "A", "AA", "AAA", "AAAA", "Qualifying", "Bonus"];
    return (
      (order.includes(a) ? order.indexOf(a) : 99) -
        (order.includes(b) ? order.indexOf(b) : 99) || a.localeCompare(b)
    );
  });
  const tier = preferred(tiers, selection.tier ?? "", "B");
  return {
    courses,
    genders,
    ages,
    tiers,
    selection: { course, gender, age, tier },
    events,
  };
}
export function standardStatus(set: StandardSet, day: string) {
  return set.effectiveDate > day
    ? "Upcoming"
    : set.expirationDate < day
      ? "Expired"
      : "Current";
}
export function defaultStandard(sets: StandardSet[], day: string) {
  return [...sets].sort((a, b) => {
    const rank = (s: StandardSet) =>
      standardStatus(s, day) === "Current"
        ? s.category === "motivational" &&
          (!s.standardType || s.standardType === "age-group")
          ? 0
          : 1
        : 2;
    return (
      rank(a) - rank(b) ||
      b.effectiveDate.localeCompare(a.effectiveDate) ||
      a.id.localeCompare(b.id)
    );
  })[0];
}
export function standardEventKeys(set: StandardSet, course: string) {
  return [
    ...new Set(
      Object.values(set.cuts[course] ?? {}).flatMap((ages) =>
        Object.values(ages ?? {}).flatMap((events) =>
          Object.keys(events ?? {}),
        ),
      ),
    ),
  ].sort(compareEvents);
}
export function flatCuts(set: StandardSet | null) {
  const cuts = new Map<string, number>();
  for (const [course, genders] of Object.entries(set?.cuts ?? {}))
    for (const [gender, ages] of Object.entries(genders ?? {}))
      for (const [age, events] of Object.entries(ages ?? {}))
        for (const [event, value] of Object.entries(events ?? {}))
          for (const cut of value.cutsByTier)
            cuts.set(
              [course, gender, age, event, cut.tierName].join(" / "),
              cut.timeMs,
            );
  return cuts;
}
export function standardDiff(
  before: StandardSet | null,
  after: StandardSet | null,
) {
  const old = flatCuts(before),
    next = flatCuts(after);
  return [...new Set([...old.keys(), ...next.keys()])]
    .sort()
    .flatMap((key) =>
      old.get(key) === next.get(key)
        ? []
        : [{ key, before: old.get(key), after: next.get(key) }],
    );
}
