import { auth, db, FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from '@/features/swim-resources/lib/firebase';
import { doc, getDoc, runTransaction, type Transaction } from 'firebase/firestore';
import { getBlob, ref } from 'firebase/storage';
import { storage } from '@/features/swim-resources/lib/firebase';
import { evidenceKey, initialProvenance, reconcileObservation, factFields, getFact, stableFacts, semanticFacts, safeEvidenceId, type EvidenceSource, type EvidenceBinding, type ObservationEvidence, type Provenance } from '@/features/swim-resources/lib/domain/evidence';
import { isViewerCoach } from '@/features/swim-resources/lib/domain/data-viewer';
import type { ImportBatch, ImportPreviewRow } from '@/features/swim-resources/lib/domain/import-batch';

export function assertFreshTarget(target?: ImportBatch['target']): void {
  if (FIRESTORE_DATABASE_ID !== 'velocity-v2' || (target && (target.project !== FIREBASE_PROJECT_ID || target.database !== FIRESTORE_DATABASE_ID))) throw new Error('Import is enabled only for the matching fresh velocity-v2 database.');
}
export async function verifyRowEvidence(batch: ImportBatch, row: ImportPreviewRow['row'], get = (path: string) => getDoc(doc(db, path))) {
  for (const evidence of row.evidence) {
    const [source, check, revision] = await Promise.all([get('sources/' + evidence.sourceId), get(`sources/${evidence.sourceId}/checks/${evidence.checkId}`), get(`sources/${evidence.sourceId}/revisions/${evidence.revisionId}`)]);
    const batchSource = batch.sources.find(source => source.id === evidence.sourceId)!;
    if (!source.exists() || !source.data()?.enabled || !check.exists() || !revision.exists() || check.data()?.outcome !== 'retrieved' || check.data()?.revisionId !== evidence.revisionId || check.data()?.at !== evidence.checkedAt || revision.data()?.hash !== evidence.revisionId || source.data()?.reference !== batchSource.reference) throw new Error('Evidence must refer to an accessible archived capture and matching source check.');
  }
}
export async function importedProvenance(path: string, previous: Provenance | undefined, before: Record<string, unknown> | null, after: Record<string, unknown>, evidence: ObservationEvidence[], eventId: string, get: (path: string) => Promise<{ data(): unknown }>) {
  let provenance = previous ?? initialProvenance(path, 'external');
  for (const item of evidence) {
    const source = (await get('sources/' + item.sourceId)).data() as EvidenceSource;
    const binding: EvidenceBinding = { id: 'reviewed', sourceId: item.sourceId, targetPath: path, fields: item.fields, context: item.context, priority: null };
    const result = reconcileObservation({ before: before ?? {}, provenance, source, binding, evidence: item, claims: after, eventId, reviewed: true });
    provenance = result.provenance;
  }
  if (!before || factFields(after).some(field => stableFacts(before && field.split('.').reduce<unknown>((v, k) => v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined, before)) !== stableFacts(field.split('.').reduce<unknown>((v, k) => v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined, after)))) provenance.lastChangedAt = new Date().toISOString();
  return provenance;
}
/** Read all provenance before any transaction writes; facts/projections commit together. */
export async function prepareOrigins(transaction: Transaction, changes: { path: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; origin: Provenance['origin']; derivedFrom?: string[] }[]) {
  const rows = await Promise.all(changes.map(async change => {
    const key = await evidenceKey(change.path), reference = doc(db, 'record_provenance', key), old = await transaction.get(reference);
    return { change, reference, previous: old.data() as Provenance | undefined };
  }));
  const at = new Date().toISOString();
  return () => rows.forEach(({ change, reference, previous }) => {
    const changed = semanticFacts(change.before) !== semanticFacts(change.after);
    const changedFields = [...new Set([...factFields(change.before ?? {}), ...factFields(change.after ?? {})])].filter(field => stableFacts(getFact(change.before ?? {}, field)) !== stableFacts(getFact(change.after ?? {}, field)));
    const value = structuredClone({ ...(previous ?? initialProvenance(change.path, change.origin)), origin: change.origin, ...(changed ? { lastChangedAt: at } : {}), retired: change.after === null, ...(change.derivedFrom ? { derivedFrom: change.derivedFrom } : {}) });
    if (changed && change.origin === 'manual') {
      // An unverified manual correction cannot keep claiming old evidence for
      // the corrected fields. Preserve those pointers in the immutable event.
      for (const field of Object.keys(value.accepted)) if (changedFields.some(changed => field === changed || field.startsWith(changed + '.') || changed.startsWith(field + '.'))) delete value.accepted[field];
      value.requiredFields = [...new Set([...(value.requiredFields ?? []), ...changedFields])];
      value.needsAttention = true;
    }
    transaction.set(reference, value);
    if (changed) transaction.set(doc(reference, 'events', crypto.randomUUID()), { type: change.origin === 'derived' ? 'projection' : change.origin === 'audit' ? 'audit_change' : 'manual_change', at, changedFields, retired: change.after === null, ...(change.origin === 'manual' ? { previousEvidence: previous?.accepted ?? {}, actorId: auth.currentUser?.uid ?? 'unknown' } : {}) });
  });
}
export async function writeWithOrigins(changes: { path: string; after: Record<string, unknown> | null; origin: Provenance['origin']; derivedFrom?: string[] }[]) {
  assertFreshTarget();
  if (changes.length > 100) throw new Error('Origin transaction is limited to 100 records.');
  await runTransaction(db, async transaction => {
    const rows = await Promise.all(changes.map(async change => ({ ...change, before: (await transaction.get(doc(db, change.path))).data() ?? null })));
    const publish = await prepareOrigins(transaction, rows);
    for (const row of rows) { if (row.after === null) transaction.delete(doc(db, row.path)); else transaction.set(doc(db, row.path), row.after); }
    publish();
  });
}
export async function readRecordProvenance(path: string): Promise<Provenance | null> {
  if (!isViewerCoach(auth.currentUser)) throw new Error('Verified coach required.');
  const snapshot = await getDoc(doc(db, 'record_provenance', await evidenceKey(path)));
  return snapshot.exists() ? snapshot.data() as Provenance : null;
}
export async function readRevisionCapture(sourceId: string, revisionId: string): Promise<Blob> {
  if (!isViewerCoach(auth.currentUser)) throw new Error('Verified coach required.');
  if (!safeEvidenceId(sourceId) || !/^[a-f0-9]{64}$/.test(revisionId)) throw new Error('Invalid archive reference.');
  const revision = await getDoc(doc(db, 'sources', sourceId, 'revisions', revisionId));
  const data = revision.data();
  if (!data || data.hash !== revisionId || typeof data.storagePath !== 'string' || !data.storagePath.startsWith(`evidence/${FIREBASE_PROJECT_ID}/${FIRESTORE_DATABASE_ID}/${sourceId}/`)) throw new Error('Invalid archived revision.');
  const blob = await getBlob(ref(storage, `gs://${data.bucket}/${data.storagePath}`), 20 * 1024 * 1024);
  const hash = await evidenceKeyBytes(await blob.arrayBuffer()); if (hash !== revisionId) throw new Error('Archive checksum mismatch.');
  return blob;
}
async function evidenceKeyBytes(bytes: ArrayBuffer) { const hash = await crypto.subtle.digest('SHA-256', bytes); return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join(''); }
