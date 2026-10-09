import { assertFreshTarget, prepareOrigins } from './evidence';
import { canonicalMeet } from '@/features/swim-resources/lib/domain/meet';
export { canonicalMeet } from '@/features/swim-resources/lib/domain/meet';
import { formatSwimTime, parseSwimTime } from '@/features/swim-resources/lib/domain/swim-time';
import { db } from '@/features/swim-resources/lib/backend';
import type { Meet, StandardSet, StandardTierCut } from '@/features/swim-resources/types/schema';
import { doc, runTransaction } from '@/lib/data';

export type PoolCourse = 'SCY' | 'LCM' | 'SCM';
export type Stroke = 'FR' | 'BK' | 'BR' | 'FL' | 'IM';
export type Gender = 'F' | 'M' | 'Mixed';

export interface BaseEventDefinition {
  distance: number;
  stroke: Stroke;
  isRelay: boolean;
  code: string;
  name: string;
}

export const STROKE_LABELS: Record<Stroke, string> = {
  FR: 'Freestyle',
  BK: 'Backstroke',
  BR: 'Breaststroke',
  FL: 'Butterfly',
  IM: 'Individual Medley',
};

export const STANDARD_AGE_GROUPS = [
  'Open',
  'Senior',
  '15&O',
  '17-18',
  '15-16',
  '13-14',
  '11-12',
  '10&U',
  '8&U',
  '9-10',
  '11-14',
  '13&O',
  '12&U',
];

