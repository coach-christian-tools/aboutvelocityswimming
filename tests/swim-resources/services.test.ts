import { factFields } from '@/features/swim-resources/lib/domain/evidence';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ documents: new Map<string, Record<string, unknown>>(), failNextCommit: false, failAtCommit: 0, commits: 0 }));
vi.mock('@/features/swim-resources/lib/backend', () => ({ db: {}, BACKEND_PROJECT_ID: 'synthetic-project', DATASET_ID: 'velocity-v2', auth: { currentUser: { uid: 'coach', email: 'coach@velocity-swimming.com', emailVerified: true, staff:true } } }));
vi.mock('@/lib/supabase/client',()=>({browserClient:()=>({rpc:async()=>({data:{totalBestsWritten:[...mock.documents.keys()].filter(k=>k.startsWith('swims/')).length,athletesCount:1},error:null})})}));
vi.mock('@/lib/data', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/data')>();
  const path = (...parts: unknown[]) => parts.filter(p => typeof p === 'string').join('/');
  const snapshot = (reference: string) => ({ id: reference.split('/').at(-1), ref: reference, exists: () => mock.documents.has(reference), data: () => mock.documents.get(reference) });
  const batch = () => {
    const changes: (() => void)[] = [];
    return {
      set: (reference: string, value: Record<string, unknown>) => changes.push(() => mock.documents.set(reference, structuredClone(value))),
      update: (reference: string, value: Record<string, unknown>) => changes.push(() => mock.documents.set(reference, { ...mock.documents.get(reference), ...structuredClone(value) })),
      delete: (reference: string) => changes.push(() => mock.documents.delete(reference)),
      commit: async () => {
        mock.commits++;
        if (mock.failNextCommit || mock.commits === mock.failAtCommit) { mock.failNextCommit = false; throw new Error('Synthetic write failure'); }
        changes.forEach(commit => commit());
      },
    };
  };
  return { ...original, collection: path, doc: path, query: (reference: string) => reference, orderBy: () => {}, limit: () => {},
    getDoc: async (reference: string) => snapshot(reference),
    setDoc: async (reference: string, value: Record<string, unknown>) => { mock.documents.set(reference, structuredClone(value)); },
    getDocs: async (reference: string) => {
      const docs = [...mock.documents.keys()].filter(p => p.startsWith(`${reference}/`) && !p.slice(reference.length + 1).includes('/')).sort().map(snapshot);
      return { docs, size: docs.length, empty: !docs.length, forEach: (fn: (document: ReturnType<typeof snapshot>) => void) => docs.forEach(fn) };
    },
    writeBatch: batch,
    runTransaction: async (_db: unknown, work: (transaction: unknown) => Promise<unknown>) => {
      const changes = batch(); const result = await work({ ...changes, get: async (reference: string) => snapshot(reference) });
      await changes.commit(); return result;
    },
  };
});
import { canonicalAthlete, writeAthlete, attendanceLocation } from '@/features/swim-resources/lib/services/athletes';
import { refreshSwimProjections } from '@/features/swim-resources/lib/services/swim-projections';
import { saveMeet } from '@/features/swim-resources/lib/services/meet-tools';
import { importedProvenance } from '@/features/swim-resources/lib/services/evidence';

const validSwim = { id: 's1', athleteId: 'a1', athleteName: { first: 'Test', last: 'Swimmer' }, gender: 'F' as const,
  ageAtSwim: 14, ageGroup: '13-14' as const, distance: 100 as const, stroke: 'FR' as const, eventCode: '100_FR_SCY',
  course: 'SCY' as const, isRelay: false, timeMs: 54000, status: 'OK' as const, round: 'F' as const,
  meet: { id: 'm1', name: 'Test Meet', date: '2026-01-01' } };

