import { assertFreshTarget, verifyRowEvidence, importedProvenance, prepareOrigins, writeWithOrigins } from './evidence';
import { factFields, evidenceKey, initialProvenance, hasAttentionReasons, type Provenance } from '@/features/swim-resources/lib/domain/evidence';
import { ENTITY_COLLECTIONS, VELOCITY_TEAM_ID, canonicalEntity, entityReferences, type EntityKind } from '@/features/swim-resources/lib/domain/entities';
import { auth, db } from '@/features/swim-resources/lib/firebase';
import { batchDigest, observationDigest, changedFields, IMPORT_COLLECTIONS, matchImportAthlete, mergeImportPatch, parseImportBatch, stableJson, validateImportData } from '@/features/swim-resources/lib/domain/import-batch';
import type { ImportBatch, ImportPreviewRow, ImportRow, JsonRecord } from '@/features/swim-resources/lib/domain/import-batch';
import { publicAthlete, type FirestoreAthlete } from '@/features/swim-resources/lib/domain/athlete';
import { canonicalSwim } from '@/features/swim-resources/lib/domain/swim';
import { isCalendarDate } from '@/features/swim-resources/lib/domain/date';
import { canonicalAthlete } from './athletes';
import { canonicalMeet } from './meet-tools';
import { refreshSwimProjections } from './swim-projections';
import type { Athlete, Meet, Swim } from '@/features/swim-resources/types/schema';
import { collection, doc, getDoc, getDocs, query, where, runTransaction } from 'firebase/firestore';