export const COURSE_EVENTS: Record<PoolCourse, BaseEventDefinition[]> = {
  SCY: [
    // Freestyle
    { distance: 25, stroke: 'FR', isRelay: false, code: '25_FR_SCY', name: '25 Yard Freestyle' },
    { distance: 50, stroke: 'FR', isRelay: false, code: '50_FR_SCY', name: '50 Yard Freestyle' },
    { distance: 100, stroke: 'FR', isRelay: false, code: '100_FR_SCY', name: '100 Yard Freestyle' },
    { distance: 200, stroke: 'FR', isRelay: false, code: '200_FR_SCY', name: '200 Yard Freestyle' },
    { distance: 500, stroke: 'FR', isRelay: false, code: '500_FR_SCY', name: '500 Yard Freestyle' },
    { distance: 1000, stroke: 'FR', isRelay: false, code: '1000_FR_SCY', name: '1000 Yard Freestyle' },
    { distance: 1650, stroke: 'FR', isRelay: false, code: '1650_FR_SCY', name: '1650 Yard Freestyle' },
    // Backstroke
    { distance: 25, stroke: 'BK', isRelay: false, code: '25_BK_SCY', name: '25 Yard Backstroke' },
    { distance: 50, stroke: 'BK', isRelay: false, code: '50_BK_SCY', name: '50 Yard Backstroke' },
    { distance: 100, stroke: 'BK', isRelay: false, code: '100_BK_SCY', name: '100 Yard Backstroke' },
    { distance: 200, stroke: 'BK', isRelay: false, code: '200_BK_SCY', name: '200 Yard Backstroke' },
    // Breaststroke
    { distance: 25, stroke: 'BR', isRelay: false, code: '25_BR_SCY', name: '25 Yard Breaststroke' },
    { distance: 50, stroke: 'BR', isRelay: false, code: '50_BR_SCY', name: '50 Yard Breaststroke' },
    { distance: 100, stroke: 'BR', isRelay: false, code: '100_BR_SCY', name: '100 Yard Breaststroke' },
    { distance: 200, stroke: 'BR', isRelay: false, code: '200_BR_SCY', name: '200 Yard Breaststroke' },
    // Butterfly
    { distance: 25, stroke: 'FL', isRelay: false, code: '25_FL_SCY', name: '25 Yard Butterfly' },
    { distance: 50, stroke: 'FL', isRelay: false, code: '50_FL_SCY', name: '50 Yard Butterfly' },
    { distance: 100, stroke: 'FL', isRelay: false, code: '100_FL_SCY', name: '100 Yard Butterfly' },
    { distance: 200, stroke: 'FL', isRelay: false, code: '200_FL_SCY', name: '200 Yard Butterfly' },
    // IM
    { distance: 100, stroke: 'IM', isRelay: false, code: '100_IM_SCY', name: '100 Yard Individual Medley' },
    { distance: 200, stroke: 'IM', isRelay: false, code: '200_IM_SCY', name: '200 Yard Individual Medley' },
    { distance: 400, stroke: 'IM', isRelay: false, code: '400_IM_SCY', name: '400 Yard Individual Medley' },
    // Relays
    { distance: 200, stroke: 'IM', isRelay: true, code: '200_MEDLEY_RELAY_SCY', name: '200 Yard Medley Relay' },
    { distance: 200, stroke: 'FR', isRelay: true, code: '200_FREE_RELAY_SCY', name: '200 Yard Free Relay' },
    { distance: 400, stroke: 'IM', isRelay: true, code: '400_MEDLEY_RELAY_SCY', name: '400 Yard Medley Relay' },
    { distance: 400, stroke: 'FR', isRelay: true, code: '400_FREE_RELAY_SCY', name: '400 Yard Free Relay' },
    { distance: 800, stroke: 'FR', isRelay: true, code: '800_FREE_RELAY_SCY', name: '800 Yard Free Relay' },
  ],
  LCM: [
    // Freestyle
    { distance: 50, stroke: 'FR', isRelay: false, code: '50_FR_LCM', name: '50 Meter Freestyle' },
    { distance: 100, stroke: 'FR', isRelay: false, code: '100_FR_LCM', name: '100 Meter Freestyle' },
    { distance: 200, stroke: 'FR', isRelay: false, code: '200_FR_LCM', name: '200 Meter Freestyle' },
    { distance: 400, stroke: 'FR', isRelay: false, code: '400_FR_LCM', name: '400 Meter Freestyle' },
    { distance: 800, stroke: 'FR', isRelay: false, code: '800_FR_LCM', name: '800 Meter Freestyle' },
    { distance: 1500, stroke: 'FR', isRelay: false, code: '1500_FR_LCM', name: '1500 Meter Freestyle' },
    // Backstroke
    { distance: 50, stroke: 'BK', isRelay: false, code: '50_BK_LCM', name: '50 Meter Backstroke' },
    { distance: 100, stroke: 'BK', isRelay: false, code: '100_BK_LCM', name: '100 Meter Backstroke' },
    { distance: 200, stroke: 'BK', isRelay: false, code: '200_BK_LCM', name: '200 Meter Backstroke' },
    // Breaststroke
    { distance: 50, stroke: 'BR', isRelay: false, code: '50_BR_LCM', name: '50 Meter Breaststroke' },
    { distance: 100, stroke: 'BR', isRelay: false, code: '100_BR_LCM', name: '100 Meter Breaststroke' },
    { distance: 200, stroke: 'BR', isRelay: false, code: '200_BR_LCM', name: '200 Meter Breaststroke' },
    // Butterfly
    { distance: 50, stroke: 'FL', isRelay: false, code: '50_FL_LCM', name: '50 Meter Butterfly' },
    { distance: 100, stroke: 'FL', isRelay: false, code: '100_FL_LCM', name: '100 Meter Butterfly' },
    { distance: 200, stroke: 'FL', isRelay: false, code: '200_FL_LCM', name: '200 Meter Butterfly' },
    // IM
    { distance: 200, stroke: 'IM', isRelay: false, code: '200_IM_LCM', name: '200 Meter Individual Medley' },
    { distance: 400, stroke: 'IM', isRelay: false, code: '400_IM_LCM', name: '400 Meter Individual Medley' },
    // Relays
    { distance: 200, stroke: 'IM', isRelay: true, code: '200_MEDLEY_RELAY_LCM', name: '200 Meter Medley Relay' },
    { distance: 200, stroke: 'FR', isRelay: true, code: '200_FREE_RELAY_LCM', name: '200 Meter Free Relay' },
    { distance: 400, stroke: 'IM', isRelay: true, code: '400_MEDLEY_RELAY_LCM', name: '400 Meter Medley Relay' },
    { distance: 400, stroke: 'FR', isRelay: true, code: '400_FREE_RELAY_LCM', name: '400 Meter Free Relay' },
    { distance: 800, stroke: 'FR', isRelay: true, code: '800_FREE_RELAY_LCM', name: '800 Meter Free Relay' },
  ],
  SCM: [
    // Freestyle
    { distance: 25, stroke: 'FR', isRelay: false, code: '25_FR_SCM', name: '25 Meter Freestyle' },
    { distance: 50, stroke: 'FR', isRelay: false, code: '50_FR_SCM', name: '50 Meter Freestyle' },
    { distance: 100, stroke: 'FR', isRelay: false, code: '100_FR_SCM', name: '100 Meter Freestyle' },
    { distance: 200, stroke: 'FR', isRelay: false, code: '200_FR_SCM', name: '200 Meter Freestyle' },
    { distance: 400, stroke: 'FR', isRelay: false, code: '400_FR_SCM', name: '400 Meter Freestyle' },
    { distance: 800, stroke: 'FR', isRelay: false, code: '800_FR_SCM', name: '800 Meter Freestyle' },
    { distance: 1500, stroke: 'FR', isRelay: false, code: '1500_FR_SCM', name: '1500 Meter Freestyle' },
    // Backstroke
    { distance: 25, stroke: 'BK', isRelay: false, code: '25_BK_SCM', name: '25 Meter Backstroke' },
    { distance: 50, stroke: 'BK', isRelay: false, code: '50_BK_SCM', name: '50 Meter Backstroke' },
    { distance: 100, stroke: 'BK', isRelay: false, code: '100_BK_SCM', name: '100 Meter Backstroke' },
    { distance: 200, stroke: 'BK', isRelay: false, code: '200_BK_SCM', name: '200 Meter Backstroke' },
    // Breaststroke
    { distance: 25, stroke: 'BR', isRelay: false, code: '25_BR_SCM', name: '25 Meter Breaststroke' },
    { distance: 50, stroke: 'BR', isRelay: false, code: '50_BR_SCM', name: '50 Meter Breaststroke' },
    { distance: 100, stroke: 'BR', isRelay: false, code: '100_BR_SCM', name: '100 Meter Breaststroke' },
    { distance: 200, stroke: 'BR', isRelay: false, code: '200_BR_SCM', name: '200 Meter Breaststroke' },
    // Butterfly
    { distance: 25, stroke: 'FL', isRelay: false, code: '25_FL_SCM', name: '25 Meter Butterfly' },
    { distance: 50, stroke: 'FL', isRelay: false, code: '50_FL_SCM', name: '50 Meter Butterfly' },
    { distance: 100, stroke: 'FL', isRelay: false, code: '100_FL_SCM', name: '100 Meter Butterfly' },
    { distance: 200, stroke: 'FL', isRelay: false, code: '200_FL_SCM', name: '200 Meter Butterfly' },
    // IM
    { distance: 100, stroke: 'IM', isRelay: false, code: '100_IM_SCM', name: '100 Meter Individual Medley' },
    { distance: 200, stroke: 'IM', isRelay: false, code: '200_IM_SCM', name: '200 Meter Individual Medley' },
    { distance: 400, stroke: 'IM', isRelay: false, code: '400_IM_SCM', name: '400 Meter Individual Medley' },
    // Relays
    { distance: 200, stroke: 'IM', isRelay: true, code: '200_MEDLEY_RELAY_SCM', name: '200 Meter Medley Relay' },
    { distance: 200, stroke: 'FR', isRelay: true, code: '200_FREE_RELAY_SCM', name: '200 Meter Free Relay' },
    { distance: 400, stroke: 'IM', isRelay: true, code: '400_MEDLEY_RELAY_SCM', name: '400 Meter Medley Relay' },
    { distance: 400, stroke: 'FR', isRelay: true, code: '400_FREE_RELAY_SCM', name: '400 Meter Free Relay' },
    { distance: 800, stroke: 'FR', isRelay: true, code: '800_FREE_RELAY_SCM', name: '800 Meter Free Relay' },
  ],
};

