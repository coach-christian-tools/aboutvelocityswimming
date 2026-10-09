import { describe, expect, it } from 'vitest';
import { initialProvenance, reconcileObservation, recordCheck, freshness, semanticFacts, type EvidenceBinding, type EvidenceSource, type ObservationEvidence } from '../../src/features/swim-resources/lib/domain/evidence';
import { databaseId, importDirectory } from '../../src/features/swim-resources/lib/domain/database-target';
import { encodeValue, decodeValue, verifyArchive, storageReferences, publishDatasetArchive, collectionCounts } from '../../scripts/swim-resources/lib/dataset-archive.mjs';
import { hashBytes, archiveCapture, privatePath } from '../../scripts/swim-resources/lib/evidence-archive.mjs';
import { adminDatabase } from '../../scripts/swim-resources/lib/admin.mjs';
import { collectHttp, publicAddress } from '../../scripts/swim-resources/lib/source-collector.mjs';
import { currentStandard } from '../../src/features/swim-resources/lib/domain/standards';
import { validateImportData } from '../../src/features/swim-resources/lib/domain/import-batch';
import type { StandardSet } from '../../src/features/swim-resources/types/schema';
const at = '2026-10-07T12:00:00Z', later = '2026-10-08T12:00:00Z';
const source: EvidenceSource = { id: 'official', name: 'Official', reference: 'https://example.test', kind: 'website', scope: 'Current season', retrieval: 'http', intervalDays: 30, enabled: true };
const binding: EvidenceBinding = { id: 'meet', sourceId: source.id, targetPath: 'meets/test', fields: ['name', 'host'], context: 'season-2026', priority: 1 };
const evidence: ObservationEvidence = { sourceId: source.id, revisionId: 'a'.repeat(64), checkId: 'first', checkedAt: at, fields: ['name', 'host'], context: binding.context, excerpt: 'Synthetic official name and host.' };
const observe = (overrides: Partial<Parameters<typeof reconcileObservation>[0]> = {}) => reconcileObservation({ before: { name: 'Meet', host: 'Club' }, provenance: initialProvenance(binding.targetPath, 'external'), source, binding, evidence, claims: { name: 'Meet', host: 'Club' }, eventId: 'first', ...overrides });
describe('field-scoped evidence policy', () => {
  it('advances checks without advancing unchanged fact dates', () => {
    const first = observe();
    expect(first.changed).toBe(false); expect(first.provenance.lastChangedAt).toBeNull();
    const second = observe({ provenance: first.provenance, evidence: { ...evidence, checkId: 'second', checkedAt: later } });
    expect(second.provenance.lastSuccessfulCheckAt).toBe(later); expect(second.provenance.lastChangedAt).toBeNull();
  });
  it('accepts a stronger scoped source, retaining the competing claim and resolution reason', () => {
    const first = observe();
    first.provenance.accepted.host.priority = 5;
    first.provenance.accepted.host.sourceId = 'club';
    const result = observe({ provenance: first.provenance, evidence: { ...evidence, checkId: 'second', checkedAt: later }, claims: { name: 'Meet', host: 'Official club' } });
    expect(result.after.host).toBe('Official club'); expect(result.provenance.lastChangedAt).toBe(later);
    expect(result.disagreements).toEqual([expect.objectContaining({ field: 'host', current: 'Club', proposed: 'Official club', resolved: true, reason: 'preferred_source' })]);
  });
  it('holds ties, unranked or different-context changes and protected roster fields', () => {
    const first = observe();
    for (const override of [{ binding: { ...binding, priority: null }, evidence: { ...evidence, checkId: 'unranked' } }, { source: { ...source, id: 'other' }, binding: { ...binding, sourceId: 'other' }, evidence: { ...evidence, sourceId: 'other', checkId: 'next' } }, { binding: { ...binding, context: 'other' }, evidence: { ...evidence, context: 'other', checkId: 'next' } }]) {
      const result = observe({ provenance: first.provenance, claims: { name: 'Changed', host: 'Club' }, ...override });
      expect(result.after.name).toBe('Meet'); expect(result.provenance.needsAttention).toBe(true);
    }
    const targetPath = 'athletes/test';
    const protectedResult = observe({ provenance: initialProvenance(targetPath, 'external'), binding: { ...binding, targetPath }, claims: { name: 'Changed', host: 'Club' } });
    expect(protectedResult.changed).toBe(false);
  });
  it('refreshes only covered fields; failed and partial checks retain successful dates', () => {
    const first = observe();
    const failed = recordCheck(first.provenance, source.id, later, 'Archive unavailable');
    expect(failed.lastSuccessfulCheckAt).toBe(at); expect(failed.accepted).toEqual(first.provenance.accepted);
    const partial = observe({ provenance: failed, evidence: { ...evidence, fields: ['name'], checkedAt: later, checkId: 'partial' } });
    expect(partial.provenance.accepted.name.checkedAt).toBe(later); expect(partial.provenance.accepted.host.checkedAt).toBe(at);
    expect(partial.provenance.failures.official).toBe('Archive unavailable');
    expect(freshness(partial.provenance, Date.parse('2026-11-06T13:00:00Z')).due).toEqual(['host']);
  });
  it('does not mark uncovered fields fresh, and rejects stale or contradictory replay claims', () => {
    const partial = observe({ evidence: { ...evidence, fields: ['name'] } });
    expect(freshness(partial.provenance, Date.parse(at))).toMatchObject({ fullyChecked: false, needsAttention: true, due: ['host'] });
    expect(() => observe({ provenance: observe().provenance, claims: { name: 'Other', host: 'Club' } })).toThrow('competing values');
    expect(() => observe({ provenance: observe().provenance, evidence: { ...evidence, checkedAt: '2026-01-01T00:00:00Z' } })).toThrow('predates');
    expect(() => observe({ binding: { ...binding, fields: ['id'] } })).toThrow('binding');
    expect(semanticFacts({ name: 'A', updatedAt: at })).toBe(semanticFacts({ name: 'A', updatedAt: later }));
  });
  it('retains stronger authority on corroboration, with the confirming source interval', () => {
    const first = observe();
    const second = observe({ provenance: first.provenance, source: { ...source, id: 'club', intervalDays: 7 }, binding: { ...binding, sourceId: 'club', priority: 5 }, evidence: { ...evidence, sourceId: 'club', checkId: 'second', checkedAt: later } });
    expect(second.provenance.accepted.name.sourceId).toBe('official');
    expect(second.provenance.accepted.name.confirmedBy?.sourceId).toBe('club');
    expect(freshness(second.provenance, Date.parse(later) + 8 * 86400000).due).toEqual(['name', 'host']);
    expect(observe({ source: { ...source, kind: 'manual' } }).provenance.lastSuccessfulCheckAt).toBeNull();
  });
});
describe('database and immutable archive boundaries', () => {
  it('keeps projects/databases separated and preserves rollback defaults', () => {
    expect(databaseId()).toBe('(default)'); expect(databaseId('velocity-v2')).toBe('velocity-v2');
    expect(importDirectory('demo-a', '(default)')).not.toBe(importDirectory('demo-a', 'velocity-v2'));
    expect(() => importDirectory('../private', 'velocity-v2')).toThrow(); expect(() => privatePath('public/evidence.html')).toThrow();
  });
  it('rejects an old backend target before creating a collector', () => {
 const args=process.argv;try {process.argv=['node','fixture','--project','old-firebase','--database','(default)'];expect(()=>adminDatabase()).toThrow('Supply SUPABASE_URL');}finally{process.argv=args;}
  });
  it('preserves application values and detects archive tampering', () => {
    const input={literal:{type:'timestamp',seconds:5},time:new Date(at),bytes:Buffer.from('private'),values:[NaN,Infinity,null,true]};
    const encoded=encodeValue(input),decoded=decodeValue(encoded);expect(encodeValue(decoded)).toEqual(encoded);
    const entries = [{ path: 'test/record', data: encoded, hash: hashBytes(JSON.stringify(encoded)) }];
    const archive = { version: 2, provider: 'supabase', entries, fingerprint: hashBytes(JSON.stringify(entries.map(e => [e.path, e.hash]))) };
    verifyArchive(archive); entries[0].hash = 'wrong'; expect(() => verifyArchive(archive)).toThrow('checksum');
    expect([...storageReferences({ bucket: 'private.test', storagePath: 'evidence/capture' })]).toHaveLength(1);
  });
  it('reuses identical bytes and refuses collisions or overwrites', async () => {
    const bytes = Buffer.from('private fixture'), hash = hashBytes(bytes);
    const file = { save: async () => { throw { code: 412 }; }, download: async () => [bytes], getMetadata: async () => [{ generation: '1' }] };
    const storage = { bucket: () => ({ file: () => file }) };
    const revision = await archiveCapture({ project: 'demo-test', database: 'velocity-v2' }, 'private.test', 'official', { hash, contentType: 'text/html', at }, bytes, storage as unknown as NonNullable<Parameters<typeof archiveCapture>[5]>);
    expect(revision.storagePath).toBe(`evidence/demo-test/velocity-v2/official/${hash}`);
    file.download = async () => [Buffer.from('changed')];
    await expect(archiveCapture({ project: 'demo-test', database: 'velocity-v2' }, 'private.test', 'official', { hash, contentType: 'text/html', at }, bytes, storage as unknown as NonNullable<Parameters<typeof archiveCapture>[5]>)).rejects.toThrow('corruption');
  });
  it('verifies deduplicated archived files before publishing a completion manifest', async () => {
    const bytes = Buffer.from('same document'), hash = hashBytes(bytes), saved = new Map<string, Buffer>(), order: string[] = [];
    const storage = { bucket: () => ({ file: (path: string) => ({ save: async (value: Buffer) => { if (saved.has(path)) throw new Error('overwrite'); order.push(path); saved.set(path, value); }, download: async () => [saved.get(path)] }) }) };
    const archive = { version: 2, provider: 'supabase', entries: [], counts: collectionCounts([]), fingerprint: hashBytes('[]'), files: [{ bucket: 'old', object: 'one', hash, size: bytes.length }, { bucket: 'old', object: 'two', hash, size: bytes.length }] };
    await publishDatasetArchive(storage, 'private', 'qualified/archive', archive, async () => bytes);
    expect(order).toEqual([`qualified/archive/${hash}`, 'qualified/archive/dataset.json']);
    order.length = 0;
    await expect(publishDatasetArchive(storage, 'private', 'failed/archive', archive, async () => Buffer.from('corrupt'))).rejects.toThrow('checksum');
    expect(order).toEqual([]);
    expect(() => verifyArchive({ ...archive, counts: { people: 2 } })).toThrow('counts');
  });
  it('bounds public captures and blocks private redirect destinations', async () => {
    const resolver = async () => [{ address: '203.0.113.10' }];
    const fetcher = async () => new Response('same bytes', { headers: { 'content-type': 'text/html' } });
    expect((await collectHttp('https://example.test', fetcher, resolver as unknown as NonNullable<Parameters<typeof collectHttp>[2]>)).hash).toBe(hashBytes(Buffer.from('same bytes')));
    await expect(collectHttp('https://example.test', async () => new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } }), resolver as unknown as NonNullable<Parameters<typeof collectHttp>[2]>)).rejects.toThrow('private');
    await expect(collectHttp('https://example.test', async () => new Response('x', { headers: { 'content-length': String(21 * 1024 * 1024) } }), resolver as unknown as NonNullable<Parameters<typeof collectHttp>[2]>)).rejects.toThrow('size');
    expect(publicAddress('10.0.0.1')).toBe(false); expect(publicAddress('::1')).toBe(false);
  });
});

describe('current fresh standards', () => {
  const standard: StandardSet = { id: 'current', category: 'motivational', name: 'Current', governingBody: 'USA_Swimming', seasonYears: '2026', effectiveDate: '2026-01-01', expirationDate: '2026-12-31', cuts: { SCY: { F: { '13-14': { '100_FR_SCY': { cutsByTier: [{ tierName: 'A', timeMs: 60000, timeDisplay: '1:00.00' }] } } } } } };
  it('keeps empty/expired views empty and chooses effective imported sets', () => {
    expect(currentStandard([], 'motivational')).toBeNull();
    expect(currentStandard([standard], 'motivational', '2027-01-01')).toBeNull();
    expect(currentStandard([standard], 'motivational', '2026-10-07')).toEqual(standard);
    validateImportData('standard', standard as unknown as Record<string, unknown>);
    expect(() => validateImportData('standard', { ...standard, cuts: { SCY: { F: { '13-14': { '100_FR_SCY': { cutsByTier: [{ tierName: 'A', timeMs: 60000, timeDisplay: '1:00.00', privateEmail: 'secret' }] } } } } } })).toThrow('cuts');
  });
});
