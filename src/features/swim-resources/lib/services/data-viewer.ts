import { auth, db } from '@/features/swim-resources/lib/firebase';
import { isViewerCoach, parseViewerFilter, resolveViewerPath, validDocumentId, type ViewerFilter } from '@/features/swim-resources/lib/domain/data-viewer';
import { collection, doc, getDocFromServer, getDocsFromServer, limit, query, startAfter, where, type DocumentData, type QueryConstraint, type QueryDocumentSnapshot } from 'firebase/firestore';

export const VIEWER_PAGE_SIZE = 100;
export interface ViewerRecord { id: string; path: string; data: DocumentData }
export interface ViewerPage { records: ViewerRecord[]; cursor: QueryDocumentSnapshot | null; hasNext: boolean }

function authorizePath(path: string, kind: 'collection' | 'document') {
  if (!isViewerCoach(auth.currentUser)) throw new Error('A verified Velocity coaching account is required.');
  const target = resolveViewerPath(path.split('/'));
  if (!target || target.kind !== kind) throw new Error('This data path is not registered.');
  return target;
}

export async function readViewerDocument(path: string): Promise<ViewerRecord | null> {
  authorizePath(path, 'document');
  const snapshot = await getDocFromServer(doc(db, path));
  return snapshot.exists() ? { id: snapshot.id, path: snapshot.ref.path, data: snapshot.data() } : null;
}

export async function readViewerPage(path: string, filter: ViewerFilter = {}, cursor: QueryDocumentSnapshot | null = null): Promise<ViewerPage> {
  const target = authorizePath(path, 'collection');
  // Validate again at the service boundary, including callers other than the UI.
  const parameters = new URLSearchParams();
  if (filter.documentId !== undefined) parameters.set('doc', filter.documentId);
  if (filter.field !== undefined) {
    if (filter.value === undefined) throw new Error('A field filter requires a value.');
    parameters.set('field', filter.field); parameters.set('value', String(filter.value));
  }
  const validated = parseViewerFilter(target.config, parameters);
  if (validated.documentId !== undefined) {
    if (!validDocumentId(validated.documentId)) throw new Error('Invalid document ID.');
    const record = await readViewerDocument(`${path}/${validated.documentId}`);
    return { records: record ? [record] : [], cursor: null, hasNext: false };
  }
  const constraints: QueryConstraint[] = [];
  if (validated.field) constraints.push(where(validated.field, '==', validated.value));
  if (cursor) {
    if (cursor.ref.parent.path !== path) throw new Error('The page cursor belongs to a different collection.');
    constraints.push(startAfter(cursor));
  }
  constraints.push(limit(VIEWER_PAGE_SIZE));
  const snapshot = await getDocsFromServer(query(collection(db, path), ...constraints));
  return {
    records: snapshot.docs.map(document => ({ id: document.id, path: document.ref.path, data: document.data() })),
    cursor: snapshot.docs.at(-1) ?? null,
    hasNext: snapshot.size === VIEWER_PAGE_SIZE,
  };
}