/**
 * Parses user-entered time strings into milliseconds.
 * Supports:
 * - "28.52" -> 28520
 * - "1:02.45" -> 62450
 * - "16:42.10" -> 1002100
 * - "1:02:45.22" -> 3765220
 */
export const parseTimeToMs = parseSwimTime;
export const formatMsToTime = (ms: number | null | undefined): string => formatSwimTime(ms, '');

/**
 * Formats a clean standard event display name.
 */
export function formatMeetEventName(
  course: PoolCourse,
  gender: Gender,
  ageGroup: string,
  distance: number,
  stroke: Stroke,
  isRelay: boolean = false
): string {
  const genderLabel = gender === 'F' ? 'Girls' : gender === 'M' ? 'Boys' : 'Mixed';
  const unit = course === 'SCY' ? 'Yard' : 'Meter';
  const strokeName = isRelay
    ? stroke === 'IM'
      ? 'Medley Relay'
      : 'Freestyle Relay'
    : stroke === 'IM'
    ? 'Individual Medley'
    : STROKE_LABELS[stroke];

  return `${genderLabel} ${ageGroup} ${distance} ${unit} ${strokeName}`;
}

/**
 * Looks up qualifying / bonus cuts in a StandardSet for an event.
 */
export function lookupStandardCut(
  standardSet: StandardSet | null | undefined,
  course: PoolCourse,
  gender: Gender,
  ageGroup: string,
  eventCode: string,
  targetTier: string
): StandardTierCut | null {
  if (!standardSet || !standardSet.cuts) return null;

  const courseCuts = standardSet.cuts[course];
  if (!courseCuts) return null;

  // Gender mapping
  const genKey = gender === 'F' ? 'F' : gender === 'M' ? 'M' : 'F';
  const genderCuts = courseCuts[genKey];
  if (!genderCuts) return null;

  // Age group mapping fallback (e.g. 15&O may map to 15-16, 17-18, or Open)
  const ageOptions = [ageGroup];
  if (ageGroup === '15&O' || ageGroup === 'Senior') {
    ageOptions.push('17-18', 'Open', '15-16');
  } else if (ageGroup === 'Open') {
    ageOptions.push('17-18', '15-16');
  } else if (ageGroup === '10&U') {
    ageOptions.push('10&U', '9-10');
  }

  for (const ag of ageOptions) {
    const eventObj = genderCuts[ag]?.[eventCode];
    if (eventObj && eventObj.cutsByTier) {
      const match = eventObj.cutsByTier.find(
        (c) => c.tierName.toLowerCase() === targetTier.toLowerCase()
      );
      if (match) return match;
    }
  }

  return null;
}

