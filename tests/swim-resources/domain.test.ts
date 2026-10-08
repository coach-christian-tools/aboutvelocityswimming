import { describe, expect, it } from 'vitest';
import { publicAthlete, normalizeAthleteStatus, formatGroup } from '@/features/swim-resources/lib/domain/athlete';
import { parseSwimTime, formatSwimTime } from '@/features/swim-resources/lib/domain/swim-time';
import { canonicalSwim } from '@/features/swim-resources/lib/domain/swim';

export const swim = {
  athleteId: 'ath_test', athleteName: { first: 'Test', last: 'Swimmer' }, gender: 'F' as const,
  ageAtSwim: 14, ageGroup: '13-14' as const, distance: 100 as const, stroke: 'FR' as const,
  course: 'SCY' as const, isRelay: false, timeMs: 119999, status: 'OK' as const,
  round: 'F' as const, meet: { id: 'meet_one', name: 'Test Meet', date: '2026-01-01' },
};

describe('public/private athlete boundary', () => {
  it('publishes only the allowlisted fields, including for legacy athletes', () => {
    expect(publicAthlete('test', { id: 'test', firstName: 'Test', lastName: 'Swimmer', dob: '2000-01-01',
      email: 'private@example.com', contact: { phone: 'private' }, styling: { notes: 'private' }, notes: 'private', swimsId: 'private' }))
      .toEqual({ id: 'test', name: { first: 'Test', last: 'Swimmer' }, aliases: ['Test Swimmer', 'Swimmer, Test'] });
  });
  it('prefers canonical status over a stale legacy location', () => {
    expect(normalizeAthleteStatus('inactive', 'Active')).toBe('inactive');
    expect(normalizeAthleteStatus(undefined, 'Taking Break')).toBe('taking_break');
    expect(formatGroup(' Littles (AM) ')).toBe('Littles');
  });
});

describe('swim times and ledger identity', () => {
  it.each([[59999, '1:00.00'], [119999, '2:00.00'], [3599999, '60:00.00'], [0, '0.00']])('carries rounding across minute boundaries (%i)', (ms, text) => {
    expect(formatSwimTime(ms as number)).toBe(text);
  });
  it('parses hours and rejects malformed input', () => {
    expect(parseSwimTime('1:02:45.22')).toBe(3765220);
    for (const value of ['1:60', 'oops', '-1', '1.5:20', '1:2:3:4']) expect(parseSwimTime(value)).toBeUndefined();
    expect(parseSwimTime(Number.NaN)).toBeUndefined();
  });
  it('requires actual demographics and meet data instead of fabricating them', () => {
    expect(() => canonicalSwim({ athleteId: 'ath_test', timeMs: 50000 })).toThrow('athleteName');
    expect(() => canonicalSwim({ ...swim, ageAtSwim: undefined })).toThrow('ageAtSwim');
    expect(() => canonicalSwim({ ...swim, status: undefined })).toThrow('status');
    expect(() => canonicalSwim({ ...swim, meet: { ...swim.meet, date: '2026-02-31' } })).toThrow('meet name and date');
  });
  it('preserves multiple meets/rounds and rejects inconsistent event specifications', () => {
    const first = canonicalSwim(swim);
    expect(canonicalSwim({ ...swim, meet: { ...swim.meet, id: 'meet_two' } }).id).not.toBe(first.id);
    expect(canonicalSwim({ ...swim, round: 'P' }).id).not.toBe(first.id);
    expect(first.timeDisplay).toBe('2:00.00');
    expect(() => canonicalSwim({ ...swim, eventCode: '200_BK_LCM' })).toThrow('eventCode');
  });
});
