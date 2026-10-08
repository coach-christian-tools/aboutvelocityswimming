import { describe, expect, it } from 'vitest';
import { DATA_NODES, DATA_RELATIONSHIPS, mapNeighborhood, mapRelationships, SIMPLIFICATION_NOTES } from '../../src/features/swim-resources/lib/domain/data-map';
import { VIEWER_COLLECTIONS, resolveViewerPath } from '../../src/features/swim-resources/lib/domain/data-viewer';
import { TEAM_SCOPED_COLLECTIONS } from '../../src/features/swim-resources/lib/domain/entities';

describe('admin data map', () => {
  it('covers exactly every permitted root and registered subcollection', () => {
    const expected = VIEWER_COLLECTIONS.flatMap(root => [root.id, ...(root.children ?? []).map(child => `${root.id}/${child.id}`)]);
    expect(DATA_NODES.map(node => node.id)).toEqual(expected);
    expect(new Set(expected).size).toBe(DATA_NODES.length);
    for (const node of DATA_NODES) {
      expect(resolveViewerPath(node.href.slice('/tools/swim-resources/admin/data/'.length).split('/'))?.kind).toBe('collection');
      expect(node.purpose).toBeTruthy();
      expect(node.href).not.toContain('{');
    }
    expect(expected).not.toContain('chatbot_conversations');
    expect(expected).not.toContain('import_conversations');
    for (const retired of ['goals', 'film_sessions', 'records']) {
      expect(expected).not.toContain(retired);
      expect(TEAM_SCOPED_COLLECTIONS).not.toContain(retired);
    }
    expect(DATA_NODES.find(node => node.id === 'swims')?.purpose).toContain('without a stored records collection');
  });
  it('keeps private athlete identity separate from public projections', () => {
    expect(DATA_NODES.filter(node => node.public).map(node => node.id).sort()).toEqual(['athletes/bests', 'public_athletes', 'standards']);
    expect(DATA_NODES.find(node => node.id === 'athletes')?.public).toBe(false);
    expect(DATA_RELATIONSHIPS).toContainEqual(expect.objectContaining({ from: 'athletes', to: 'public_athletes', kind: 'projection' }));
  });
  it('has no dangling schema edges or review targets', () => {
    const ids = new Set(DATA_NODES.map(node => node.id));
    for (const edge of DATA_RELATIONSHIPS) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
      expect(edge.from).not.toBe(edge.to);
      expect(edge.field).toBeTruthy();
      expect(edge.note).toBeTruthy();
    }
    for (const note of SIMPLIFICATION_NOTES) for (const id of note.nodes) expect(ids.has(id)).toBe(true);
  });
  it('distinguishes ownership from hosting and includes every team-scoped collection', () => {
    expect(DATA_RELATIONSHIPS.filter(edge => edge.kind === 'ownership').map(edge => edge.from)).toEqual([...TEAM_SCOPED_COLLECTIONS]);
    expect(DATA_RELATIONSHIPS).toContainEqual(expect.objectContaining({ from: 'meets', to: 'teams', field: 'hostTeamId', kind: 'reference' }));
    expect(mapRelationships('meets', false).some(edge => edge.kind === 'ownership')).toBe(false);
  });
  it('focuses on direct neighbors without swallowing unrelated collections', () => {
    const neighbors = mapNeighborhood('meets', false).map(node => node.id);
    expect(neighbors).toContain('meets');
    expect(neighbors).toContain('venues');
    expect(neighbors).toContain('swims');
    expect(neighbors).not.toContain('standards');
    expect(mapNeighborhood('standards', false).map(node => node.id)).toEqual(expect.arrayContaining(['standards', 'record_provenance', 'source_bindings']));
    expect(mapNeighborhood('teams', true).length).toBeGreaterThan(mapNeighborhood('teams', false).length);
  });
  it('represents nested bests and receipts as containment and receipt targets as polymorphic links', () => {
    expect(DATA_RELATIONSHIPS).toContainEqual(expect.objectContaining({ from: 'athletes', to: 'athletes/bests', kind: 'contains' }));
    expect(DATA_RELATIONSHIPS).toContainEqual(expect.objectContaining({ from: 'import_batches', to: 'import_batches/changes', kind: 'contains' }));
    expect(DATA_RELATIONSHIPS).toContainEqual(expect.objectContaining({ from: 'import_batches/changes', to: 'swims', field: 'kind + targetId' }));
  });
});
