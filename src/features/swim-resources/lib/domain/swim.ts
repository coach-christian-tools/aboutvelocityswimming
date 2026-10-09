import type { Swim } from '@/features/swim-resources/types/schema';
import { isCalendarDate } from './date.ts';
import { formatSwimTime, parseSwimTime } from './swim-time.ts';

export function canonicalSwim(input: Partial<Swim>): Swim {
  const fail = (field: string): never => { throw new Error(`Swim import requires a valid ${field}. Missing data must not be invented.`); };
  if (!input.athleteId?.trim()) fail('athleteId');
  if (!input.athleteName?.first || !input.athleteName?.last) fail('athleteName');
  if (!['M', 'F', 'X'].includes(input.gender || '')) fail('gender');
  if (!['SCY', 'SCM', 'LCM'].includes(input.course || '')) fail('course');
  if (!['FR', 'BK', 'BR', 'FL', 'IM'].includes(input.stroke || '')) fail('stroke');
  if (!input.distance || ![25,50,100,200,400,500,800,1000,1500,1650].includes(input.distance)) fail('distance');
  if (!Number.isInteger(input.ageAtSwim) || input.ageAtSwim! < 0 || input.ageAtSwim! > 120) fail('ageAtSwim');
  if (!['8&U','9-10','11-12','13-14','15-16','17-18','Open','Masters'].includes(input.ageGroup || '')) fail('ageGroup');
  if (!['OK','DQ','DFS','NS'].includes(input.status || '')) fail('status');
  if (typeof input.isRelay !== 'boolean') fail('isRelay');
  if (!['F','P','S','TT'].includes(input.round || '')) fail('round');
  if (!input.meet?.name?.trim() || !isCalendarDate(input.meet?.date)) fail('meet name and date');
  const timeMs = parseSwimTime(input.timeMs ?? input.timeDisplay);
  if (input.status === 'OK' && (!timeMs || timeMs <= 0)) fail('positive time');
  const meetId = input.meet!.id || `${input.meet!.name}_${input.meet!.date}`.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const eventCode = `${input.distance}_${input.stroke}_${input.course}`;
  if (input.eventCode && input.eventCode !== eventCode && !input.isRelay) fail('eventCode matching distance, stroke and course');
  const source = input.externalResult;
  if (source && (!/^[a-zA-Z0-9_-]+$/.test(source.namespace) || !/^[a-zA-Z0-9_-]+$/.test(source.id))) fail('external result identity');
  const id = input.id || (source ? `result_${source.namespace}_${source.id}` : `${input.athleteId}_${input.eventCode || eventCode}_${meetId}_${input.round}`);
  if (id.includes('/')) fail('document ID');
  return { ...input, id, eventCode: input.eventCode || eventCode, timeMs: timeMs ?? 0,
    timeDisplay: formatSwimTime(timeMs ?? 0), meet: { ...input.meet, id: meetId },
    metadata: { source: input.metadata?.source || 'manual', createdAt: input.metadata?.createdAt || new Date().toISOString() },
  } as Swim;
}
