import { describe, expect, it } from 'vitest';
import { initialProvenance, recordCheck, hasAttentionReasons, type AcceptedField, type ReviewQuestion } from '../../src/features/swim-resources/lib/domain/evidence';
import { maintenanceRecord, maintenanceSource, maintenanceSelection, visibleMaintenance } from '../../src/features/swim-resources/lib/domain/maintenance';
import { updateReviewQuestions } from '../../scripts/swim-resources/lib/review-questions.mjs';

const at = '2026-10-07T12:00:00Z', now = Date.parse('2026-11-07T12:00:00Z');
const field: AcceptedField = { sourceId: 'official', revisionId: 'a'.repeat(64), checkId: 'check', checkedAt: at, fields: ['name'], context: 'Current', excerpt: 'Synthetic name', intervalDays: 30, priority: null, origin: 'external' };
const question: ReviewQuestion = { id: 'start', question: 'What is the confirmed start time?', fields: ['startTime'], evidence: [field], status: 'open', openedAt: at, updatedAt: at };
describe('maintenance policy', () => {
  it('distinguishes due, failed, missing, disagreement and question scopes without mutating facts', () => {
    const value = { ...initialProvenance('meets/test', 'external'), accepted: { name: field }, requiredFields: ['name', 'host'], lastChangedAt: at, lastSuccessfulCheckAt: at, failures: { official: 'Unavailable' }, openDisagreements: ['conflict'], reviewQuestions: [question] };
    const before = structuredClone(value), row = maintenanceRecord('record_provenance/key', value, now);
    expect(row.issues.map(issue => issue.kind)).toEqual(['overdue', 'missing', 'failed', 'disagreement', 'question']);
    expect(row).toMatchObject({ checkedAt: at, changedAt: at, dueAt: '2026-11-06T12:00:00.000Z', recordPath: 'meets/test' });
    expect(value).toEqual(before);
    expect(maintenanceRecord('record_provenance/key', { ...value, retired: true }, now).issues).toEqual([]);
  });
  it('uses field confirmations and excludes manual declarations and derived/audit records with no gaps', () => {
    const value = { ...initialProvenance('people/test', 'external'), accepted: { name: { ...field, confirmedBy: { ...field, checkedAt: '2026-11-01T12:00:00Z', intervalDays: 7 } }, teamId: { ...field, origin: 'manual' as const } } };
    expect(maintenanceRecord('record_provenance/key', value, now).issues).toEqual([]);
    for (const origin of ['derived', 'audit', 'manual'] as const) expect(maintenanceRecord('record_provenance/key', initialProvenance('people/test', origin), now).issues).toEqual([]);
    expect(maintenanceRecord('record_provenance/key', { ...value, accepted: { name: { ...field, checkedAt: 'invalid' } } }, now).issues[0].kind).toBe('missing');
  });
  it('keeps successful retrieval separate from verified source scope, omitting disabled/manual sources', () => {
    const source = { id: 'official', name: 'Official', kind: 'document', reference: 'https://example.test', scope: 'Current', retrieval: 'http' as const, intervalDays: 30, enabled: true, lastAttemptAt: at, currentRevisionId: field.revisionId };
    expect(maintenanceSource('sources/official', source, now).issues[0].kind).toBe('missing');
    expect(maintenanceSource('sources/official', { ...source, lastSuccessfulCheckAt: at, lastError: 'Unavailable' }, now).issues.map(issue => issue.kind)).toEqual(['failed', 'overdue']);
    expect(maintenanceSource('sources/official', { ...source, enabled: false }, now).issues).toEqual([]);
    expect(maintenanceSource('sources/official', { ...source, kind: 'manual' }, now).issues).toEqual([]);
  });
  it('validates URL filters, resets pagination keys and searches only supplied rows', () => {
    const first = maintenanceSelection(new URLSearchParams()), filtered = maintenanceSelection(new URLSearchParams('collection=meets&issue=question'));
    expect(filtered.filter).toEqual({ field: 'targetCollection', value: 'meets' });
    expect(filtered.key).not.toBe(first.key);
    expect(maintenanceSelection(new URLSearchParams('search=abc')).key).toBe(first.key);
    expect(() => maintenanceSelection(new URLSearchParams('collection=assistant_history'))).toThrow();
    expect(() => maintenanceSelection(new URLSearchParams('issue=invalid'))).toThrow();
    expect(() => maintenanceSelection(new URLSearchParams('view=sources&collection=meets'))).toThrow();
    const rows = [maintenanceRecord('record_provenance/key', { ...initialProvenance('meets/test', 'external'), reviewQuestions: [question] }, now)];
    expect(visibleMaintenance(rows, 'question', 'confirmed')).toHaveLength(1);
    expect(visibleMaintenance(rows, 'failed', '')).toEqual([]);
  });
  it('retains open questions through successful checks', () => {
    const value = { ...initialProvenance('meets/test', 'external'), reviewQuestions: [question] };
    expect(hasAttentionReasons(value)).toBe(true);
    expect(recordCheck(value, 'official', at, null).needsAttention).toBe(true);
    expect(hasAttentionReasons({ ...value, reviewQuestions: [{ ...question, status: 'resolved' }] })).toBe(false);
  });
});
describe('review-question audit', () => {
  const update = { targetPath: 'meets/test', ...question };
  function fixture(apply: boolean) {
    const documents = new Map<string, Record<string, unknown>>([['meets/test', { name: 'Meet' }], ['record_provenance/key', { ...initialProvenance('meets/test', 'external'), accepted: { name: field }, lastChangedAt: at, lastSuccessfulCheckAt: at }], ['sources/official', { enabled: true }], ['sources/official/checks/check', { outcome: 'retrieved', revisionId: field.revisionId, at }], ['sources/official/revisions/' + field.revisionId, { hash: field.revisionId }]]);
    const context = { project: 'synthetic', database: 'velocity-v2', apply, db: { doc: (path: string) => ({ path, collection: (name: string) => ({ doc: (id: string) => ({ path: `${path}/${name}/${id}` }) }) }), runTransaction: async (work: (tx: unknown) => unknown) => work({ get: async (ref: { path: string }) => { const path = ref.path.replace(/record_provenance\/[a-f0-9]{64}/, 'record_provenance/key'); return { exists: documents.has(path), data: () => documents.get(path) }; }, set: (ref: { path: string }, data: Record<string, unknown>) => documents.set(ref.path.replace(/record_provenance\/[a-f0-9]{64}/, 'record_provenance/key'), structuredClone(data)), create: (ref: { path: string }, data: Record<string, unknown>) => documents.set(ref.path.replace(/record_provenance\/[a-f0-9]{64}/, 'record_provenance/key'), structuredClone(data)) }) } };
    return { context, documents };
  }
  const manifest = { version: 1, id: 'open-question', target: { provider: 'supabase', project: 'synthetic', database: 'velocity-v2' }, updates: [update] };
  it('previews without writes, applies idempotently, preserves dates/facts and retains resolution history', async () => {
    const { context, documents } = fixture(false), before = structuredClone(documents);
    expect(await updateReviewQuestions(context, manifest, at)).toEqual({ changed: 1, unchanged: 0 }); expect(documents).toEqual(before);
    context.apply = true;
    await updateReviewQuestions(context, manifest, at);
    expect(await updateReviewQuestions(context, manifest, at)).toEqual({ changed: 0, unchanged: 1 });
    expect(documents.get('meets/test')).toEqual(before.get('meets/test'));
    expect(documents.get('record_provenance/key')).toMatchObject({ lastChangedAt: at, lastSuccessfulCheckAt: at, needsAttention: true });
    await updateReviewQuestions(context, { ...manifest, id: 'resolve-question', updates: [{ ...update, status: 'resolved', resolution: 'Confirmed by captured source.' }] }, at);
    expect(documents.get('record_provenance/key')).toMatchObject({ needsAttention: false, reviewQuestions: [expect.objectContaining({ status: 'resolved' })] });
    expect([...documents.keys()].filter(path => path.includes('/events/'))).toHaveLength(2);
    await expect(updateReviewQuestions(context, { ...manifest, updates: [{ ...update, question: 'Different question' }] }, at)).rejects.toThrow('different content');
    await updateReviewQuestions(context, { ...manifest, id: 'reopen-question' }, at);
    expect(documents.get('record_provenance/key')).toMatchObject({ needsAttention: true });
  });
  it('rejects mismatched targets, unarchived evidence and fake resolution', async () => {
    const { context, documents } = fixture(true);
    await expect(updateReviewQuestions(context, { ...manifest, target: { provider: 'supabase', project: 'other', database: 'velocity-v2' } })).rejects.toThrow('target');
    await expect(updateReviewQuestions(context, { ...manifest, updates: [{ ...update, status: 'resolved' }] })).rejects.toThrow('Resolution');
    await expect(updateReviewQuestions(context, { ...manifest, updates: [{ ...update, status: 'resolved', resolution: 'Answer' }] })).rejects.toThrow('open question');
    documents.delete('sources/official/revisions/' + field.revisionId);
    await expect(updateReviewQuestions(context, manifest)).rejects.toThrow('archived');
  });
});
