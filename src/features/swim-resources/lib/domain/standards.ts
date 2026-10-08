import type { StandardSet } from '@/features/swim-resources/types/schema';
/** Fresh public pages show only imported standards effective on the selected day. */
export function currentStandard(sets: StandardSet[], category: NonNullable<StandardSet['category']>, day = new Date().toISOString().slice(0, 10)): StandardSet | null {
  return sets.filter(set => set.category === category && set.effectiveDate <= day && set.expirationDate >= day).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0] ?? null;
}
