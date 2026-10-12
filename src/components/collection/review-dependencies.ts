import { object, type ReviewWrite } from "./review-summary";

export const dependencyTables = ["teams", "venues", "meets", "athletes"] as const;
export type DependencyTable = (typeof dependencyTables)[number];

export function reviewDependencies(writes: ReviewWrite[]) {
  const required = Object.fromEntries(dependencyTables.map(table => [table, new Set<string>()])) as Record<DependencyTable, Set<string>>;
  const supplied = new Set(writes.filter(write => write.after !== null).map(write => write.path));
  function reference(table: DependencyTable, value: unknown) {
    if (typeof value === "string" && value && !supplied.has(`${table}/${value}`)) required[table].add(value);
  }
  for (const write of writes) {
    const data = object(write.after);
    const root = write.path.split("/")[0];
    if (root === "swims") {
      reference("athletes", data.athleteId);
      reference("meets", object(data.meet).id);
    }
    if (root === "athletes" || root === "meets") reference("teams", data.teamId);
    if (root === "meets") {
      reference("teams", data.hostTeamId);
      reference("venues", data.venueId);
    }
  }
  return required;
}
