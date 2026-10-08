import { describe, expect, it } from 'vitest';
import { matchImportAthlete, parseImportBatch, validateImportData } from '@/features/swim-resources/lib/domain/import-batch';
import { rosterBatch } from '../../scripts/swim-resources/lib/roster-batch.mjs';

const athlete = { id: 'one', teamUnifyId: 'tu1', name: { first: 'Alex', last: 'Lee' }, dob: '2012-01-01', status: 'active' };
describe('source-grounded roster identity', () => {
  it('prefers external ids and holds ambiguous names and conflicting identifiers', () => {
    const other = { ...athlete, id: 'two', teamUnifyId: 'tu2' };
    expect(matchImportAthlete({ teamUnifyId: 'tu1', name: { first: 'Different', last: 'Spelling' } }, [athlete, other])).toEqual({ id: 'one' });
    expect(matchImportAthlete({ name: athlete.name }, [athlete, other]).conflict).toContain('Ambiguous');
    expect(matchImportAthlete({ id: 'two', teamUnifyId: 'tu1' }, [athlete, other]).conflict).toContain('different');
    expect(matchImportAthlete({ name: athlete.name, dob: '2012-01-02' }, [athlete]).conflict).toContain('birth');
  });
  it('never deactivates omissions from filtered exports or blanks, and preserves duplicate names for review', () => {
    const source = { id: 'export', name: 'Fixture', revisionId: 'a'.repeat(64), checkId: 'check', target: { project: 'synthetic-project', database: 'velocity-v2' }, kind: 'roster_export', reference: 'fixture:export', collectedAt: '2026-10-06T17:00:00Z', coverage: 'partial', scope: 'Filtered' };
    const batch = rosterBatch([{ 'Memb. First Name': 'Alex', 'Memb. Last Name': 'Lee', Birthday: '1/1/2012', Location: '', ID: 'tu1' }], [athlete, { ...athlete, id: 'two', teamUnifyId: 'tu2', name: { first: 'Other', last: 'Person' } }], source, 'batch', { teamUnifyId: 'ID' });
    expect(batch.rows[0].data).not.toHaveProperty('status');
    expect(batch.rows).toHaveLength(1);
    expect(batch.unresolved).toHaveLength(2);
    expect(parseImportBatch(batch)).toBe(batch);
    const duplicate = rosterBatch([{ 'Memb. First Name': 'Alex', 'Memb. Last Name': 'Lee' }, { 'Memb. First Name': 'Alex', 'Memb. Last Name': 'Lee' }], [athlete, { ...athlete, id: 'two', teamUnifyId: 'tu2' }], source, 'batch');
    expect(duplicate.rows).toHaveLength(2);
    expect(duplicate.rows.every((row: { verified: boolean }) => !row.verified)).toBe(true);
  });
  it('rejects unsafe fields, nested coaching notes and fabricated metadata', () => {
    expect(() => validateImportData('athlete', { contact: { notes: 'overwrite' } })).toThrow('Unsupported');
    expect(() => validateImportData('athlete', { goals: [] })).toThrow('cannot write');
    expect(() => validateImportData('swim', { timeMs: 54000 })).toThrow('observed');
    expect(() => parseImportBatch('{"version":1,"__proto__":{}}')).toThrow('Unsafe');
  });
  it('reads modern export values, keeps alumni intent, and omits unrelated historical memberships', () => {
    const source = { id: 'export', name: 'Fixture', revisionId: 'a'.repeat(64), checkId: 'check', target: { project: 'synthetic-project', database: 'velocity-v2' }, kind: 'roster_export', reference: 'fixture:export', collectedAt: '2026-10-06T17:00:00Z', coverage: 'complete', scope: 'All non-deleted memberships' };
    const batch = rosterBatch([
      { 'Memb. First Name': 'Alex', 'Memb. Last Name': 'Lee', Birthday: '2012-01-01 00:00:00', Gender: 'Male', Roster: 'Seniors', 'Billing Group': 'Not Assigned', Location: 'Leave of Absence', 'Member Status': 'Active' },
      { 'Memb. First Name': 'Historical', 'Memb. Last Name': 'Member', Birthday: '1/1/1980', 'Member Status': 'Cancelled/Hidden' },
    ], [athlete], source, 'batch');
    expect(batch.rows).toHaveLength(1);
    expect(batch.rows[0].data).toMatchObject({ dob: '2012-01-01', gender: 'M', currentGroup: { name: 'Seniors' }, status: 'taking_break' });
    expect(batch.unresolved[0].message).toContain('1 unmatched non-active');
  });
});
