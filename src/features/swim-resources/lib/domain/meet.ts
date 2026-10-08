import { VELOCITY_TEAM_ID, validateEntityLinks } from './entities.ts';
import { isCalendarDate } from './date.ts';
import type { Meet } from '../../types/schema';
const clean = (value: unknown): unknown => value instanceof Date || (value && typeof value === 'object' && 'toMillis' in value) ? value : Array.isArray(value) ? value.filter(v => v !== undefined).map(clean) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, clean(v)])) : value;
export function canonicalMeet(previous: Record<string, unknown> | undefined, meet: Meet): Meet {
  validateEntityLinks(meet as unknown as Record<string, unknown>);
  if (!meet.name.trim() || !isCalendarDate(meet.dates.startDate) ||
      (meet.dates.endDate && (!isCalendarDate(meet.dates.endDate) || meet.dates.endDate < meet.dates.startDate))) {
    throw new Error('Supply a meet name and valid dates in chronological order.');
  }
  return clean({ ...previous, ...meet, teamId: meet.teamId ?? previous?.teamId ?? VELOCITY_TEAM_ID,
    dates: { ...(previous?.dates as Meet['dates'] | undefined), ...meet.dates },
    venue: { ...(previous?.venue as Meet['venue'] | undefined), ...meet.venue },
    createdAt: previous?.createdAt ?? meet.createdAt ?? new Date().toISOString() }) as Meet;
}
