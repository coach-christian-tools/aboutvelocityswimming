import { describe, expect, it } from 'vitest';
import { canonicalRelayResult, validateLeadOff, validateRaceSplits } from '@/features/swim-resources/lib/domain/relay';
import { validateImportData } from '@/features/swim-resources/lib/domain/import-batch';
import { reviewDependencies } from '@/components/collection/review-dependencies';
import { raceSummary } from '@/components/collection/review-summary';

const relay = () => ({ id: 'relay-1', teamId: 'club', relayName: 'Club A', eventCode: '200_MED-R_SCY', distance: 200, stroke: 'IM', course: 'SCY', gender: 'X', ageGroup: '10&U', round: 'F', status: 'OK', timeMs: 140000, timeDisplay: '2:20.00', isOfficial: true, meet: { id: 'meet', name: 'Championship', date: '2026-07-10' }, members: [{ leg: 2, athleteId: 'b', name: 'Swimmer B' }, { leg: 1, athleteId: 'a', name: 'Swimmer A' }], splits: [{ distance: 50, cumulativeMs: 30000, lapMs: 30000 }, { distance: 200, cumulativeMs: 140000, lapMs: 110000 }], splitCoverage: 'partial' });
const leadOff = () => ({ id: 'lead-1', athleteId: 'a', isRelay: false, isOfficial: true, status: 'OK', resultOrigin: 'relay_leadoff', parentRelayResultId: 'relay-1', leadOffVerification: { verified: true, flatStart: true, timingVerified: true, leadOffStatus: 'OK', sourceUrl: 'https://example.test/results' } });

describe('relay result integrity', () => {
  it('stores a team total without an athlete and sorts the observed legs', () => {
    const result = canonicalRelayResult(relay());
    expect(result.members.map(member => member.leg)).toEqual([1, 2]);
    expect(result).not.toHaveProperty('athleteId');
    expect(result.ageGroup).toBe('10&U');
    expect(() => validateImportData('relay', relay())).not.toThrow();
  });
  it('retains totals with missing members and unavailable splits', () => {
    expect(canonicalRelayResult({ ...relay(), members: [], splits: [], splitCoverage: 'unavailable' }).timeMs).toBe(140000);
  });
  it('rejects repeated legs or swimmer identities and wrong event codes', () => {
    for (const patch of [{ members: [{ leg: 1, name: 'A' }, { leg: 1, name: 'B' }] }, { members: [{ leg: 1, athleteId: 'a', name: 'A' }, { leg: 2, athleteId: 'a', name: 'A' }] }, { eventCode: '200_FR-R_SCY' }]) expect(() => canonicalRelayResult({ ...relay(), ...patch })).toThrow();
  });
  it('rejects private information inside public member objects', () => {
    expect(() => canonicalRelayResult({ ...relay(), members: [{ leg: 1, name: 'A', dob: '2015-01-01' }] })).toThrow('Unsupported');
  });
  it('requires monotonic verified distances and exact cumulative arithmetic', () => {
    for (const splits of [[{ distance: 250, cumulativeMs: 30000 }], [{ distance: 50, cumulativeMs: 30000 }, { distance: 100, cumulativeMs: 29000 }], [{ distance: 50, cumulativeMs: 30000, lapMs: 31000 }], [{ distance: 50, cumulativeMs: 150000 }]]) expect(() => validateRaceSplits({ ...relay(), splits })).toThrow();
    expect(() => validateRaceSplits({ ...relay(), splitCoverage: 'complete', splits: [{ distance: 200, cumulativeMs: 139999 }] })).toThrow();
  });
  it('requires separate start and timing evidence for a lead-off', () => {
    expect(() => validateLeadOff(leadOff())).not.toThrow();
    for (const patch of [{ isRelay: true }, { status: 'DQ' }, { leadOffVerification: { ...leadOff().leadOffVerification, timingVerified: false } }, { parentRelayResultId: undefined }]) expect(() => validateLeadOff({ ...leadOff(), ...patch })).toThrow();
    // Parent status is deliberately not consulted: a later teammate DQ does not invalidate a verified first leg.
    expect(() => validateLeadOff({ ...leadOff(), parentRelayStatus: 'DQ' })).not.toThrow();
  });
  it('orders relay prerequisites before lead-offs and resolves lineup dependencies', () => {
    const refs = reviewDependencies([{ path: 'relay_results/relay-1', after: relay() }, { path: 'swims/lead-1', after: leadOff() }]);
    expect([...refs.teams]).toEqual(['club']);
    expect([...refs.athletes].sort()).toEqual(['a', 'b']);
    expect([...refs.meets]).toEqual(['meet']);
    expect([...refs.relay_results]).toEqual([]);
    expect([...reviewDependencies([{ path: 'swims/lead-1', after: leadOff() }]).relay_results]).toEqual(['relay-1']);
  });
  it('labels team results in the review queue without an invented athlete link', () => {
    expect(raceSummary(relay(), {})).toMatchObject({ swimmer: 'Club A', event: '200 Medley relay', time: '2:20.00' });
  });
});
