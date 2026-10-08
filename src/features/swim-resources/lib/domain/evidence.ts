/** Shared browser/CLI evidence policy. All evidence remains outside public facts. */
export type Facts = Record<string, unknown>;
export interface EvidenceSource {
  id: string; name: string; kind: string; reference: string; scope: string;
  retrieval: 'http' | 'local' | 'email'; intervalDays: number; enabled: boolean;
  lastAttemptAt?: string; lastSuccessfulCheckAt?: string; currentRevisionId?: string;
}
export interface EvidenceBinding { id: string; sourceId: string; targetPath: string; fields: string[]; context: string; priority: number | null }
export interface ObservationEvidence { sourceId: string; revisionId: string; checkId: string; checkedAt: string; fields: string[]; context: string; excerpt: string }
export interface AcceptedField extends ObservationEvidence { priority: number | null; intervalDays: number; origin?: 'external' | 'manual'; confirmedBy?: ObservationEvidence & { intervalDays?: number } }
export type ReviewEvidence = Pick<ObservationEvidence, 'sourceId' | 'revisionId' | 'checkId' | 'checkedAt' | 'excerpt'>;
export interface ReviewQuestion {
  id: string; question: string; fields: string[]; evidence: ReviewEvidence[];
  status: 'open' | 'resolved'; openedAt: string; updatedAt: string;
  resolution?: string; resolvedAt?: string;
}
export interface Provenance {
  targetPath: string; targetCollection: string; origin: 'external' | 'manual' | 'derived' | 'audit';
  lastChangedAt: string | null; lastSuccessfulCheckAt: string | null; lastAttemptAt: string | null;
  accepted: Record<string, AcceptedField>; failures: Record<string, string>; openDisagreements: string[];
  needsAttention: boolean; requiredFields?: string[]; reviewQuestions?: ReviewQuestion[]; retired?: boolean;
}
export function hasAttentionReasons(provenance: Provenance): boolean {
  return Object.keys(provenance.failures).length > 0 || provenance.openDisagreements.length > 0 || !!provenance.reviewQuestions?.some(question => question.status === 'open');
}
export const safeEvidenceId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
export const isoTime = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
export function safeField(path: unknown): path is string {
  return typeof path === 'string' && path.length <= 200 && path.split('.').every(part => !!part && !/[\x00-\x1f/]/.test(part) && !['__proto__', 'constructor', 'prototype'].includes(part));
}
export function stableFacts(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableFacts).join(',') + ']';
  return '{' + Object.keys(value).sort().filter(key => (value as Facts)[key] !== undefined).map(key => JSON.stringify(key) + ':' + stableFacts((value as Facts)[key])).join(',') + '}';
}
export function factFields(data: Facts, prefix = ''): string[] {
  return Object.entries(data).flatMap(([key, value]) => ['id', 'metadata', 'createdAt', 'updatedAt', 'lastUpdated', 'calculatedAt'].includes(key) ? [] : value && typeof value === 'object' && !Array.isArray(value) ? factFields(value as Facts, prefix + key + '.') : [prefix + key]);
}
export function semanticFacts(data: Facts | null): string { return data === null ? 'null' : stableFacts(Object.fromEntries(factFields(data).map(field => [field, getFact(data, field)]))); }
export function getFact(data: Facts, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' && Object.hasOwn(value, key) ? (value as Facts)[key] : undefined, data);
}
export function setFact(data: Facts, path: string, value: unknown): void {
  if (!safeField(path) || value === undefined) throw new Error('Invalid observation field.');
  const keys = path.split('.'); let cursor = data;
  for (const key of keys.slice(0, -1)) { cursor[key] = { ...((cursor[key] as Facts) ?? {}) }; cursor = cursor[key] as Facts; }
  cursor[keys.at(-1)!] = value;
}
export async function evidenceKey(path: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(path));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function initialProvenance(path: string, origin: Provenance['origin']): Provenance {
  return { targetPath: path, targetCollection: path.split('/')[0], origin, accepted: {}, failures: {}, openDisagreements: [], needsAttention: false, lastChangedAt: null, lastSuccessfulCheckAt: null, lastAttemptAt: null };
}
export function validateObservation(value: unknown): asserts value is ObservationEvidence {
  const e = value as ObservationEvidence;
  if (!e || !safeEvidenceId(e.sourceId) || !/^[a-f0-9]{64}$/.test(e.revisionId) || !safeEvidenceId(e.checkId) || !isoTime(e.checkedAt) || !Array.isArray(e.fields) || !e.fields.length || e.fields.length > 100 || e.fields.some(field => !safeField(field)) || new Set(e.fields).size !== e.fields.length || !e.context?.trim() || typeof e.excerpt !== 'string' || !e.excerpt.trim() || e.excerpt.length > 4000) throw new Error('Evidence needs source, immutable capture hash, check, timestamp, checked fields, context and a supporting excerpt.');
}
export function validateSource(source: EvidenceSource): void {
  if (!source || !safeEvidenceId(source.id) || !source.name?.trim() || !source.scope?.trim() || !source.reference?.trim() || (source.kind === 'email' && source.retrieval !== 'email') || !['http', 'local', 'email'].includes(source.retrieval) || typeof source.enabled !== 'boolean' || !Number.isInteger(source.intervalDays) || source.intervalDays < 1 || source.intervalDays > 3650) throw new Error('Invalid evidence source.');
  if (source.retrieval === 'http') { const url = new URL(source.reference); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Sources require public HTTP URLs without credentials.'); }
}
export function validateBinding(binding: EvidenceBinding): void {
  if (!safeEvidenceId(binding.id) || !safeEvidenceId(binding.sourceId) || !binding.context?.trim() || !/^([a-z_]+)\/[^/]+$/.test(binding.targetPath) || !Array.isArray(binding.fields) || !binding.fields.length || binding.fields.length > 100 || binding.fields.some(field => !safeField(field) || ['id', 'metadata', 'createdAt', 'updatedAt'].includes(field.split('.')[0])) || new Set(binding.fields).size !== binding.fields.length || (binding.priority !== null && (!Number.isInteger(binding.priority) || binding.priority < 1 || binding.priority > 1000))) throw new Error('Invalid source binding.');
}
export function freshness(provenance: Provenance, now = Date.now()): { due: string[]; fullyChecked: boolean; nextCheckAt: string | null; needsAttention: boolean } {
  const entries = Object.entries(provenance.accepted);
  const missing = (provenance.requiredFields ?? []).filter(field => !Object.hasOwn(provenance.accepted, field));
  const due = [...missing, ...entries.filter(([, field]) => Date.parse(field.confirmedBy?.checkedAt ?? field.checkedAt) + (field.confirmedBy?.intervalDays ?? field.intervalDays) * 86400000 <= now).map(([path]) => path)];
  const next = entries.map(([, field]) => Date.parse(field.confirmedBy?.checkedAt ?? field.checkedAt) + (field.confirmedBy?.intervalDays ?? field.intervalDays) * 86400000);
  return { due, fullyChecked: entries.length > 0 && (provenance.requiredFields ?? []).every(field => Object.hasOwn(provenance.accepted, field)) && !due.length && !hasAttentionReasons(provenance), nextCheckAt: next.length ? new Date(Math.min(...next)).toISOString() : null, needsAttention: provenance.needsAttention || hasAttentionReasons(provenance) || due.length > 0 };
}
export function recordCheck(previous: Provenance, sourceId: string, at: string, error: string | null): Provenance {
  const next = structuredClone(previous);
  next.lastAttemptAt = !next.lastAttemptAt || Date.parse(at) > Date.parse(next.lastAttemptAt) ? at : next.lastAttemptAt;
  if (error) next.failures[sourceId] = error; else delete next.failures[sourceId];
  next.needsAttention = hasAttentionReasons(next);
  return next;
}
/** Lower priority numbers win. Missing/tied authority is always a disagreement. */
export function reconcileObservation(input: { before: Facts; provenance: Provenance; source: EvidenceSource; binding: EvidenceBinding; evidence: ObservationEvidence; claims: Facts; eventId: string; reviewed?: boolean }) {
  const { before, source, binding, evidence, claims, eventId } = input;
  validateSource(source); validateBinding(binding); validateObservation(evidence);
  if (!source.enabled || source.id !== evidence.sourceId || binding.sourceId !== source.id || binding.targetPath !== input.provenance.targetPath || binding.context !== evidence.context || evidence.fields.some(field => !binding.fields.includes(field) || getFact(claims, field) === undefined)) throw new Error('Observation is outside the configured source/field context.');
  const after = structuredClone(before), disagreements: { field: string; current: unknown; proposed: unknown; resolved: boolean; reason: string }[] = [];
  const complete = binding.fields.every(field => evidence.fields.includes(field));
  const next = complete ? recordCheck(input.provenance, source.id, evidence.checkedAt, null) : recordCheck(input.provenance, source.id, evidence.checkedAt, input.provenance.failures[source.id] ?? null);
  next.requiredFields = [...new Set([...(next.requiredFields ?? []), ...binding.fields])];
  const automatic = ['teams', 'people', 'venues', 'meets', 'documents'].includes(binding.targetPath.split('/')[0]);
  let changed = false, confirmed = false;
  for (const field of evidence.fields) {
    const old = next.accepted[field], value = getFact(claims, field), current = getFact(before, field);
    if (old && Date.parse(evidence.checkedAt) < Date.parse(old.confirmedBy?.checkedAt ?? old.checkedAt)) throw new Error('Observation predates accepted evidence.');
    const equal = stableFacts(current) === stableFacts(value);
    if (old?.checkId === evidence.checkId && old.sourceId === source.id && !equal) throw new Error('A check cannot assert competing values; collect again.');
    const wins = (!old || old.context === evidence.context) && binding.priority !== null && (!old || old.priority === null || binding.priority < old.priority || (old.sourceId === source.id && binding.priority === old.priority));
    const accept = equal || input.reviewed || (automatic && wins);
    if (!equal) {
      disagreements.push({ field, current: current ?? null, proposed: value, resolved: !!accept, reason: input.reviewed ? 'reviewed_import' : accept ? 'preferred_source' : 'review_required' });
      if (!accept) { if (!next.openDisagreements.includes(eventId)) next.openDisagreements.push(eventId); continue; }
      setFact(after, field, value); changed = true;
    }
    confirmed = true;
    // Corroborating a value cannot silently replace its stronger authority.
    if (!old || !equal || (old.sourceId === source.id && old.context === evidence.context) || wins) next.accepted[field] = { ...evidence, fields: [field], priority: binding.priority, intervalDays: source.intervalDays, origin: source.kind === 'manual' ? 'manual' : 'external' };
    else next.accepted[field] = { ...old, confirmedBy: { ...evidence, intervalDays: source.intervalDays } };
  }
  if (next.openDisagreements.length > 100) throw new Error('Resolve outstanding disagreements before accepting more observations.');
  if (confirmed) next.origin = source.kind !== 'manual' || Object.values(next.accepted).some(field => field.origin === 'external') ? 'external' : 'manual';
  if (confirmed && source.kind !== 'manual') next.lastSuccessfulCheckAt = !next.lastSuccessfulCheckAt || Date.parse(evidence.checkedAt) > Date.parse(next.lastSuccessfulCheckAt) ? evidence.checkedAt : next.lastSuccessfulCheckAt;
  if (changed) next.lastChangedAt = evidence.checkedAt;
  next.needsAttention = hasAttentionReasons(next);
  return { after, provenance: next, changed, disagreements };
}
