import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Bytes, GeoPoint, Timestamp, doc, getFirestore, terminate } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { VIEWER_COLLECTIONS, fieldValue, isViewerCoach, legacyViewerHref, parseViewerFilter, resolveViewerPath, viewerHref } from '@/features/swim-resources/lib/domain/data-viewer';
import { normalizeFirestoreValue, summaryValue } from '@/features/swim-resources/lib/domain/firestore-values';

const mock = vi.hoisted(() => ({
  user: { email: 'coach@velocity-swimming.com', emailVerified: true } as { email: string | null; emailVerified: boolean } | null,
  documents: new Map<string, Record<string, unknown>>(), reads: [] as { path: string; constraints: { kind: string; value?: unknown; field?: string }[] }[], writes: 0,
}));
vi.mock('@/features/swim-resources/lib/firebase', () => ({ db: {}, auth: { get currentUser() { return mock.user; } } }));
vi.mock('firebase/firestore', async importOriginal => {
  const original = await importOriginal<typeof import('firebase/firestore')>();
  const reference = (path: string) => ({ path, parent: { path: path.split('/').slice(0, -1).join('/') } });
  const snapshot = (path: string) => ({ id: path.split('/').at(-1)!, ref: reference(path), data: () => mock.documents.get(path), exists: () => mock.documents.has(path) });
  return { ...original,
    collection: (_db: unknown, path: string) => reference(path),
    // Keep real doc() for the SDK-value serialization test.
    doc: (database: unknown, path: string) => database && typeof database === 'object' && 'type' in database ? original.doc(database as ReturnType<typeof original.getFirestore>, path) : reference(path),
    where: (field: string, _operator: string, value: unknown) => ({ kind: 'where', field, value }),
    limit: (value: number) => ({ kind: 'limit', value }),
    startAfter: (value: { ref: { path: string } }) => ({ kind: 'cursor', value: value.ref.path }),
    query: (ref: { path: string }, ...constraints: { kind: string; field?: string; value?: unknown }[]) => ({ path: ref.path, constraints }),
    getDocFromServer: async (ref: { path: string }) => { mock.reads.push({ path: ref.path, constraints: [] }); return snapshot(ref.path); },
    getDocsFromServer: async (request: { path: string; constraints: { kind: string; field?: string; value?: unknown }[] }) => {
      mock.reads.push(request);
      let paths = [...mock.documents.keys()].filter(path => path.startsWith(request.path + '/') && !path.slice(request.path.length + 1).includes('/')).sort();
      for (const constraint of request.constraints) {
        if (constraint.kind === 'where') paths = paths.filter(path => fieldValue(mock.documents.get(path)!, constraint.field!) === constraint.value);
        if (constraint.kind === 'cursor') paths = paths.filter(path => path > String(constraint.value));
        if (constraint.kind === 'limit') paths = paths.slice(0, Number(constraint.value));
      }
      return { docs: paths.map(snapshot), size: paths.length };
    },
    setDoc: () => { mock.writes++; }, updateDoc: () => { mock.writes++; }, deleteDoc: () => { mock.writes++; },
  };
});
import { readViewerDocument, readViewerPage } from '@/features/swim-resources/lib/services/data-viewer';