export interface ImportPreview { batch: ImportBatch; digest: string; rows: ImportPreviewRow[]; reviewedIssues: string[]; reviewHistoryAvailable: boolean }
export interface ImportReceipt {
  rowId: string; kind: ImportRow['kind']; targetId: string; before: JsonRecord | null; after: JsonRecord;
  provenanceBefore?: Provenance | null; provenanceAfter?: Provenance; checkOnly?: boolean;
  publicBefore?: JsonRecord | null; publicAfter?: JsonRecord;
  sourceIds: string[]; appliedAt: string; appliedBy: string; state: 'applied' | 'reversed'; reversedAt?: string;
}
const asRecord = (value: unknown): JsonRecord => value as JsonRecord;
const projectionReference = () => doc(db, 'import_state', 'projections');
const sorted = (data: JsonRecord) => stableJson({ ...data, metadata: undefined, createdAt: undefined, updatedAt: undefined });
const dateAge = (dob: string, date: string): number => {
  const [year, month, day] = date.split('-').map(Number), [by, bm, bd] = dob.split('-').map(Number);
  return year - by - (month < bm || (month === bm && day < bd) ? 1 : 0);
};
function prepare(row: ImportRow, id: string, previous: JsonRecord | null, athlete: JsonRecord | undefined, collectedAt: string): JsonRecord {
  validateImportData(row.kind, row.data);
  const merged = mergeImportPatch(previous ?? {}, { ...row.data, id });
  if (Object.hasOwn(ENTITY_COLLECTIONS, row.kind)) return canonicalEntity(row.kind as EntityKind, previous, row.kind === 'document' ? { ...row.data, sourceId: row.evidence[0].sourceId, currentRevisionId: row.evidence[0].revisionId } : row.data, id);
  if (row.kind === 'standard') return { ...merged, cuts: row.data.cuts, updatedAt: new Date().toISOString() };
  if (row.kind === 'athlete') {
    if (row.data.currentGroup) {
      const group = merged.currentGroup as Athlete['currentGroup'];
      const oldGroup = previous?.currentGroup as Athlete['currentGroup'] | undefined;
      merged.currentGroup = { ...group, assignedAt: group.name === oldGroup?.name ? oldGroup.assignedAt : (row.data.currentGroup as Athlete['currentGroup']).assignedAt ?? collectedAt };
    }
    if (!previous && (!isCalendarDate(String(merged.dob ?? '')) || !merged.gender || !merged.status || !merged.currentGroup)) throw new Error('New athletes need real demographics, status, and training group.');
    if (Array.isArray(row.data.aliases)) merged.aliases = [...new Set([...(previous?.aliases as string[] ?? []), ...(row.data.aliases as string[])])];
    return asRecord(canonicalAthlete({ ...previous, id } as FirestoreAthlete, merged as Partial<FirestoreAthlete>));
  }
  if (row.kind === 'meet') {
    const meet = merged as unknown as Meet;
    if (typeof meet.name !== 'string' || !meet.venue || !['SCY', 'LCM', 'SCM'].includes(meet.venue.course) || !meet.dates) throw new Error('A meet needs a verified name, dates, and pool course.');
    return asRecord(canonicalMeet(previous ?? undefined, meet));
  }
  if (!athlete) throw new Error('Import or identify the athlete before importing their races.');
  const teamId = String(athlete.teamId ?? VELOCITY_TEAM_ID);
  if (merged.teamId && merged.teamId !== teamId) throw new Error('Race ownership differs from the athlete team.');
  const swim = canonicalSwim({ ...merged, teamId } as Partial<Swim>);
  if (previous?.externalResult && row.data.externalResult && stableJson(previous.externalResult) !== stableJson(row.data.externalResult)) throw new Error('A race id cannot be reassigned to another source result.');
  if (previous && ['athleteId', 'eventCode', 'isRelay'].some(key => previous[key] !== swim[key as keyof Swim])) throw new Error('A swim id cannot be reassigned to another athlete or event.');
  if (previous && previous.round !== swim.round && (!row.data.id || !row.data.externalResult)) throw new Error('Correcting a legacy race round needs its reviewed canonical id and a verified stable source result.');
  const identity = athlete.name as Athlete['name'];
  if (swim.athleteName.first !== identity?.first || swim.athleteName.last !== identity?.last || swim.gender !== athlete.gender) throw new Error('Race identity differs from the verified roster.');
  if (!isCalendarDate(String(athlete.dob ?? '')) || dateAge(String(athlete.dob), swim.meet.date) !== swim.ageAtSwim) throw new Error('Age at swim must agree with the real roster date of birth.');
  const expectedGroup = swim.ageAtSwim <= 8 ? '8&U' : swim.ageAtSwim <= 10 ? '9-10' : swim.ageAtSwim <= 12 ? '11-12' : swim.ageAtSwim <= 14 ? '13-14' : swim.ageAtSwim <= 16 ? '15-16' : swim.ageAtSwim <= 18 ? '17-18' : 'Open';
  if (swim.ageGroup !== expectedGroup && !(swim.ageGroup === 'Masters' && swim.ageAtSwim >= 18)) throw new Error('Age group does not agree with age at swim.');
  return asRecord(swim);
}
function swimKey(data: JsonRecord): string {
  const meet = data.meet as Swim['meet'] | undefined, relay = data.relay as Swim['relay'] | undefined;
  return stableJson([data.athleteId, data.eventCode, meet?.id, meet?.date, data.round, data.isRelay, relay?.leg ?? null]);
}
export async function previewImportBatch(input: unknown): Promise<ImportPreview> {
  const batch = parseImportBatch(input), digest = await batchDigest(batch);
  assertFreshTarget(batch.target);
  const swimmerIds = [...new Set(batch.rows.filter(row => row.kind === 'swim').map(row => String(row.data.athleteId ?? '')))].filter(Boolean);
  const raceQueries = [];
  for (let offset = 0; offset < swimmerIds.length; offset += 30) raceQueries.push(getDocs(query(collection(db, 'swims'), where('athleteId', 'in', swimmerIds.slice(offset, offset + 30)))));
  const [roster, meets, swims] = await Promise.all([
    getDocs(collection(db, 'athletes')),
    batch.rows.some(row => row.kind === 'meet') ? getDocs(collection(db, 'meets')) : Promise.resolve({ docs: [] }),
    Promise.all(raceQueries),
  ]);
  const athletes = roster.docs.map(d => ({ ...d.data(), id: d.id }));
  const meetRows: JsonRecord[] = meets.docs.map(d => ({ ...d.data(), id: d.id }));
  const swimRows: JsonRecord[] = swims.flatMap(snapshot => snapshot.docs.map(d => ({ ...d.data(), id: d.id })));
  const sourceMap = new Map(batch.sources.map(source => [source.id, source]));
  const rows: ImportPreviewRow[] = [];
  for (const row of batch.rows) {
    const name = (row.data.athleteName ?? row.data.name) as Athlete['name'] | string | undefined;
    const label = typeof name === 'string' ? name : name?.first && name.last ? name.first + ' ' + name.last : row.id;
    const preview: ImportPreviewRow = { row, label, status: 'conflict', before: null, after: null, fields: [] };
    try {
      if (row.holdReason || !row.verified || row.sourceIds.some(id => ['blocked', 'not_checked'].includes(sourceMap.get(id)!.coverage))) {
        preview.status = 'skipped'; preview.reason = row.holdReason || 'This observation has not been verified against an accessible source.'; rows.push(preview); continue;
      }
      validateImportData(row.kind, row.data);
      await verifyRowEvidence(batch, row);
      let id = String(row.data.id ?? ''), candidates: JsonRecord[] = [], athlete: JsonRecord | undefined;
      if (row.kind === 'athlete') {
        const matched = matchImportAthlete(row.data, athletes);
        if (matched.conflict || !matched.id) throw new Error(matched.conflict || 'No verified athlete identity.');
        id = matched.id; candidates = athletes.filter(a => a.id === id);
        const name = (row.data.name ?? candidates[0]?.name) as Athlete['name'] | undefined;
        preview.label = name ? name.first + ' ' + name.last : id;
      } else if (row.kind === 'meet') {
        if (!id) throw new Error('Meet imports need a stable meet id from the source.');
        candidates = meetRows.filter(m => m.id === id);
        const dates = row.data.dates as Meet['dates'] | undefined;
        const alternate = meetRows.filter(m => m.id !== id &&
          ((row.data.sanctionNumber && m.sanctionNumber === row.data.sanctionNumber) ||
          (m.name === row.data.name && (m.dates as Meet['dates'] | undefined)?.startDate === dates?.startDate)));
        if (alternate.length) throw new Error('This meet already exists under another id. Reuse its canonical id.');
      } else if (row.kind === 'swim') {
        athlete = athletes.find(a => a.id === row.data.athleteId);
        const normalized = asRecord(canonicalSwim(row.data as Partial<Swim>));
        candidates = swimRows.filter(s => s.id === id);
        const external = normalized.externalResult as Swim['externalResult'];
        const sourceMatches = external ? swimRows.filter(s => stableJson(s.externalResult) === stableJson(external)) : [];
        if (sourceMatches.length > 1 || (candidates.length && sourceMatches.some(s => s.id !== id))) throw new Error('The source result belongs to another canonical race. Resolve the existing identity before importing.');
        if (!candidates.length) {
          if (external) candidates = sourceMatches;
          if (candidates.length > 1) throw new Error('Multiple races share a source result identity. Resolve the existing duplicates first.');
          const equivalent = swimRows.filter(s => swimKey(s) === swimKey(normalized));
          if (!candidates.length && equivalent.some(s => !s.externalResult || !external)) throw new Error('A legacy race may represent this performance. Verify its canonical id; event and round alone cannot distinguish repeated races.');
        }
        id = String(candidates[0]?.id ?? (external ? 'race_' + external.namespace + '_' + external.id : normalized.id));
        preview.label = label + ' · ' + String(row.data.eventCode ?? '').replaceAll('_', ' ') + ' · ' + String((row.data.meet as Swim['meet'])?.date ?? '');
        if (athlete) preview.dependencies = { [String(athlete.id)]: stableJson(athlete) };
      }
      if (Object.hasOwn(ENTITY_COLLECTIONS, row.kind) || row.kind === 'standard') {
        if (!id) throw new Error('Entity imports require an explicit stable document id.');
        const existing = await getDoc(doc(db, IMPORT_COLLECTIONS[row.kind], id));
        candidates = existing.exists() ? [{ ...existing.data(), id }] : [];
      }
      preview.targetId = id; preview.before = candidates[0] ?? null;
      preview.after = prepare(row, id, preview.before, athlete, batch.collectedAt);
      preview.relationshipDependencies = {};
      for (const path of entityReferences(preview.after)) {
        if (path === `${IMPORT_COLLECTIONS[row.kind]}/${id}`) throw new Error('A record cannot link to itself.');
        const dependency = await getDoc(doc(db, path));
        if (!dependency.exists()) throw new Error(`Linked record ${path} does not exist. Import parent entities first, then preview again.`);
        const linked = dependency.data()!;
        if (row.kind === 'athlete' && path.startsWith('people/') && preview.after.personId === path.split('/')[1] && linked.athleteId !== id) throw new Error('The linked person must identify this athlete.');
        if (row.kind === 'person' && path.startsWith('athletes/') && linked.personId && linked.personId !== id) throw new Error('This athlete already links to a different person.');
        preview.relationshipDependencies[path] = stableJson(linked);
      }
      // Legacy mirrors and aliases are canonicalized during any real update,
      // but do not create review work when the observed roster is unchanged.
      preview.comparisonBefore = row.kind === 'athlete' && preview.before ? asRecord(canonicalAthlete(preview.before as unknown as FirestoreAthlete, {})) : preview.before;
      preview.fields = changedFields(preview.comparisonBefore, preview.after);
      if (row.kind === 'athlete') {
        preview.fields = preview.fields.filter(field => field.split('.')[0] in row.data || (field === 'aliases' && 'name' in row.data));
        if ((preview.comparisonBefore?.currentGroup as Athlete['currentGroup'])?.name === (preview.after.currentGroup as Athlete['currentGroup'])?.name) preview.fields = preview.fields.filter(field => field !== 'currentGroup.assignedAt');
      }
      preview.status = !preview.before ? 'add' : preview.fields.length ? 'change' : 'checked';
      if (new TextEncoder().encode(stableJson([preview.before, preview.after])).length > 750000) throw new Error('Record is too large for a safe before/after receipt.');
    } catch (error) { preview.status = 'conflict'; preview.reason = error instanceof Error ? error.message : String(error); preview.after = null; }
    rows.push(preview);
  }
  const targets = new Map<string, ImportPreviewRow[]>();
  for (const row of rows.filter(r => r.targetId && r.after)) {
    const key = row.row.kind + '/' + row.targetId;
    targets.set(key, [...(targets.get(key) ?? []), row]);
  }
  for (const duplicates of targets.values()) {
    if (duplicates.length < 2) continue;
    const conflicting = new Set(duplicates.map(r => sorted(r.after!))).size > 1;
    duplicates.forEach((row, index) => {
      if (conflicting) { row.status = 'conflict'; row.reason = 'Sources propose conflicting values for the same record.'; }
      else if (index > 0) { row.status = 'skipped'; row.reason = 'Duplicate observation in this batch.'; }
    });
  }
  const reviewedIssues: string[] = [];
  const held = rows.filter(row => ['conflict', 'skipped'].includes(row.status));
  const candidates = [...held.map(row => ({ key: row.row.id, value: { kind: row.row.kind, data: row.row.data, reason: row.reason } })),
    ...batch.unresolved.map(issue => ({ key: issue.id, value: { message: issue.message } }))];
  let reviewHistoryAvailable = true;
  await Promise.all(candidates.map(async candidate => {
    const key = await observationDigest(candidate.value);
    try {
      const snapshot = await getDoc(doc(db, 'import_review_items', key));
      if (snapshot.exists()) { reviewedIssues.push(candidate.key); const row = held.find(row => row.row.id === candidate.key); if (row) row.reviewed = true; }
    } catch (error) {
      if ((error as { code?: string }).code !== 'permission-denied') throw error;
      reviewHistoryAvailable = false;
    }
  }));
  return { batch, digest, rows, reviewedIssues, reviewHistoryAvailable };
}

