import { captureBytes, archiveCapture } from './evidence-archive.mjs';
import { evidenceKey, initialProvenance, recordCheck, reconcileObservation, validateObservation, validateSource, validateBinding, stableFacts, safeEvidenceId, isoTime, setFact, hasAttentionReasons } from '../../../src/features/swim-resources/lib/domain/evidence.ts';
import { canonicalDirectory } from '../../../src/features/swim-resources/lib/domain/fresh-record.ts';
import { IMPORT_COLLECTIONS } from '../../../src/features/swim-resources/lib/domain/import-batch.ts';
import { entityReferences } from '../../../src/features/swim-resources/lib/domain/entities.ts';

/** Archives precede atomic facts/provenance/receipt commits. Dry runs never write. */
export async function reconcileBundle(context, bundle, bucket, archive = archiveCapture) {
  if (context.database !== 'velocity-v2' || bundle.version !== 2 || bundle.target?.project !== context.project || bundle.target.database !== context.database || !Array.isArray(bundle.captures) || !Array.isArray(bundle.observations) || bundle.captures.length > 100 || bundle.observations.length > 100) throw new Error('Invalid reconciliation target or bundle size.');
  const report = { checks: 0, changed: 0, held: 0, failures: 0, skipped: 0 };
  const keys = bundle.captures.map(c => `${c.sourceId}/${c.checkId}`);
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate capture check.');
  for (const o of bundle.observations) if (!keys.includes(`${o.evidence?.sourceId}/${o.evidence?.checkId}`)) throw new Error('Observation has no collected capture.');
  for (const capture of bundle.captures) {
    if (!safeEvidenceId(capture.sourceId) || !safeEvidenceId(capture.checkId) || !['retrieved', 'failed'].includes(capture.outcome) || !isoTime(capture.at)) throw new Error('Invalid capture.');
    const sourceRef = context.db.doc('sources/' + capture.sourceId), sourceSnap = await sourceRef.get();
    if (!sourceSnap.exists) throw new Error('Register the source before reconciling.');
    const source = sourceSnap.data(); validateSource(source);
    if (!source.enabled) throw new Error('Source is disabled.');
    const bindingRows = await context.db.collection('source_bindings').where('sourceId', '==', capture.sourceId).limit(101).get();
    if (bindingRows.size > 100) throw new Error('Split sources with more than 100 bindings.');
    const bindings = bindingRows.docs.map(d => d.data()); bindings.forEach(validateBinding);
    let revision = null, error = capture.outcome === 'failed' ? 'Source unavailable' : null;
    if (!error) {
      try {
        const bytes = await captureBytes(capture.file, capture.hash);
        if (context.apply) revision = await archive(context, bucket, capture.sourceId, capture, bytes);
      } catch { error = 'Archive unavailable'; }
    }
    const observations = bundle.observations.filter(o => o.evidence.sourceId === source.id && o.evidence.checkId === capture.checkId);
    const scopes = observations.map(o => `${o.targetPath}/${o.evidence.context}`);
    if (new Set(scopes).size !== scopes.length) throw new Error('Use one observation per target and context.');
    for (const o of observations) { validateObservation(o.evidence); if (o.evidence.revisionId !== capture.hash || o.evidence.checkedAt !== capture.at) throw new Error('Observation does not match its capture.'); }
    const checkRef = context.db.doc(`sources/${source.id}/checks/${capture.checkId}`);
    if (context.apply) await context.db.runTransaction(async tx => {
      const [check, liveSource, storedRevision] = await Promise.all([tx.get(checkRef), tx.get(sourceRef), revision ? tx.get(context.db.doc(`sources/${source.id}/revisions/${capture.hash}`)) : null]);
      if (!liveSource.data()?.enabled || liveSource.data().reference !== source.reference) throw new Error('Source changed; collect again.');
      if (check.exists) {
        if (check.data().at !== capture.at || check.data().revisionId !== (error ? null : capture.hash) || check.data().outcome !== (error ? 'failed' : 'retrieved')) throw new Error('Immutable check changed; collect a new attempt.');
        return;
      }
      if (revision && !storedRevision.exists) tx.create(context.db.doc(`sources/${source.id}/revisions/${capture.hash}`), revision);
      tx.create(checkRef, { sourceId: source.id, at: capture.at, outcome: error ? 'failed' : 'retrieved', revisionId: error ? null : capture.hash, error });
      const value = liveSource.data();
      tx.set(sourceRef, { ...value, ...(!value.lastAttemptAt || Date.parse(capture.at) >= Date.parse(value.lastAttemptAt) ? { lastAttemptAt: capture.at, lastError: error, ...(!error ? { currentRevisionId: capture.hash } : {}) } : {}) });
    });
    report.checks++; if (error) report.failures++;
    for (const binding of bindings) {
      const observation = observations.find(o => o.targetPath === binding.targetPath && o.evidence.context === binding.context);
      const kind = Object.entries(IMPORT_COLLECTIONS).find(([, c]) => c === binding.targetPath.split('/')[0])?.[0];
      const targetRef = context.db.doc(binding.targetPath), provRef = context.db.doc('record_provenance/' + await evidenceKey(binding.targetPath));
      const eventId = await evidenceKey(stableFacts({ check: capture.checkId, source: source.id, binding: binding.id, observation: observation ?? null }));
      const eventRef = provRef.collection('events').doc(eventId);
      const batchId = 'auto_' + await evidenceKey(`${source.id}/${capture.checkId}`), batchRef = context.db.doc('import_batches/' + batchId);
      const receiptRef = batchRef.collection('changes').doc(eventId);
      const execute = async tx => {
        const [target, previous, event, liveBinding, liveSource, batch] = await Promise.all([tx.get(targetRef), tx.get(provRef), tx.get(eventRef), tx.get(context.db.doc('source_bindings/' + binding.id)), tx.get(sourceRef), tx.get(batchRef)]);
        if (event.exists) return { skipped: 1 };
        if (stableFacts(liveBinding.data()) !== stableFacts(binding)) throw new Error('Source binding changed; reconcile again.');
        const provenance = previous.data() ?? initialProvenance(binding.targetPath, 'external');
        let reason = error ?? (capture.verificationError ? 'Incomplete parsing' : null) ?? (!observation ? 'Field verification required' : !target.exists ? 'New entity requires reviewed Import' : null);
        let next = recordCheck(provenance, source.id, capture.at, reason), after = target.data(), result;
        if (!reason && kind) {
          // Validation failures retain facts and successful dates. Network/transaction
          // failures still propagate, so they cannot masquerade as parsing failures.
          try {
            result = reconcileObservation({ before: after, provenance, source: liveSource.data(), binding, evidence: observation.evidence, claims: observation.claims, eventId });
            next = result.provenance;
            const patch = {};
            for (const field of observation.evidence.fields) if (result.disagreements.some(d => d.field === field && d.resolved)) setFact(patch, field, field.split('.').reduce((v, k) => v?.[k], result.after));
            if (result.changed) after = canonicalDirectory(kind, target.id, after, patch);
            if (kind === 'document' && after.sourceId === source.id && after.currentRevisionId !== capture.hash && observation.evidence.fields.every(field => next.accepted[field]?.sourceId === source.id)) { after = { ...after, currentRevisionId: capture.hash }; result.changed = true; next.lastChangedAt = capture.at; }
            if (Buffer.byteLength(stableFacts([target.data(), after, provenance, next])) > 750000) reason = 'Record exceeds safe receipt size';
          } catch { reason = 'Invalid or incomplete verified fields'; }
          if (!reason) for (const path of entityReferences(after)) if (!(await tx.get(context.db.doc(path))).exists) { reason = 'Referenced entity requires reviewed Import'; break; }
          if (reason) { result = undefined; after = target.data(); next = recordCheck(provenance, source.id, capture.at, reason); }
        }
        const issues = await Promise.all((provenance.openDisagreements ?? []).map(async id => ({ id, value: (await tx.get(provRef.collection('disagreements').doc(id))).data() })));
        const resolved = issues.filter(issue => issue.value?.claims.every(claim => {
          const accepted = next.accepted[claim.field]; return observation?.evidence.fields.includes(claim.field) && accepted?.checkId === capture.checkId && accepted.sourceId === source.id && accepted.context === binding.context;
        })).map(issue => issue.id);
        next.openDisagreements = next.openDisagreements.filter(id => !resolved.includes(id));
        next.needsAttention = hasAttentionReasons(next);
        const stats = { changed: result?.changed ? 1 : 0, held: reason || result?.disagreements.some(d => !d.resolved) ? 1 : 0 };
        if (!context.apply) return stats;
        if (result?.changed) tx.set(targetRef, after);
        tx.set(provRef, next);
        tx.create(eventRef, { sourceId: source.id, at: capture.at, type: reason ? 'attention' : 'observation', revisionId: error ? null : capture.hash, checkedFields: observation?.evidence.fields ?? [], resolved, ...(result ? { evidence: observation.evidence, disagreements: result.disagreements, receiptPath: receiptRef.path } : {}), error: reason });
        for (const id of resolved) tx.update(provRef.collection('disagreements').doc(id), { status: 'resolved', resolutionEventId: eventId });
        if (result?.disagreements.length) tx.create(provRef.collection('disagreements').doc(eventId), { sourceId: source.id, claims: result.disagreements, status: result.disagreements.some(d => !d.resolved) ? 'open' : 'resolved', resolutionEventId: result.disagreements.every(d => d.resolved) ? eventId : null });
        if (result && target.exists) {
          tx.create(receiptRef, { rowId: eventId, kind, targetId: target.id, before: target.data(), after, sourceIds: [source.id], appliedAt: capture.at, appliedBy: 'agent-cli', state: 'applied', checkOnly: !result.changed, provenanceBefore: provenance, provenanceAfter: next });
          tx.set(batchRef, { ...batch.data(), id: batchId, origin: 'audit', target: bundle.target, mode: 'reconciliation', appliedCount: (batch.data()?.appliedCount ?? 0) + 1, updatedAt: capture.at, projectionState: 'complete', revision: eventId });
          for (const path of [batchRef.path, receiptRef.path]) tx.set(context.db.doc('record_provenance/' + await evidenceKey(path)), { ...initialProvenance(path, 'audit'), lastChangedAt: capture.at });
        }
        return stats;
      };
      const stats = context.apply ? await context.db.runTransaction(execute) : await execute({ get: ref => ref.get() });
      for (const [key, count] of Object.entries(stats ?? {})) report[key] += count;
    }
    if (context.apply && !error && !capture.verificationError && bindings.length && bindings.every(binding => observations.some(o => o.targetPath === binding.targetPath && o.evidence.context === binding.context && binding.fields.every(f => o.evidence.fields.includes(f))))) await context.db.runTransaction(async tx => {
      const scopes = await Promise.all(bindings.map(async binding => tx.get(context.db.doc('record_provenance/' + await evidenceKey(binding.targetPath)))));
      const current = await tx.get(sourceRef);
      if (scopes.every(scope => !scope.data()?.failures?.[source.id]) && (!current.data().lastSuccessfulCheckAt || Date.parse(capture.at) > Date.parse(current.data().lastSuccessfulCheckAt))) tx.update(sourceRef, { lastSuccessfulCheckAt: capture.at });
    });
  }
  return report;
}