beforeEach(() => { mock.user = { email: 'coach@velocity-swimming.com', emailVerified: true }; mock.documents.clear(); mock.reads = []; mock.writes = 0; });
describe('viewer access and paths', () => {
  it('only resolves registered collections and supported subcollections', () => {
    for (const collection of VIEWER_COLLECTIONS) expect(resolveViewerPath([collection.id])?.kind).toBe('collection');
    expect(resolveViewerPath(['athletes', 'a1', 'bests', '100_FR_SCY'])?.kind).toBe('document');
    expect(resolveViewerPath(['import_batches', 'b1', 'changes'])?.kind).toBe('collection');
    for (const path of [['chatbot_conversations'], ['import_conversations'], ['unknown'], ['athletes', '..'], ['athletes', 'a1', 'private'], ['meets', 'm1', 'bests'], ['athletes', 'a1/bests']]) expect(resolveViewerPath(path)).toBeNull();
  });
  it('rejects anonymous, unverified, and non-coach callers before reading', async () => {
    for (const user of [null, { email: 'coach@velocity-swimming.com', emailVerified: false }, { email: 'coach@other.example', emailVerified: true }]) {
      mock.user = user;
      expect(isViewerCoach(user)).toBe(false);
      await expect(readViewerPage('athletes')).rejects.toThrow('verified');
      await expect(readViewerDocument('athletes/a1')).rejects.toThrow('verified');
    }
    expect(mock.reads).toHaveLength(0);
  });
  it('does not permit unregistered reads even for verified coaches', async () => {
    await expect(readViewerPage('chatbot_conversations')).rejects.toThrow('not registered');
    await expect(readViewerDocument('athletes/a1/private/secret')).rejects.toThrow('not registered');
    for (const retired of ['goals', 'film_sessions', 'records']) {
      expect(resolveViewerPath([retired])).toBeNull();
      expect(resolveViewerPath([retired, 'legacy'])).toBeNull();
      await expect(readViewerPage(retired)).rejects.toThrow('not registered');
      await expect(readViewerDocument(`${retired}/legacy`)).rejects.toThrow('not registered');
    }
    expect(mock.reads).toHaveLength(0);
  });
});
describe('bounded queries and lookups', () => {
  it('paginates 205 documents without duplicates and never writes', async () => {
    for (let index = 0; index < 205; index++) mock.documents.set(`swims/s${String(index).padStart(3, '0')}`, { athleteId: index < 102 ? 'a1' : 'a2', timeMs: index, isRelay: false });
    const first = await readViewerPage('swims');
    const second = await readViewerPage('swims', {}, first.cursor);
    const third = await readViewerPage('swims', {}, second.cursor);
    expect([first.records.length, second.records.length, third.records.length]).toEqual([100, 100, 5]);
    expect(new Set([...first.records, ...second.records, ...third.records].map(row => row.id)).size).toBe(205);
    expect(third.hasNext).toBe(false);
    const filtered = await readViewerPage('swims', { field: 'athleteId', value: 'a2' });
    expect(filtered.records[0].id).toBe('s102');
    expect(mock.reads.at(-1)?.constraints.some(item => item.kind === 'cursor')).toBe(false);
    expect((await readViewerPage('swims', { field: 'timeMs', value: 201 })).records[0].id).toBe('s201');
    expect((await readViewerPage('swims', { field: 'isRelay', value: true })).records).toEqual([]);
    expect(mock.writes).toBe(0);
  });
  it('uses exact document reads, preserves stored id fields, and handles missing documents', async () => {
    mock.documents.set('athletes/a1', { id: 'legacy-id', name: { first: 'Synthetic' } });
    const result = await readViewerPage('athletes', { documentId: 'a1' });
    expect(result.records[0]).toMatchObject({ id: 'a1', data: { id: 'legacy-id' } });
    expect(result.hasNext).toBe(false);
    expect(mock.reads[0].path).toBe('athletes/a1');
    expect(await readViewerDocument('athletes/missing')).toBeNull();
    expect((await readViewerPage('athletes', { documentId: 'missing' })).records).toEqual([]);
    expect(mock.writes).toBe(0);
  });
  it('supports nested bests/receipts and rejects unsupported fields or foreign cursors', async () => {
    mock.documents.set('athletes/a1/bests/100_FR_SCY', { eventCode: '100_FR_SCY', bestTimeMs: 54000 });
    mock.documents.set('import_batches/b1/changes/r1', { state: 'applied' });
    const bests = await readViewerPage('athletes/a1/bests');
    expect(bests.records).toHaveLength(1);
    expect((await readViewerPage('import_batches/b1/changes')).records).toHaveLength(1);
    await expect(readViewerPage('swims', {}, bests.cursor)).rejects.toThrow('different collection');
    await expect(readViewerPage('athletes', { field: 'private.secret', value: 'x' })).rejects.toThrow('supported');
    await expect(readViewerPage('athletes', { field: 'status' })).rejects.toThrow('requires a value');
  });
});
describe('filters and legacy links', () => {
  const swims = VIEWER_COLLECTIONS.find(item => item.id === 'swims')!;
  it('validates filter types and refuses combined ID/field lookups', () => {
    expect(parseViewerFilter(swims, new URLSearchParams('field=isRelay&value=false'))).toEqual({ field: 'isRelay', value: false });
    expect(parseViewerFilter(swims, new URLSearchParams('field=timeMs&value=54000'))).toEqual({ field: 'timeMs', value: 54000 });
    for (const query of ['field=timeMs&value=', 'field=timeMs&value=NaN', 'field=isRelay&value=yes', 'field=athleteId', 'doc=a/b', 'doc=a1&field=athleteId&value=a1']) expect(() => parseViewerFilter(swims, new URLSearchParams(query))).toThrow();
  });
  it('preserves athlete selection and encodes paths without obsolete parameters', () => {
    expect(legacyViewerHref('roster', 'a 1')).toBe('/tools/swim-resources/admin/data/athletes/a%201');
    expect(legacyViewerHref('goals', 'a1')).toBe('/tools/swim-resources/admin');
    expect(legacyViewerHref('analysis', 'a1')).toBe('/tools/swim-resources/admin/data/analytics_snapshots?field=athleteId&value=a1');
    expect(legacyViewerHref('records')).toBe('/tools/swim-resources/admin/data/swims');
    expect(legacyViewerHref('records', 'a1')).toBe('/tools/swim-resources/admin/data/swims?field=athleteId&value=a1');
    expect(viewerHref('athletes/a#1/bests')).toBe('/tools/swim-resources/admin/data/athletes/a%231/bests');
  });
});
describe('Firestore value rendering', () => {
  it('preserves nested values, timestamp precision, coordinates, bytes and safe references', async () => {
    const app = initializeApp({ projectId: 'demo-viewer-values', apiKey: 'synthetic' }, 'viewer-values');
    const database = getFirestore(app);
    try {
      const result = normalizeFirestoreValue({ date: new Timestamp(1, 123456789), point: new GeoPoint(47, -120), ref: doc(database, 'athletes/a1'), bytes: Bytes.fromUint8Array(new Uint8Array([1, 2])), nested: [null, false, { text: '<script>literal</script>' }], value: NaN });
      expect(result).toMatchObject({ date: { _type: 'timestamp', seconds: 1, nanoseconds: 123456789 }, point: { latitude: 47, longitude: -120 }, ref: { _type: 'reference', path: 'athletes/a1' }, bytes: { base64: 'AQI=' }, nested: [null, false, { text: '<script>literal</script>' }], value: 'NaN' });
      expect(JSON.stringify(result)).not.toContain('apiKey');
      expect(summaryValue(new GeoPoint(47, -120))).toBe('47, -120');
      expect(summaryValue(undefined)).toBe('—');
      expect(summaryValue([1, 2])).toBe('[2 items]');
    } finally { await terminate(database); await deleteApp(app); }
  });
});