beforeEach(() => { mock.documents.clear(); mock.documents.set('teams/velocity-swimming', { id: 'velocity-swimming', name: 'Velocity Swimming' }); mock.documents.set('sources/source', { id: 'source', name: 'Fixture', kind: 'result_file', reference: 'fixture:results', retrieval: 'local', intervalDays: 30, enabled: true, scope: 'Synthetic test' }); mock.documents.set('sources/source/checks/check', { outcome: 'retrieved', revisionId: 'a'.repeat(64), at: '2026-10-06T17:00:00Z' }); mock.documents.set('sources/source/revisions/' + 'a'.repeat(64), { hash: 'a'.repeat(64) }); mock.failNextCommit = false; mock.failAtCommit = 0; mock.commits = 0; });
describe('mixed import evidence', () => {
  it('preserves external verification when manual ownership is checked in either order', async () => {
    mock.documents.set('sources/ownership', { id: 'ownership', name: 'Approved ownership', kind: 'manual', reference: 'manual:ownership', retrieval: 'local', intervalDays: 30, enabled: true, scope: 'Ownership' });
    const external = { sourceId: 'source', revisionId: 'a'.repeat(64), checkId: 'external', checkedAt: '2026-10-06T17:00:00Z', fields: ['name'], context: 'Directory', excerpt: 'Verified synthetic person name.' };
    const manual = { ...external, sourceId: 'ownership', checkId: 'manual', checkedAt: '2026-10-07T17:00:00Z', fields: ['teamId'], context: 'Ownership', excerpt: 'User-approved team ownership.' };
    const after = { name: 'Synthetic Contact', teamId: 'velocity-swimming' };
    const get = async (path: string) => ({ data: () => mock.documents.get(path) });
    for (const evidence of [[external, manual], [manual, external]]) {
      const provenance = await importedProvenance('people/test', undefined, null, after, evidence, 'event', get);
      expect(provenance).toMatchObject({ origin: 'external', lastSuccessfulCheckAt: external.checkedAt, accepted: { name: { origin: 'external' }, teamId: { origin: 'manual' } } });
      const repeated = await importedProvenance('people/test', provenance, after, after, [manual], 'repeat', get);
      expect(repeated.lastSuccessfulCheckAt).toBe(external.checkedAt);
      expect(repeated.lastChangedAt).toBe(provenance.lastChangedAt);
    }
    const manualOnly = await importedProvenance('people/test', undefined, null, after, [{ ...manual, fields: ['name', 'teamId'] }], 'manual-only', get);
    expect(manualOnly).toMatchObject({ origin: 'manual', lastSuccessfulCheckAt: null });
  });
});
describe('canonical athlete writes', () => {
  it('preserves omitted demographics, contact siblings, metadata and group tenure', () => {
    const previous = { id: 'a1', name: { first: 'Test', last: 'Swimmer' }, dob: '2000-01-01', gender: 'F', status: 'inactive' as const,
      currentGroup: { id: 'seniors', name: 'Seniors', assignedAt: '2020-01-01' }, contact: { email: 'old', phone: 'keep' }, metadata: { createdAt: '2020-01-01' } };
    expect(canonicalAthlete(previous, { contact: { email: '' } })).toMatchObject({ dob: '2000-01-01', gender: 'F', status: 'inactive',
      currentGroup: previous.currentGroup, contact: { email: '', phone: 'keep' }, metadata: { createdAt: '2020-01-01' } });
  });
  it('validates calendar dates, keeps canonical IDs, and removes dotted legacy updates', () => {
    expect(() => canonicalAthlete({ id: 'a', name: { first: 'Test', last: 'Swimmer' } }, { dob: '2026-02-31' })).toThrow('date of birth');
    expect(canonicalAthlete({ id: 'a', name: { first: 'Test', last: 'Swimmer' } }, { id: 'other', 'metadata.updatedAt': 'old' } as never))
      .toMatchObject({ id: 'a' });
    expect(Object.keys(canonicalAthlete({ id: 'a', name: { first: 'Test', last: 'Swimmer' } }, { 'metadata.updatedAt': 'old' } as never)))
      .not.toContain('metadata.updatedAt');
  });
  it('updates both privacy projections atomically and removes legacy mirrors', async () => {
    mock.documents.set('athletes/a1', { id: 'a1', firstName: 'Test', lastName: 'Swimmer', location: 'Active', dob: '2000-01-01', email: 'private' });
    await writeAthlete('a1', { status: 'inactive' });
    expect(mock.documents.get('athletes/a1')).toMatchObject({ status: 'inactive', contact: { email: 'private' } });
    expect(mock.documents.get('athletes/a1')).not.toHaveProperty('location');
    expect(mock.documents.get('public_athletes/a1')).not.toHaveProperty('contact');
    expect(attendanceLocation('inactive', 'Active')).toBe('Inactive');
  });
});

