import { formatSwimTime, parseSwimTime } from '@/features/swim-resources/lib/domain/swim-time';
import { StandardAgeGroup, StandardSet, StandardTierCut } from '@/features/swim-resources/types/schema';

export interface RawStandardEntry {
  isStandard: boolean;
  cut: string;
  gender: 'Female' | 'Male' | string;
  minAge: number | null;
  maxAge: number | null;
  eligibleStart?: string;
  eligibleEnd?: string;
  times: Record<string, string>;
}

export const parseStandardTimeToMs = (value: string | number): number => parseSwimTime(value) ?? 0;
export const formatStandardMsToTime = formatSwimTime;

export function mapAgeRangeToGroup(minAge: number | null, maxAge: number | null): StandardAgeGroup {
  if (minAge == null && maxAge === 10) return '10&U';
  if (minAge === 11 && maxAge === 12) return '11-12';
  if (minAge === 13 && maxAge === 14) return '13-14';
  if (minAge === 15 && maxAge === 16) return '15-16';
  if (minAge === 17 && maxAge === 18) return '17-18';
  if (minAge == null && maxAge === 18) return '18&U';
  if (minAge === 19 && maxAge == null) return '19&O';
  if (minAge == null && maxAge == null) return 'Open';
  
  if (minAge != null && maxAge == null) return `${minAge}&O`;
  if (minAge == null && maxAge != null) return `${maxAge}&U`;
  return `${minAge}-${maxAge}`;
}

export function parseStandardEvent(eventStr: string): {
  eventCode: string;
  distance: number;
  stroke: 'FR' | 'BK' | 'BR' | 'FL' | 'IM';
  course: 'SCY' | 'SCM' | 'LCM';
} | null {
  // e.g. "50 Free SCY", "100 Back LCM", "200 Breast SCY", "400 IM LCM"
  const clean = eventStr.replace(/\s+/g, ' ').trim();
  const m = clean.match(/^(\d+)\s+([A-Za-z]+)\s+([A-Za-z]+)$/i);

  if (m) {
    const dist = parseInt(m[1], 10);
    const stRaw = m[2].toUpperCase();
    const crRaw = m[3].toUpperCase();

    let stroke: 'FR' | 'BK' | 'BR' | 'FL' | 'IM' | null = null;
    if (stRaw === 'FR' || stRaw === 'FREE') stroke = 'FR';
    else if (stRaw === 'BK' || stRaw === 'BACK') stroke = 'BK';
    else if (stRaw === 'BR' || stRaw === 'BREAST') stroke = 'BR';
    else if (stRaw === 'FL' || stRaw === 'FLY') stroke = 'FL';
    else if (stRaw === 'IM') stroke = 'IM';

    let course: 'SCY' | 'SCM' | 'LCM' = 'SCY';
    if (crRaw === 'LCM') course = 'LCM';
    else if (crRaw === 'SCM') course = 'SCM';

    if (!stroke) return null;

    return {
      eventCode: `${dist}_${stroke}_${course}`,
      distance: dist,
      stroke,
      course,
    };
  }

  return null;
}

/**
 * Transforms an array of flat standard entries into two hierarchical StandardSet documents:
 * 1. usas_motivational_2024_2028
 * 2. championship_cuts_2025_2026
 */
export function transformRawStandardsToStandardSets(rawEntries: RawStandardEntry[]): {
  motivationalSet: StandardSet;
  championshipSet: StandardSet;
} {
  const motivationalSet: StandardSet = {
    id: 'usas_motivational_2024_2028',
    name: '2024-2028 USA Swimming Motivational Standards',
    governingBody: 'USA_Swimming',
    seasonYears: '2024-2028',
    effectiveDate: '2024-01-01',
    expirationDate: '2028-12-31',
    cuts: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const championshipSet: StandardSet = {
    id: 'championship_cuts_2025_2026',
    name: '2025-2026 Championship Qualifying Standards',
    governingBody: 'USA_Swimming',
    seasonYears: '2025-2026',
    effectiveDate: '2025-01-01',
    expirationDate: '2026-12-31',
    cuts: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  for (const entry of rawEntries) {
    const targetSet = entry.isStandard ? motivationalSet : championshipSet;
    if (entry.gender !== 'Female' && entry.gender !== 'Male') continue;
    const genderKey = entry.gender === 'Female' ? 'F' : 'M';
    const ageGroup = mapAgeRangeToGroup(entry.minAge, entry.maxAge);
    const tierName = entry.cut;

    for (const [rawEventName, timeStr] of Object.entries(entry.times || {})) {
      if (!timeStr) continue;

      const parsedEvent = parseStandardEvent(rawEventName);
      if (!parsedEvent) continue;
      const { course, eventCode } = parsedEvent;
      const timeMs = parseStandardTimeToMs(timeStr);
      const timeDisplay = formatStandardMsToTime(timeMs);

      // Initialize nested paths safely
      if (!targetSet.cuts[course]) {
        targetSet.cuts[course] = {};
      }
      if (!targetSet.cuts[course]![genderKey]) {
        targetSet.cuts[course]![genderKey] = {};
      }
      if (!targetSet.cuts[course]![genderKey]![ageGroup]) {
        targetSet.cuts[course]![genderKey]![ageGroup] = {};
      }
      if (!targetSet.cuts[course]![genderKey]![ageGroup]![eventCode]) {
        targetSet.cuts[course]![genderKey]![ageGroup]![eventCode] = {
          cutsByTier: [],
        };
      }

      const existingTierIdx = targetSet.cuts[course]![genderKey]![ageGroup]![eventCode].cutsByTier.findIndex(
        (c) => c.tierName === tierName
      );

      const cutObj: StandardTierCut = {
        tierName,
        timeMs,
        timeDisplay,
      };

      if (existingTierIdx >= 0) {
        targetSet.cuts[course]![genderKey]![ageGroup]![eventCode].cutsByTier[existingTierIdx] = cutObj;
      } else {
        targetSet.cuts[course]![genderKey]![ageGroup]![eventCode].cutsByTier.push(cutObj);
      }
    }
  }

  // Sort cutsByTier from fastest to slowest (ascending order of timeMs)
  const sortCutsInSet = (set: StandardSet) => {
    for (const course of Object.keys(set.cuts)) {
      for (const gender of Object.keys(set.cuts[course] || {})) {
        for (const ageGroup of Object.keys(set.cuts[course]![gender] || {})) {
          for (const eventCode of Object.keys(set.cuts[course]![gender]![ageGroup] || {})) {
            set.cuts[course]![gender]![ageGroup]![eventCode].cutsByTier.sort(
              (a, b) => a.timeMs - b.timeMs
            );
          }
        }
      }
    }
  };

  sortCutsInSet(motivationalSet);
  sortCutsInSet(championshipSet);

  return { motivationalSet, championshipSet };
}
