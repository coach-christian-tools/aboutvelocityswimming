import { IMPORT_COLLECTIONS } from '../../../src/features/swim-resources/lib/domain/import-batch.ts';
import { evidenceKey, safeEvidenceId, safeField, isoTime, stableFacts, hasAttentionReasons } from '../../../src/features/swim-resources/lib/domain/evidence.ts';

function validateUpdate(update) {
  if (!update || !new RegExp(`^(${Object.values(IMPORT_COLLECTIONS).join('|')})/[^/]+$`).test(update.targetPath) || !safeEvidenceId(update.id) || !['open', 'resolved'].includes(update.status) || typeof update.question !== 'string' || !update.question.trim() || update.question.length > 2000 || !Array.isArray(update.fields) || !update.fields.length || update.fields.length > 25 || update.fields.some(field => !safeField(field)) || new Set(update.fields).size !== update.fields.length || !Array.isArray(update.evidence) || !update.evidence.length || update.evidence.length > 10) throw new Error('Invalid evidence-linked review question.');
  if (update.status === 'resolved' && (typeof update.resolution !== 'string' || !update.resolution.trim() || update.resolution.length > 2000)) throw new Error('Resolution requires an explanation and supporting evidence.');
  for (const evidence of update.evidence) if (!safeEvidenceId(evidence.sourceId) || !safeEvidenceId(evidence.checkId) || !/^[a-f0-9]{64}$/.test(evidence.revisionId) || !isoTime(evidence.checkedAt) || typeof evidence.excerpt !== 'string' || !evidence.excerpt.trim() || evidence.excerpt.length > 4000) throw new Error('Review evidence requires an exact capture and minimal supporting excerpt.');
}
/** Audit annotations never accept facts or advance verification/change dates. */
export async function updateReviewQuestions(context, manifest, at = new Date().toISOString()) {
  if (context.database !== 'velocity-v2' || manifest.version !== 1 || !safeEvidenceId(manifest.id) || manifest.target?.project !== context.project || manifest.target.database !== context.database || !isoTime(at) || !Array.isArray(manifest.updates) || !manifest.updates.length || manifest.updates.length > 25) throw new Error('Invalid review-question target or size.');
  manifest.updates.forEach(validateUpdate);
  if (new Set(manifest.updates.map(update => `${update.targetPath}/${update.id}`)).size !== manifest.updates.length) throw new Error('Duplicate review question.');
  const report = { changed: 0, unchanged: 0 };
  for (const update of manifest.updates) {
    const key = await evidenceKey(update.targetPath), reference = context.db.doc(`record_provenance/${key}`);
    const eventId = 'review_' + await evidenceKey(`${manifest.id}/${update.targetPath}/${update.id}`), eventRef = reference.collection('events').doc(eventId);
    const result = await context.db.runTransaction(async tx => {
      const [target, provenance, event] = await Promise.all([tx.get(context.db.doc(update.targetPath)), tx.get(reference), tx.get(eventRef)]);
      if (!target.exists || !provenance.exists || provenance.data().targetPath !== update.targetPath || provenance.data().retired) throw new Error('Review questions require an existing active record with provenance.');
      for (const evidence of update.evidence) {
        const [source, check, revision] = await Promise.all([tx.get(context.db.doc(`sources/${evidence.sourceId}`)), tx.get(context.db.doc(`sources/${evidence.sourceId}/checks/${evidence.checkId}`)), tx.get(context.db.doc(`sources/${evidence.sourceId}/revisions/${evidence.revisionId}`))]);
        if (!source.data()?.enabled || check.data()?.outcome !== 'retrieved' || check.data().revisionId !== evidence.revisionId || check.data().at !== evidence.checkedAt || revision.data()?.hash !== evidence.revisionId) throw new Error('Review question evidence has not been archived and checked.');
      }
      if (event.exists) { if (event.data().request !== stableFacts(update)) throw new Error('Review operation ID already used with different content.'); return 'unchanged'; }
      const previous = provenance.data(), questions = previous.reviewQuestions ?? [];
      const before = questions.find(question => question.id === update.id) ?? null;
      if (update.status === 'resolved' && before?.status !== 'open') throw new Error('Only an open question can be resolved.');
      const after = { id: update.id, question: update.question, fields: update.fields, evidence: update.evidence, status: update.status, openedAt: before?.openedAt ?? at, updatedAt: at, ...(update.status === 'resolved' ? { resolution: update.resolution, resolvedAt: at } : {}) };
      const next = { ...previous, reviewQuestions: [...questions.filter(question => question.id !== update.id), after] };
      if (next.reviewQuestions.length > 50 || Buffer.byteLength(stableFacts(next)) > 750000) throw new Error('Review questions exceed safe document size.');
      next.needsAttention = hasAttentionReasons(next);
      if (context.apply) { tx.set(reference, next); tx.create(eventRef, { type: 'review_question', at, operationId: manifest.id, request: stableFacts(update), questionId: update.id, before, after }); }
      return 'changed';
    });
    report[result]++;
  }
  return report;
}