describe('database projection status',()=>{
 it('reports committed counts without scanning or writing result collections',async()=>{
 const reads=vi.spyOn(await import('@/lib/data'),'getDocs');reads.mockClear();
 mock.documents.set('swims/s1',validSwim);expect(await refreshSwimProjections()).toEqual({bestsUpdated:1});expect(reads).not.toHaveBeenCalled();reads.mockRestore();
 });
});

describe('meet editor persistence', () => {
  it('saves blank optional fields, clears previous values and preserves unrelated metadata', async () => {
    mock.documents.set('meets/demo', { createdAt: '2020-01-01', sanctionNumber: 'old', totalEntries: 42, dates: { entryDeadline: '2026-01-01', endDate: '2026-02-04' } });
    await saveMeet({ id: 'demo', name: 'Demo Meet', sanctionNumber: undefined, dates: { startDate: '2026-02-01', endDate: undefined }, venue: { course: 'SCY' }, events: [] });
    expect(mock.documents.get('meets/demo')).toMatchObject({ createdAt: '2020-01-01', totalEntries: 42, dates: { startDate: '2026-02-01', entryDeadline: '2026-01-01' } });
    expect(mock.documents.get('meets/demo')).not.toHaveProperty('sanctionNumber');
    expect(mock.documents.get('meets/demo')).not.toHaveProperty('dates.endDate');
  });
});