/**
 * Pre-built Order Templates for fast meet creation
 */
export interface MeetTemplate {
  id: string;
  name: string;
  description: string;
  events: Array<{
    distance: number;
    stroke: Stroke;
    isRelay: boolean;
    gender: 'pair' | 'F' | 'M' | 'Mixed';
    ageGroup: string;
    session?: string;
  }>;
}

export const MEET_TEMPLATES: MeetTemplate[] = [
  {
    id: 'high_school_dual',
    name: 'High School / Dual Meet (Standard 11 Events)',
    description: 'Standard 22-event dual meet order with alternating Girls and Boys pairs (200 MR through 400 FR).',
    events: [
      { distance: 200, stroke: 'IM', isRelay: true, gender: 'pair', ageGroup: 'Open', session: 'Session 1' },
      { distance: 200, stroke: 'FR', isRelay: false, gender: 'pair', ageGroup: 'Open', session: 'Session 1' },
      { distance: 200, stroke: 'IM', isRelay: false, gender: 'pair', ageGroup: 'Open', session: 'Session 1' },
      { distance: 50, stroke: 'FR', isRelay: false, gender: 'pair', ageGroup: 'Open', session: 'Session 1' },
      { distance: 100, stroke: 'FL', isRelay: false, gender: 'pair', ageGroup: 'Open', session: 'Session 1' },
      { distance: 100, stroke: 'FR', isRelay: false, gender: 'pair', ageGroup: 'Open', session: 'Session 1' },
      { distance: 500, stroke: 'FR', isRelay: false, gender: 'pair', ageGroup: 'Open', session: 'Session 1' },
      { distance: 200, stroke: 'FR', isRelay: true, gender: 'pair', ageGroup: 'Open', session: 'Session 1' },
      { distance: 100, stroke: 'BK', isRelay: false, gender: 'pair', ageGroup: 'Open', session: 'Session 1' },
      { distance: 100, stroke: 'BR', isRelay: false, gender: 'pair', ageGroup: 'Open', session: 'Session 1' },
      { distance: 400, stroke: 'FR', isRelay: true, gender: 'pair', ageGroup: 'Open', session: 'Session 1' },
    ],
  },
  {
    id: 'age_group_sprint',
    name: 'Age Group Sprint Invitational',
    description: 'Sprint-focused events (50s of each stroke + 100 Free & 100 IM) for 10&U, 11-12, and 13-14.',
    events: [
      { distance: 100, stroke: 'FR', isRelay: false, gender: 'pair', ageGroup: '10&U', session: 'Session 1' },
      { distance: 100, stroke: 'FR', isRelay: false, gender: 'pair', ageGroup: '11-12', session: 'Session 1' },
      { distance: 50, stroke: 'BK', isRelay: false, gender: 'pair', ageGroup: '10&U', session: 'Session 1' },
      { distance: 50, stroke: 'BK', isRelay: false, gender: 'pair', ageGroup: '11-12', session: 'Session 1' },
      { distance: 50, stroke: 'BR', isRelay: false, gender: 'pair', ageGroup: '10&U', session: 'Session 1' },
      { distance: 50, stroke: 'BR', isRelay: false, gender: 'pair', ageGroup: '11-12', session: 'Session 1' },
      { distance: 50, stroke: 'FL', isRelay: false, gender: 'pair', ageGroup: '10&U', session: 'Session 1' },
      { distance: 50, stroke: 'FL', isRelay: false, gender: 'pair', ageGroup: '11-12', session: 'Session 1' },
      { distance: 100, stroke: 'IM', isRelay: false, gender: 'pair', ageGroup: '10&U', session: 'Session 1' },
      { distance: 100, stroke: 'IM', isRelay: false, gender: 'pair', ageGroup: '11-12', session: 'Session 1' },
      { distance: 50, stroke: 'FR', isRelay: false, gender: 'pair', ageGroup: '10&U', session: 'Session 1' },
      { distance: 50, stroke: 'FR', isRelay: false, gender: 'pair', ageGroup: '11-12', session: 'Session 1' },
    ],
  },
  {
    id: 'distance_session',
    name: 'Distance Session',
    description: 'Longer aerobic endurance events: 400 IM, 500/800 Free, and 1000/1650 Free.',
    events: [
      { distance: 400, stroke: 'IM', isRelay: false, gender: 'pair', ageGroup: 'Open', session: 'Distance' },
      { distance: 500, stroke: 'FR', isRelay: false, gender: 'pair', ageGroup: 'Open', session: 'Distance' },
      { distance: 1000, stroke: 'FR', isRelay: false, gender: 'pair', ageGroup: 'Open', session: 'Distance' },
      { distance: 1650, stroke: 'FR', isRelay: false, gender: 'pair', ageGroup: 'Open', session: 'Distance' },
    ],
  },
];

/** Preserve unrelated meet metadata and remove cleared optional form fields. */

export async function saveMeet(meet: Meet): Promise<void> {
  assertFreshTarget();
  canonicalMeet(undefined, meet);
  await runTransaction(db, async transaction => {
    const reference = doc(db, 'meets', meet.id);
    const current = await transaction.get(reference);
    const next = canonicalMeet(current.data(), meet);
    const publish = await prepareOrigins(transaction, [{ path: `meets/${meet.id}`, before: current.data() ?? null, after: next as unknown as Record<string, unknown>, origin: 'manual' }]);
    transaction.set(reference, next);
    publish();
  });
}