/** Keep unchanged held observations out of subsequent reviews. New values resurface. */
export async function acknowledgeImportItem(preview: ImportPreview, id: string): Promise<void> {
  const reviewedBy = coachId();
  const row = preview.rows.find(row => row.row.id === id && ['conflict', 'skipped'].includes(row.status));
  const issue = preview.batch.unresolved.find(issue => issue.id === id);
  if (!row && !issue) throw new Error('Only held observations or unresolved items can be acknowledged.');
  const key = await observationDigest(row ? { kind: row.row.kind, data: row.row.data, reason: row.reason } : { message: issue!.message });
  await writeWithOrigins([{ path: `import_review_items/${key}`, after: { reviewedBy, reviewedAt: new Date().toISOString(), batchId: preview.batch.id, decision: 'keep_current' }, origin: 'audit' }]);
}

function coachId(): string {
  const user = auth.currentUser;
  if (!user?.emailVerified || !user.email?.endsWith('@velocity-swimming.com')) throw new Error('Sign in with a verified Velocity coach account.');
  return user.uid;
}
export async function retryImportProjections(batchId: string): Promise<void> {
  coachId();
  const reference = doc(db, 'import_batches', batchId);
  const existing = await getDoc(reference);
  if (!existing.exists()) return;
  const stateRef = projectionReference(), owner = crypto.randomUUID();
  // Serialize rebuilds across different batches and coaches. A crashed worker
  // leaves a durable pending flag; its lease expires so a later review can retry.
  const generation = await runTransaction(db, async transaction => {
    const state = await transaction.get(stateRef), value = state.data();
    if (value?.state === 'complete' && existing.data().projectionState === 'complete') return null;
    if (value?.owner && value.leaseUntil > Date.now()) throw new Error('Another import is refreshing best times. Retry after it finishes.');
    const generation = value?.generation ?? crypto.randomUUID();
    const publish = await prepareOrigins(transaction, [{ path: 'import_state/projections', before: value ?? null, after: { generation, state: 'pending' }, origin: 'audit' }]);
    publish();
    transaction.set(stateRef, { ...value, generation, state: 'pending', owner, leaseUntil: Date.now() + 600000 });
    return generation;
  });
  if (!generation) return;
  let succeeded = false;
  try { await refreshSwimProjections(); succeeded = true; }
  finally {
    await runTransaction(db, async transaction => {
      const [state, current] = await Promise.all([transaction.get(stateRef), transaction.get(reference)]);
      const value = state.data();
      const complete = succeeded && value?.owner === owner && value.generation === generation;
      // A late worker must leave pending visible even if its lease expired.
      const publish = await prepareOrigins(transaction, [{ path: 'import_state/projections', before: value ?? null, after: { state: complete ? 'complete' : 'pending' }, origin: 'audit' }]);
      publish();
      transaction.set(stateRef, { ...value, state: complete ? 'complete' : 'pending', ...(value?.owner === owner ? { owner: null, leaseUntil: 0 } : {}) });
      if (current.exists() && complete && current.data().revision === existing.data().revision) transaction.update(reference, { projectionState: 'complete' });
    });
  }
}
export async function applyImportBatch(preview: ImportPreview, selectedIds: string[], reviewSeconds = 0): Promise<{ applied: number; alreadyApplied: number; projectionsPending: boolean }> {
  assertFreshTarget(preview.batch.target);
  const appliedBy = coachId(), batch = parseImportBatch(preview.batch), digest = await batchDigest(batch);
  if (digest !== preview.digest) throw new Error('Batch content changed. Preview again.');
  if (!Number.isFinite(reviewSeconds) || reviewSeconds < 0) throw new Error('Invalid review duration.');
  const ids = new Set(selectedIds);
  if (!ids.size || ids.size > 25) throw new Error('Select between 1 and 25 changes or checks per review.');
  const selected = preview.rows.filter(r => ids.has(r.row.id));
  if (selected.some(row => stableJson(row.row) !== stableJson(batch.rows.find(candidate => candidate.id === row.row.id)) || !row.row.verified || row.row.holdReason || row.row.sourceIds.some(id => ['blocked', 'not_checked'].includes(batch.sources.find(source => source.id === id)!.coverage)))) throw new Error('Observation changed or is not verified. Preview again.');
  if (selected.length !== ids.size || selected.some(r => !['add', 'change', 'checked'].includes(r.status) || !r.after || !r.targetId)) throw new Error('Only reviewed additions, changes and checks can be applied.');
  for (const row of selected.filter(row => row.row.kind === 'swim')) {
    const rosterChange = selected.find(other => other.row.kind === 'athlete' && other.targetId === row.row.data.athleteId);
    if (rosterChange?.fields.some(field => field === 'dob' || field === 'gender' || field.startsWith('name'))) throw new Error('Apply roster identity changes first, then preview races again against the corrected roster.');
  }
  const reference = doc(db, 'import_batches', batch.id);
  const result = await runTransaction(db, async transaction => {
    const header = await transaction.get(reference);
    if (header.exists() && header.data().digest !== digest) throw new Error('This batch id was already used for different content.');
    const targets = await Promise.all(selected.map(row => transaction.get(doc(db, IMPORT_COLLECTIONS[row.row.kind], row.targetId!))));
    const receipts = await Promise.all(selected.map(row => transaction.get(doc(reference, 'changes', row.row.id))));
    const publicRows = await Promise.all(selected.map(row => row.row.kind === 'athlete' ? transaction.get(doc(db, 'public_athletes', row.targetId!)) : Promise.resolve(null)));
    const athleteIds = [...new Set(selected.flatMap(row => Object.keys(row.dependencies ?? {})))];
    const dependencies = await Promise.all(athleteIds.map(id => transaction.get(doc(db, 'athletes', id))));
    const relationshipPaths = [...new Set(selected.flatMap(row => Object.keys(row.relationshipDependencies ?? {})))];
    const relationshipRows = await Promise.all(relationshipPaths.map(path => transaction.get(doc(db, path))));
    const projectionState = await transaction.get(projectionReference());
    const provenanceRows = await Promise.all(selected.map(async (row, index) => {
      await verifyRowEvidence(batch, row.row, path => transaction.get(doc(db, path)));
      const key = await evidenceKey(`${IMPORT_COLLECTIONS[row.row.kind]}/${row.targetId}`), ref = doc(db, 'record_provenance', key), old = await transaction.get(ref);
      const previous = old.data() as Provenance | undefined;
      if (receipts[index].exists()) return { ref, previous, value: previous ?? initialProvenance(`${IMPORT_COLLECTIONS[row.row.kind]}/${row.targetId}`, 'external'), resolved: [] };
      const value = await importedProvenance(`${IMPORT_COLLECTIONS[row.row.kind]}/${row.targetId}`, previous, row.before, row.status === 'checked' ? row.before! : row.after!, row.row.evidence.map(item => ({ ...item, fields: row.row.kind === 'standard' ? item.fields : factFields(row.row.data).filter(field => item.fields.some(scope => field === scope || field.startsWith(scope + '.'))) })).filter(item => item.fields.length), `${batch.id}_${row.row.id}`, path => transaction.get(doc(db, path)));
      const issues = await Promise.all((previous?.openDisagreements ?? []).map(async id => ({ id, snapshot: await transaction.get(doc(ref, 'disagreements', id)) })));
      const covered = row.row.evidence.flatMap(e => e.fields);
      const resolved = issues.filter(issue => Array.isArray(issue.snapshot.data()?.claims) && issue.snapshot.data()!.claims.every((claim: { field: string }) => covered.includes(claim.field))).map(issue => issue.id);
      value.openDisagreements = value.openDisagreements.filter(id => !resolved.includes(id)); value.needsAttention = hasAttentionReasons(value);
      return { ref, previous, value, resolved };
    }));
    const publishOrigins = await prepareOrigins(transaction, [
      ...selected.some((row, index) => !receipts[index].exists() && row.status !== 'checked' && ['athlete', 'swim'].includes(row.row.kind)) ? [{ path: 'import_state/projections', before: projectionState.data() ?? null, after: { state: 'pending' }, origin: 'audit' as const }] : [],
      { path: `import_batches/${batch.id}`, before: header.data() ?? null, after: { digest }, origin: 'audit' },
      ...selected.filter((_, index) => !receipts[index].exists()).map(row => ({ path: `import_batches/${batch.id}/changes/${row.row.id}`, before: null, after: { rowId: row.row.id }, origin: 'audit' as const })),
      ...selected.filter((row, index) => !receipts[index].exists() && row.row.kind === 'athlete' && row.status !== 'checked').map(row => ({ path: `public_athletes/${row.targetId}`, before: publicRows[selected.indexOf(row)]?.data() ?? null, after: publicAthlete(row.targetId!, row.after as unknown as FirestoreAthlete) as unknown as JsonRecord, origin: 'derived' as const, derivedFrom: [`athletes/${row.targetId}`] })),
    ]);
    let applied = 0, alreadyApplied = 0, needsProjections = header.data()?.projectionState === 'pending';
    const now = new Date().toISOString();
    for (let index = 0; index < selected.length; index++) {
      const row = selected[index], current = targets[index].exists() ? { ...targets[index].data(), id: row.targetId! } : null;
      if (receipts[index].exists()) {
        if (receipts[index].data()!.state === 'reversed') throw new Error('A reversed row requires a new batch and review.');
        alreadyApplied++; continue;
      }
      if (stableJson(current) !== stableJson(row.before)) throw new Error(row.label + ' changed since preview. Nothing from this selection was written; preview again.');
      for (const [id, expected] of Object.entries(row.dependencies ?? {})) {
        const dependency = dependencies[athleteIds.indexOf(id)];
        if (!dependency.exists() || stableJson({ ...dependency.data(), id }) !== expected) throw new Error('Roster identity changed since preview. Preview again.');
      }
      for (const [path, expected] of Object.entries(row.relationshipDependencies ?? {})) {
        const dependency = relationshipRows[relationshipPaths.indexOf(path)];
        if (!dependency.exists() || stableJson(dependency.data()) !== expected) throw new Error('A linked record changed since preview. Preview again.');
      }
      const athlete = row.row.kind === 'swim' ? dependencies[athleteIds.indexOf(String(row.row.data.athleteId))]?.data() : undefined;
      const next = row.status === 'checked' ? current! : prepare(row.row, row.targetId!, current, athlete, batch.collectedAt);
      for (const path of entityReferences(next)) {
        if (!Object.hasOwn(row.relationshipDependencies ?? {}, path)) throw new Error('Relationship review is missing. Preview again.');
      }
      if (row.status !== 'checked' && sorted(next) !== sorted(row.after!)) throw new Error('Prepared data changed. Preview again.');
      const receipt: ImportReceipt = { rowId: row.row.id, kind: row.row.kind, targetId: row.targetId!, before: current, after: next, sourceIds: row.row.sourceIds, appliedAt: now, appliedBy, state: 'applied' };
      const provenance = provenanceRows[index];
      receipt.provenanceBefore = provenance.previous ?? null; receipt.provenanceAfter = provenance.value; receipt.checkOnly = row.status === 'checked';
      transaction.set(provenance.ref, provenance.value);
      transaction.set(doc(provenance.ref, 'events', `${batch.id}_${row.row.id}`), { type: receipt.checkOnly ? 'successful_check' : 'reviewed_import', at: now, evidence: row.row.evidence, receiptPath: `${reference.path ?? ('import_batches/' + batch.id)}/changes/${row.row.id}`, resolved: provenance.resolved });
      for (const id of provenance.resolved) transaction.update(doc(provenance.ref, 'disagreements', id), { status: 'resolved', resolutionEventId: `${batch.id}_${row.row.id}` });
      if (!receipt.checkOnly) transaction.set(doc(db, IMPORT_COLLECTIONS[row.row.kind], row.targetId!), next);
      if (row.row.kind === 'athlete' && !receipt.checkOnly) {
        const projection = asRecord(publicAthlete(row.targetId!, next as unknown as FirestoreAthlete));
        receipt.publicBefore = publicRows[index]?.exists() ? publicRows[index]!.data() : null; receipt.publicAfter = projection;
        transaction.set(doc(db, 'public_athletes', row.targetId!), projection);
      }
      transaction.set(doc(reference, 'changes', row.row.id), receipt);
      applied++;
      needsProjections ||= !receipt.checkOnly && ['athlete', 'swim'].includes(row.row.kind);
    }
    if (applied) publishOrigins();
    if (applied) transaction.set(reference, { ...header.data(), id: batch.id, digest, sources: batch.sources, unresolved: batch.unresolved,
      appliedCount: Number(header.data()?.appliedCount ?? 0) + applied, updatedAt: now, revision: crypto.randomUUID(),
      metrics: { collectionSeconds: batch.metrics?.collectionSeconds ?? null, reviewSeconds: Number(header.data()?.metrics?.reviewSeconds ?? 0) + reviewSeconds },
      projectionState: needsProjections ? 'pending' : 'complete' });
    if (applied && needsProjections) transaction.set(projectionReference(), { ...projectionState.data(), generation: crypto.randomUUID(), state: 'pending' });
    return { applied, alreadyApplied, needsProjections };
  });
  let projectionsPending = !!result.needsProjections;
  if (projectionsPending) {
    try { await retryImportProjections(batch.id); projectionsPending = await importProjectionsPending(batch.id); }
    catch { /* The durable pending flag keeps failed derived writes visible and retryable. */ }
  }
  return { applied: result.applied, alreadyApplied: result.alreadyApplied, projectionsPending };
}