import { acknowledgeImportItem, applyImportBatch, previewImportBatch, loadImportReceipts, reverseImportChanges, retryImportProjections } from '@/features/swim-resources/lib/services/import-batches';
import type { ImportBatch, ImportRow } from '@/features/swim-resources/lib/domain/import-batch';
const importedAthlete = { id: 'a1', teamUnifyId: 'tu1', name: { first: 'Test', last: 'Swimmer' }, dob: '2012-01-01', gender: 'F', status: 'active', currentGroup: { id: 'juniors', name: 'Juniors', assignedAt: '2025-01-01' }, aliases: [], styling: { notes: 'Coach note' }, contact: { email: 'private', phone: 'keep' }, metadata: { createdAt: '2025-01-01', updatedAt: '2025-01-01' } };
type TestRow = Omit<ImportRow, 'evidence'>;
const evidenceFor = (data: Record<string, unknown>) => [{ sourceId: 'source', revisionId: 'a'.repeat(64), checkId: 'check', checkedAt: '2026-10-06T17:00:00Z', fields: factFields(data).length ? factFields(data) : ['id'], context: 'Synthetic test', excerpt: 'Synthetic verified fact' }];
function importBatch(rows: TestRow[], id = 'batch1'): ImportBatch {
  mock.documents.set('sources/source/checks/' + id, { outcome: 'retrieved', revisionId: 'a'.repeat(64), at: '2026-10-06T17:00:00Z' });
  return { version: 3, target: { provider: 'supabase', project: 'synthetic-project', database: 'velocity-v2' }, id, collectedAt: '2026-10-06T17:00:00Z', sources: [{ id: 'source', name: 'Verified fixture', revisionId: 'a'.repeat(64), checkId: id, kind: 'result_file', reference: 'fixture:results', collectedAt: '2026-10-06T17:00:00Z', coverage: 'complete', scope: 'Synthetic test' }], rows: rows.map(row => ({ ...row, evidence: evidenceFor(row.data).map(e => ({ ...e, checkId: id })) })), unresolved: [] };
}
const athleteRow = (data: Record<string, unknown>, id = 'row1'): TestRow => ({ id, kind: 'athlete', sourceIds: ['source'], verified: true, data });
const raceRow = (data: Record<string, unknown>, id = 'race1'): TestRow => ({ id, kind: 'swim', sourceIds: ['source'], verified: true, data });
describe('reviewed import batches', () => {
  beforeEach(() => { mock.documents.set('athletes/a1', structuredClone(importedAthlete)); });
  it('preserves private coaching fields and omitted siblings, publishes safely, and repeats without duplicates', async () => {
    const batch = importBatch([athleteRow({ teamUnifyId: 'tu1', contact: { email: 'new' } })]);
    const preview = await previewImportBatch(batch);
    expect(preview.rows[0].status).toBe('change');
    expect(await applyImportBatch(preview, ['row1'])).toMatchObject({ applied: 1, projectionsPending: false });
    expect(mock.documents.get('athletes/a1')).toMatchObject({ styling: { notes: 'Coach note' }, contact: { email: 'new', phone: 'keep' } });
    expect(mock.documents.get('public_athletes/a1')).not.toHaveProperty('contact');
    expect(await applyImportBatch(preview, ['row1'])).toMatchObject({ applied: 0, alreadyApplied: 1 });
    expect((await previewImportBatch(batch)).rows[0].status).toBe('checked');
    expect((await loadImportReceipts('batch1'))[0].before).toMatchObject({ contact: { email: 'private' } });
  });
  it('aborts a whole selection on an intervening edit or interrupted transaction', async () => {
    const batch = importBatch([athleteRow({ id: 'a1', status: 'inactive' }), { id: 'meet', kind: 'meet', verified: true, sourceIds: ['source'], data: { id: 'm1', name: 'Meet', dates: { startDate: '2026-11-01' }, venue: { course: 'SCY' } } }]);
    const preview = await previewImportBatch(batch);
    mock.documents.set('athletes/a1', { ...importedAthlete, styling: { notes: 'Intervening note' } });
    await expect(applyImportBatch(preview, ['row1', 'meet'])).rejects.toThrow('changed since preview');
    expect(mock.documents.has('meets/m1')).toBe(false);
    const refreshed = await previewImportBatch(batch); mock.failNextCommit = true;
    await expect(applyImportBatch(refreshed, ['row1', 'meet'])).rejects.toThrow('Synthetic');
    expect(mock.documents.has('import_batches/batch1')).toBe(false);
    await applyImportBatch(refreshed, ['row1', 'meet']);
    expect(mock.documents.get('athletes/a1')?.styling).toEqual({ notes: 'Intervening note' });
  });
  it('reverses reviewed updates and stops before overwriting a later coach edit', async () => {
    const preview = await previewImportBatch(importBatch([athleteRow({ id: 'a1', status: 'inactive' })]));
    await applyImportBatch(preview, ['row1']);
    expect(await reverseImportChanges('batch1', ['row1'])).toMatchObject({ reversed: 1 });
    expect(mock.documents.get('athletes/a1')).toEqual(importedAthlete);
    await expect(applyImportBatch(preview, ['row1'])).rejects.toThrow('reversed row');
    const next = await previewImportBatch(importBatch([athleteRow({ id: 'a1', status: 'inactive' })], 'batch2'));
    await applyImportBatch(next, ['row1']);
    mock.documents.get('athletes/a1')!.styling = { notes: 'After import' };
    await expect(reverseImportChanges('batch2', ['row1'])).rejects.toThrow('coach changed');
    expect((await loadImportReceipts('batch2'))[0].state).toBe('applied');
  });
  it('holds conflicting dates/deadlines, unsafe fields, incomplete PBs, and unverified rows', async () => {
    const meet = { id: 'm1', name: 'Meet', dates: { startDate: '2026-11-01', entryDeadline: '2026-10-20' }, venue: { course: 'SCY' } };
    const batch = importBatch([
      { id: 'm1', kind: 'meet', sourceIds: ['source'], verified: true, data: meet },
      { id: 'm2', kind: 'meet', sourceIds: ['source'], verified: true, data: { ...meet, dates: { startDate: '2026-11-02', entryDeadline: '2026-10-21' } } },
      athleteRow({ id: 'a1', styling: { notes: 'Overwrite' } }),
      raceRow({ ...validSwim, round: undefined } as unknown as Record<string, unknown>),
    ]);
    delete batch.rows[3].data.round;
    expect((await previewImportBatch(batch)).rows.every(row => row.status === 'conflict')).toBe(true);
    batch.rows = importBatch([{ ...athleteRow({ id: 'a1', status: 'inactive' }), verified: false }]).rows;
    expect((await previewImportBatch(batch)).rows[0].status).toBe('skipped');
  });
  it('reconciles duplicate race IDs, separates courses, excludes DQs, and recalculates after reversal', async () => {
    mock.documents.set('swims/s1', { ...validSwim, timeDisplay: '54.00', metadata: { source: 'manual', createdAt: '2026-01-01' } });
    const slowerCourse = { ...validSwim, id: 'scm', course: 'SCM', eventCode: '100_FR_SCM', timeMs: 58000 };
    const dq = { ...validSwim, id: 'dq', status: 'DQ', timeMs: 0, meet: { ...validSwim.meet, id: 'm2', date: '2026-01-02' } };
    const duplicate = await previewImportBatch(importBatch([raceRow({ ...validSwim, id: 'alternate', timeMs: 53000 })]));
    expect(duplicate.rows[0].status).toBe('conflict');
    const batch = importBatch([raceRow({ ...validSwim, id: 's1', timeMs: 53000 }), raceRow(slowerCourse, 'scm'), raceRow(dq, 'dq')]);
    const preview = await previewImportBatch(batch);
    expect(preview.rows[0]).toMatchObject({ status: 'change', targetId: 's1' });
    expect(preview.rows.every(row => row.status !== 'conflict')).toBe(true);
    await applyImportBatch(preview, ['race1', 'scm', 'dq']);
    expect(mock.documents.has('swims/alternate')).toBe(false);
    expect(mock.documents.get('swims/s1')?.timeMs).toBe(53000);
    expect(mock.documents.get('swims/scm')?.course).toBe('SCM');
    await reverseImportChanges('batch1', ['race1', 'scm', 'dq']);
    expect(mock.documents.get('swims/s1')?.timeMs).toBe(54000);
    expect(mock.documents.has('swims/scm')).toBe(false);
  });
  it('persists pending projection failures and supports recovery without rewriting imported races', async () => {
    const preview = await previewImportBatch(importBatch([raceRow(validSwim)]));
    mock.failAtCommit = 2;
    expect(await applyImportBatch(preview, ['race1'])).toMatchObject({ applied: 1, projectionsPending: true });
    expect(mock.documents.get('import_batches/batch1')?.projectionState).toBe('pending');
    await retryImportProjections('batch1');
    expect(mock.documents.get('import_batches/batch1')?.projectionState).toBe('complete');
    expect((await loadImportReceipts('batch1')).length).toBe(1);
  });
  it('rejects altered preview observations and immutable batch id reuse', async () => {
    const preview = await previewImportBatch(importBatch([athleteRow({ id: 'a1', status: 'inactive' })]));
    const altered = structuredClone(preview); altered.rows[0].row = { ...altered.rows[0].row, data: { ...altered.rows[0].row.data, status: 'alumni' } };
    await expect(applyImportBatch(altered, ['row1'])).rejects.toThrow('Observation changed');
    await applyImportBatch(preview, ['row1']);
    const next = await previewImportBatch(importBatch([athleteRow({ id: 'a1', status: 'alumni' })]));
    await expect(applyImportBatch(next, ['row1'])).rejects.toThrow('different content');
  });
  it('does not turn legacy normalization into unchanged weekly review work', async () => {
    mock.documents.set('athletes/a1', { id: 'a1', firstName: 'Test', lastName: 'Swimmer', location: 'Active', group: 'Juniors', dob: '2012-01-01', gender: 'F' });
    const preview = await previewImportBatch(importBatch([athleteRow({ id: 'a1', currentGroup: { name: 'Juniors' }, status: 'active' })]));
    expect(preview.rows[0].status).toBe('checked');
    expect(preview.rows[0].fields).toEqual([]);
    expect(mock.documents.has('import_batches/batch1')).toBe(false);
  });
  it('updates a rescheduled meet under its existing identity, preserving omitted coaching data and supporting reversal', async () => {
    const previous = { id: 'scary', name: 'Very Scary', createdAt: '2025-01-01', totalEntries: 42,
      dates: { startDate: '2026-10-31', endDate: '2026-11-01', entryDeadline: '2026-10-28' },
      venue: { course: 'SCY', facilityName: 'Existing Pool' }, events: [] };
    mock.documents.set('meets/scary', structuredClone(previous));
    const batch = importBatch([{ id: 'reschedule', kind: 'meet', sourceIds: ['source'], verified: true,
      data: { id: 'scary', dates: { startDate: '2026-11-07', endDate: '2026-11-08' } } }]);
    const preview = await previewImportBatch(batch);
    expect(preview.rows[0].status).toBe('change');
    await applyImportBatch(preview, ['reschedule']);
    expect(mock.documents.get('meets/scary')).toMatchObject({ ...previous, dates: { ...previous.dates, startDate: '2026-11-07', endDate: '2026-11-08' } });
    expect([...mock.documents.keys()].filter(path => path.startsWith('meets/'))).toHaveLength(1);
    expect((await previewImportBatch({ ...batch, id: 'repeat' })).rows[0].status).toBe('checked');
    expect((await loadImportReceipts(batch.id))[0].before).toEqual(previous);
    await reverseImportChanges(batch.id, ['reschedule']);
    expect(mock.documents.get('meets/scary')).toEqual(previous);
  });
  it('keeps acknowledged unchanged issues quiet across batches and resurfaces changed observations', async () => {
    const batch = importBatch([{ ...athleteRow({ id: 'a1', status: 'inactive' }), verified: false }]);
    const preview = await previewImportBatch(batch);
    await acknowledgeImportItem(preview, 'row1');
    expect((await previewImportBatch({ ...batch, id: 'next' })).rows[0].reviewed).toBe(true);
    expect((await previewImportBatch(importBatch([{ ...athleteRow({ id: 'a1', status: 'alumni' }), verified: false }]))).rows[0].reviewed).toBeUndefined();
  });
  it('corrects an observed legacy round only with the canonical id and stable source result', async () => {
    mock.documents.set('swims/s1', { ...validSwim, timeDisplay: '54.00' });
    const held = await previewImportBatch(importBatch([raceRow({ ...validSwim, round: 'S' })]));
    expect(held.rows[0].status).toBe('conflict');
    const corrected = await previewImportBatch(importBatch([raceRow({ ...validSwim, round: 'S', externalResult: { namespace: 'swimcloud', id: '123' } })]));
    expect(corrected.rows[0].status).toBe('change');
    await applyImportBatch(corrected, ['race1']);
    expect(mock.documents.get('swims/s1')?.round).toBe('S');
  });
  it('keeps overlapping projection work pending until the shared refresh can run', async () => {
    mock.documents.set('import_state/projections', { owner: 'other-coach', leaseUntil: Date.now() + 600000, generation: 'earlier', state: 'pending' });
    const preview = await previewImportBatch(importBatch([raceRow(validSwim)]));
    expect(await applyImportBatch(preview, ['race1'])).toMatchObject({ applied: 1, projectionsPending: true });
    expect(mock.documents.get('import_state/projections')?.owner).toBe('other-coach');
    mock.documents.get('import_state/projections')!.leaseUntil = 0;
    await retryImportProjections('batch1');
    expect(mock.documents.get('import_state/projections')?.state).toBe('complete');
  });
});


