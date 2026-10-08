import { describe, expect, it } from 'vitest';
import { canonicalEntity, entityReferences, owningTeam, relatedQueries, relationshipPath, VELOCITY_TEAM_ID } from '@/features/swim-resources/lib/domain/entities';
import { VIEWER_COLLECTIONS, parseViewerFilter, resolveViewerPath } from '@/features/swim-resources/lib/domain/data-viewer';
import { parseImportBatch, validateImportData } from '@/features/swim-resources/lib/domain/import-batch';

describe('entity relationships', () => {
  it('defaults only team-specific ownership and keeps explicit teams and host identities', () => {
    expect(owningTeam('athletes', {})).toEqual({ id: VELOCITY_TEAM_ID, assumed: true });
    expect(owningTeam('meets', { hostTeamId: 'host', teamId: 'other' })).toEqual({ id: 'other', assumed: false });
    expect(owningTeam('standards', {})).toBeNull();
    expect(owningTeam('public_athletes', {})).toBeNull();
    expect(canonicalEntity('person', null, { name: 'Synthetic Coach' }, 'p1').teamId).toBe(VELOCITY_TEAM_ID);
  });
  it('links explicit IDs, supports encoded legacy IDs, and never turns arbitrary paths into links', () => {
    expect(relationshipPath('venueId', 'pool 1')).toBe('venues/pool 1');
    expect(relationshipPath('hostTeamId', 'host')).toBe('teams/host');
    expect(relationshipPath('personId', '../secret')).toBeNull();
    expect(relationshipPath('name', 'p1')).toBeNull();
    expect(entityReferences({ teamId: VELOCITY_TEAM_ID, venueId: 'v1', documentIds: ['d1', 'd1'], host: 'Host snapshot' })).toEqual(['teams/velocity-swimming', 'venues/v1', 'documents/d1']);
  });
  it('provides only registered, supported reverse equality queries', () => {
    for (const collection of ['teams', 'people', 'venues', 'meets', 'athletes']) {
      for (const relation of relatedQueries(collection, 'fixture')) {
        const target = resolveViewerPath([relation.collection])!;
        expect(target).not.toBeNull();
        expect(parseViewerFilter(target.config, new URLSearchParams({ field: relation.field, value: relation.value }))).toEqual({ field: relation.field, value: 'fixture' });
      }
    }
    for (const collection of ['teams', 'people', 'venues', 'documents']) expect(VIEWER_COLLECTIONS.some(item => item.id === collection)).toBe(true);
  });
  it('validates coordinates, safe source URLs, links, and nested private-field boundaries', () => {
    for (const patch of [{ name: 'Pool', latitude: 91 }, { website: 'javascript:alert(1)' }, { contactPersonIds: ['p1', 'p1'] }, { teamId: 'teams/secret' }]) expect(() => validateImportData('venue', patch)).toThrow();
    expect(() => validateImportData('document', { name: 'Meet packet', url: 'https://example.com/info.pdf', meetId: 'm1' })).not.toThrow();
    expect(() => validateImportData('person', { name: 'Coach', styling: { notes: 'unsafe overwrite' } })).toThrow();
    expect(() => canonicalEntity('document', null, { name: 'Packet' }, 'd1')).toThrow('source URL');
    expect(canonicalEntity('person', { name: 'Coach', privateNote: 'keep', phone: 'old' }, { phone: '' }, 'p1')).toMatchObject({ name: 'Coach', privateNote: 'keep', phone: '' });
  });
  it('accepts all entity kinds in reviewed batches and rejects unknown kinds', () => {
    const batch = { version: 2, target: { project: 'synthetic-project', database: 'velocity-v2' }, id: 'entities', collectedAt: '2026-10-06T00:00:00Z', sources: [{ id: 's1', name: 'Synthetic', revisionId: 'a'.repeat(64), checkId: 'check', kind: 'document', reference: 'fixture:entities', collectedAt: '2026-10-06T00:00:00Z', coverage: 'complete', scope: 'Synthetic' }], unresolved: [], rows: ['team', 'person', 'venue', 'document'].map(kind => ({ id: kind, kind, verified: true, sourceIds: ['s1'], data: { id: kind, name: kind }, evidence: [{ sourceId: 's1', revisionId: 'a'.repeat(64), checkId: 'check', checkedAt: '2026-10-06T00:00:00Z', fields: ['name'], context: 'Synthetic', excerpt: 'Synthetic' }] })) };
    expect(parseImportBatch(batch).rows).toHaveLength(4);
    expect(() => parseImportBatch({ ...batch, rows: [{ ...batch.rows[0], kind: 'unregistered' }] })).toThrow();
  });
  it('accepts scoped club directory facts and rejects malformed codes and contact fields', () => {
    const data = { name: 'Synthetic Club', lscCode: 'IE', clubCode: 'TEST', location: 'Example, WA', website: 'https://example.test', email: 'club@example.test', mailingAddress: 'PO Box 1 Example, WA 99999', phone: '(555) 555-0100' };
    expect(canonicalEntity('team', null, data, 'synthetic-club')).toMatchObject(data);
    for (const patch of [{ lscCode: 'Inland Empire' }, { clubCode: 'clubs/test' }, { email: 'bad address' }, { location: '\nprivate' }, { mailingAddress: 'x'.repeat(1001) }, { phone: {} }]) expect(() => validateImportData('team', { ...data, ...patch })).toThrow();
    const target = resolveViewerPath(['teams'])!;
    expect(parseViewerFilter(target.config, new URLSearchParams('field=lscCode&value=IE'))).toEqual({ field: 'lscCode', value: 'IE' });
    expect(parseViewerFilter(target.config, new URLSearchParams('field=clubCode&value=TEST'))).toEqual({ field: 'clubCode', value: 'TEST' });
  });
});