export async function loadImportReceipts(batchId: string): Promise<ImportReceipt[]> {
  coachId();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(batchId)) throw new Error('Invalid batch id.');
  const snapshot = await getDocs(collection(db, 'import_batches', batchId, 'changes'));
  return snapshot.docs.map(row => row.data() as ImportReceipt);
}
export async function importProjectionsPending(batchId: string): Promise<boolean> {
  coachId();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(batchId)) throw new Error('Invalid batch id.');
  const [batch, state] = await Promise.all([getDoc(doc(db, 'import_batches', batchId)), getDoc(projectionReference())]);
  return batch.data()?.projectionState === 'pending' || state.data()?.state === 'pending';
}
export async function reverseImportChanges(batchId: string, rowIds: string[]): Promise<{ reversed: number; projectionsPending: boolean }> {
  assertFreshTarget();
  const reversedBy = coachId();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(batchId) || rowIds.some(id => !/^[a-zA-Z0-9_-]{1,128}$/.test(id))) throw new Error('Invalid batch or receipt id.');
  if (!rowIds.length || rowIds.length > 25 || new Set(rowIds).size !== rowIds.length) throw new Error('Select 1–25 distinct receipts to reverse.');
  const reference = doc(db, 'import_batches', batchId);
  const reversed = await runTransaction(db, async transaction => {
    const header = await transaction.get(reference);
    const receipts = await Promise.all(rowIds.map(id => transaction.get(doc(reference, 'changes', id))));
    if (!header.exists() || receipts.some(receipt => !receipt.exists())) throw new Error('Import receipt not found.');
    const data = receipts.map(receipt => receipt.data() as ImportReceipt);
    if (data.some(receipt => receipt.state === 'applied' && !receipt.before && receipt.kind !== 'swim')) throw new Error('New entities may have coaching references. Use the existing reviewed deletion workflow for these records; imported updates and races can be reversed here.');
    const current = await Promise.all(data.map(receipt => transaction.get(doc(db, IMPORT_COLLECTIONS[receipt.kind], receipt.targetId))));
    const projections = await Promise.all(data.map(receipt => receipt.kind === 'athlete' ? transaction.get(doc(db, 'public_athletes', receipt.targetId)) : Promise.resolve(null)));
    const provenance = await Promise.all(data.map(async receipt => {
      const reference = doc(db, 'record_provenance', await evidenceKey(`${IMPORT_COLLECTIONS[receipt.kind]}/${receipt.targetId}`));
      const snapshot = await transaction.get(reference);
      const issues = await Promise.all((receipt.provenanceBefore?.openDisagreements ?? []).filter(id => !receipt.provenanceAfter?.openDisagreements.includes(id)).map(async id => ({ id, snapshot: await transaction.get(doc(reference, 'disagreements', id)) })));
      const reopened = issues.filter(issue => issue.snapshot.data()?.status === 'resolved' && [`${batchId}_${receipt.rowId}`, receipt.rowId].includes(issue.snapshot.data()!.resolutionEventId)).map(issue => issue.id);
      return { reference, current: snapshot.data() as Provenance | undefined, reopened };
    }));

    const projectionState = await transaction.get(projectionReference());
    let count = 0, needsProjections = false;
    const publish = await prepareOrigins(transaction, [
      { path: `import_batches/${batchId}`, before: header.data()!, after: { reversal: rowIds }, origin: 'audit' },
      ...(data.some(receipt => receipt.state !== 'reversed' && !receipt.checkOnly && ['athlete', 'swim'].includes(receipt.kind)) ? [{ path: 'import_state/projections', before: projectionState.data() ?? null, after: { state: 'pending' }, origin: 'audit' as const }] : []),
      ...data.filter((receipt) => receipt.state !== 'reversed' && receipt.kind === 'athlete' && !receipt.checkOnly).map(receipt => ({ path: `public_athletes/${receipt.targetId}`, before: receipt.publicAfter ?? null, after: receipt.publicBefore ?? null, origin: 'derived' as const, derivedFrom: [`athletes/${receipt.targetId}`] })),
    ]);
    data.forEach((receipt, index) => {
      if (receipt.state === 'reversed') return;
      if (receipt.provenanceAfter && stableJson(provenance[index].current?.accepted) !== stableJson(receipt.provenanceAfter.accepted)) throw new Error('Evidence changed after import; nothing was reversed.');
      if (stableJson(current[index].data()) !== stableJson(receipt.after) ||
          (receipt.kind === 'athlete' && !receipt.checkOnly && stableJson(projections[index]?.data()) !== stableJson(receipt.publicAfter))) {
        throw new Error('A coach changed this record after import. Nothing was reversed.');
      }
      const target = doc(db, IMPORT_COLLECTIONS[receipt.kind], receipt.targetId);
      const prior = provenance[index];
      const failures = { ...receipt.provenanceBefore?.failures, ...prior.current?.failures }, openDisagreements = [...new Set([...(prior.current?.openDisagreements ?? []), ...prior.reopened])];
      const restored = { ...(prior.current ?? initialProvenance(target.path ?? `${IMPORT_COLLECTIONS[receipt.kind]}/${receipt.targetId}`, 'external')), accepted: receipt.provenanceBefore?.accepted ?? {}, failures, openDisagreements, needsAttention: !!Object.keys(failures).length || !!openDisagreements.length, lastSuccessfulCheckAt: receipt.provenanceBefore?.lastSuccessfulCheckAt ?? null, origin: receipt.provenanceBefore?.origin ?? prior.current?.origin ?? 'external', retired: !receipt.before, ...(receipt.checkOnly ? {} : { lastChangedAt: new Date().toISOString() }) };
      restored.needsAttention = hasAttentionReasons(restored);
      transaction.set(prior.reference, restored);
      transaction.set(doc(prior.reference, 'events', crypto.randomUUID()), { type: 'reversal', at: new Date().toISOString(), batchId, receiptId: receipt.rowId, reopened: prior.reopened });
      for (const id of prior.reopened) transaction.update(doc(prior.reference, 'disagreements', id), { status: 'open', resolutionEventId: null });
      if (!receipt.checkOnly) { if (receipt.before) transaction.set(target, receipt.before); else transaction.delete(target); }
      if (receipt.kind === 'athlete' && !receipt.checkOnly) {
        const publicRef = doc(db, 'public_athletes', receipt.targetId);
        if (receipt.publicBefore) transaction.set(publicRef, receipt.publicBefore); else transaction.delete(publicRef);
      }
      transaction.update(receipts[index].ref, { state: 'reversed', reversedAt: new Date().toISOString(), reversedBy });
      count++;
      needsProjections ||= !receipt.checkOnly && ['athlete', 'swim'].includes(receipt.kind);
    });
    if (count) {
      publish();
      transaction.update(reference, { projectionState: needsProjections ? 'pending' : header.data()?.projectionState ?? 'complete', revision: crypto.randomUUID() });
      if (needsProjections) transaction.set(projectionReference(), { ...projectionState.data(), generation: crypto.randomUUID(), state: 'pending' });
    }
    return count;
  });
  let projectionsPending = await importProjectionsPending(batchId);
  if (projectionsPending) { try { await retryImportProjections(batchId); projectionsPending = await importProjectionsPending(batchId); } catch {} }
  return { reversed, projectionsPending };
}