it('retains distinct repeated swim-offs and matches the same external result across batch ids', async () => {
  mock.documents.set('athletes/a1', structuredClone(importedAthlete));
  const races = [1, 2].map(id => raceRow({ ...validSwim, id: 'source_' + id, round: 'S', externalResult: { namespace: 'swimcloud', id: String(id) } }, 'race' + id));
  const preview = await previewImportBatch(importBatch(races));
  expect(preview.rows.every(row => row.status === 'add')).toBe(true);
  await applyImportBatch(preview, ['race1', 'race2']);
  expect([...mock.documents.keys()].filter(key => key.startsWith('swims/'))).toHaveLength(2);
  expect((await previewImportBatch(importBatch(races, 'other_batch'))).rows.every(row => row.status === 'checked')).toBe(true);
});

describe('reviewed entity imports', () => {
  const entityRow = (kind: ImportRow['kind'], id: string, data: Record<string, unknown>): TestRow => ({ id: 'row_' + id, kind, sourceIds: ['source'], verified: true, data: { id, ...data } });
  it('connects teams, people, venues, meets, and source documents with receipts and no ranking refresh', async () => {
    const team = await previewImportBatch(importBatch([entityRow('team', 'velocity-swimming', { name: 'Velocity Swimming' })], 'team'));
    expect(await applyImportBatch(team, ['row_velocity-swimming'])).toMatchObject({ applied: 1, projectionsPending: false });
    const parents = await previewImportBatch(importBatch([
      entityRow('person', 'coach1', { name: 'Synthetic Coach', role: 'Head coach', email: 'coach@example.test' }),
      entityRow('venue', 'pool1', { name: 'Synthetic Pool', latitude: 47, longitude: -120 }),
    ], 'parents'));
    await applyImportBatch(parents, ['row_coach1', 'row_pool1']);
    const meet = await previewImportBatch(importBatch([entityRow('meet', 'meet1', { name: 'Synthetic Meet', dates: { startDate: '2026-11-01' }, venue: { course: 'SCY' }, venueId: 'pool1', hostTeamId: 'velocity-swimming', contactPersonIds: ['coach1'] })], 'meet'));
    await applyImportBatch(meet, ['row_meet1']);
    const document = await previewImportBatch(importBatch([entityRow('document', 'packet1', { name: 'Meet packet', url: 'https://example.test/meet.pdf', type: 'meet_packet', meetId: 'meet1', venueId: 'pool1', personId: 'coach1' })], 'packet'));
    await applyImportBatch(document, ['row_packet1']);
    expect(mock.documents.get('documents/packet1')).toMatchObject({ teamId: 'velocity-swimming', meetId: 'meet1', venueId: 'pool1', personId: 'coach1' });
    expect((await loadImportReceipts('packet'))[0].kind).toBe('document');
    expect(mock.documents.has('import_state/projections')).toBe(false);
    expect([...mock.documents.keys()].some(path => path.startsWith('public_athletes/'))).toBe(false);
    const changed = await previewImportBatch(importBatch([entityRow('document', 'packet1', { name: 'Revised packet' })], 'revision'));
    await applyImportBatch(changed, ['row_packet1']);
    await reverseImportChanges('revision', ['row_packet1']);
    expect(mock.documents.get('documents/packet1')?.name).toBe('Meet packet');
    await expect(reverseImportChanges('packet', ['row_packet1'])).rejects.toThrow('coaching references');
  });
  it('holds missing links and atomically rejects parent changes and forged relationship reviews', async () => {
    const rows = [entityRow('document', 'packet', { name: 'Packet', url: 'https://example.test/packet', meetId: 'missing' })];
    const held = await previewImportBatch(importBatch(rows));
    expect(held.rows[0]).toMatchObject({ status: 'conflict', reason: expect.stringContaining('does not exist') });
    mock.documents.set('meets/missing', { id: 'missing', name: 'Synthetic Meet' });
    const ready = await previewImportBatch(importBatch(rows));
    mock.documents.get('meets/missing')!.name = 'Changed after preview';
    await expect(applyImportBatch(ready, ['row_packet'])).rejects.toThrow('linked record changed');
    expect(mock.documents.has('documents/packet')).toBe(false);
    const fresh = await previewImportBatch(importBatch(rows));
    fresh.rows[0].relationshipDependencies = {};
    await expect(applyImportBatch(fresh, ['row_packet'])).rejects.toThrow('Relationship review is missing');
    expect(mock.documents.has('import_batches/batch1')).toBe(false);
  });
  it('links athletes to people privately and rejects race ownership mismatches', async () => {
    mock.documents.set('athletes/a1', structuredClone(importedAthlete));
    mock.documents.set('people/p1', { id: 'p1', name: 'Test Swimmer', athleteId: 'a1', teamId: 'velocity-swimming' });
    const roster = await previewImportBatch(importBatch([athleteRow({ id: 'a1', personId: 'p1' })]));
    await applyImportBatch(roster, ['row1']);
    expect(mock.documents.get('athletes/a1')).toMatchObject({ personId: 'p1', teamId: 'velocity-swimming' });
    expect(mock.documents.get('public_athletes/a1')).not.toHaveProperty('personId');
    expect(mock.documents.get('public_athletes/a1')).not.toHaveProperty('teamId');
    const mismatch = await previewImportBatch(importBatch([raceRow({ ...validSwim, teamId: 'another-team' })], 'race'));
    expect(mismatch.rows[0]).toMatchObject({ status: 'conflict', reason: expect.stringContaining('ownership differs') });
  });
});
