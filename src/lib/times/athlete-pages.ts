import type { AthleteRankingGroup } from "@/components/collection/athlete-rankings";
import type {
  TimesInput,
  TimesResponse,
} from "@/components/collection/times-api";

/** Search and pagination happen after scoring so displayed ranks stay stable. */
export function athletePages(
  groups: AthleteRankingGroup[],
  input: TimesInput,
): TimesResponse["groups"] {
  const search = String(input.search ?? "")
    .trim()
    .toLowerCase();
  const ages = input.ageGroups as string[] | undefined;
  const offset = Number(input.offset ?? 0),
    limit = Number(input.limit ?? 25);
  return groups
    .filter(
      (g) =>
        (!ages?.length || ages.includes(g.ageGroup)) &&
        (input.groupAge === undefined || g.ageGroup === input.groupAge) &&
        (input.groupGender === undefined || g.gender === input.groupGender),
    )
    .map((g) => {
      const matching = g.athletes.filter((a) =>
        a.name.toLowerCase().includes(search),
      );
      const statuses = ["ranked", "provisional", "unscored"] as const;
      const totals = Object.fromEntries(
        statuses.map((status) => [
          status,
          matching.filter((a) => a.status === status).length,
        ]),
      ) as Record<(typeof statuses)[number], number>;
      return {
        ...g,
        totals,
        athletes: statuses.flatMap((status) =>
          input.status && input.status !== status
            ? []
            : matching
                .filter((a) => a.status === status)
                .slice(offset, offset + limit),
        ),
      };
    })
    .filter((g) => Object.values(g.totals).some(Boolean));
}
