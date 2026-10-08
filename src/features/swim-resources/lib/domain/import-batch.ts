import { validateObservation, factFields, type ObservationEvidence } from './evidence.ts';
import { ENTITY_COLLECTIONS, validateEntityPatch, validateEntityLinks, type EntityKind } from './entities.ts';
import type { Athlete, Meet, Swim } from '@/features/swim-resources/types/schema';
import { isCalendarDate } from './date.ts';
import { parseSwimTime } from './swim-time.ts';

export type ImportKind = 'athlete' | 'meet' | 'swim' | EntityKind | 'standard';
export type JsonRecord = Record<string, unknown>;
export interface ImportSource {
  id: string;
  name: string;
  kind: 'website' | 'roster_export' | 'result_file' | 'document' | 'swimcloud' | 'email' | 'manual';
  reference: string;
  collectedAt: string;
  coverage: 'complete' | 'partial' | 'blocked' | 'not_checked';
  scope: string;
  notes?: string;
  revisionId: string;
  checkId: string;
}
export interface ImportRow {
  id: string;
  kind: ImportKind;
  sourceIds: string[];
  verified: boolean;
  data: JsonRecord;
  holdReason?: string;
  evidence: ObservationEvidence[];
}
export interface ImportBatch {
  version: 2;
  target: { project: string; database: 'velocity-v2' };
  id: string;
  collectedAt: string;
  sources: ImportSource[];
  rows: ImportRow[];
  unresolved: { id: string; sourceIds: string[]; message: string }[];
  metrics?: { collectionSeconds?: number; reviewSeconds?: number };
}
export interface ImportPreviewRow {
  row: ImportRow;
  targetId?: string;
  label: string;
  status: 'add' | 'change' | 'checked' | 'conflict' | 'skipped';
  reason?: string;
  before: JsonRecord | null;
  comparisonBefore?: JsonRecord | null;
  after: JsonRecord | null;
  fields: string[];
  dependencies?: Record<string, string>;
  relationshipDependencies?: Record<string, string>;
  reviewed?: boolean;
}
export const IMPORT_COLLECTIONS = { athlete: 'athletes', meet: 'meets', swim: 'swims', standard: 'standards', ...ENTITY_COLLECTIONS } as const;
const safeId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const record = (value: unknown): value is JsonRecord => !!value && typeof value === 'object' && !Array.isArray(value);
const isoTimestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
function assertJson(value: unknown, depth = 0): void {
  if (depth > 15) throw new Error('Import nesting exceeds the supported depth.');
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) { value.forEach(item => assertJson(item, depth + 1)); return; }
  if (record(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key) || key.includes('.')) throw new Error('Unsafe import field: ' + key);
      assertJson(item, depth + 1);
    }
    return;
  }
  throw new Error('Imports require finite JSON values.');
}
export function parseImportBatch(input: unknown): ImportBatch {
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).length > 4 * 1024 * 1024) throw new Error('Import files must be 4 MB or smaller.');
    input = JSON.parse(input);
  }
  assertJson(input);
  if (!record(input) || input.version !== 2 || !record(input.target) || typeof input.target.project !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(input.target.project) || input.target.database !== 'velocity-v2' || !safeId(input.id) || !isoTimestamp(input.collectedAt) ||
      !Array.isArray(input.sources) || !Array.isArray(input.rows) || !Array.isArray(input.unresolved)) {
    throw new Error('Expected evidence-backed ImportBatch version 2 with id, collectedAt, sources, rows, and unresolved.');
  }
  if (!input.sources.length || input.sources.length > 100 || input.rows.length > 1000) throw new Error('Use 1–100 sources and at most 1,000 rows per batch.');
  if (new TextEncoder().encode(JSON.stringify({ sources: input.sources, unresolved: input.unresolved })).length > 750000) throw new Error('Source and unresolved metadata exceed the receipt size limit.');
  const sourceIds = new Set<string>();
  for (const source of input.sources) {
    if (!record(source) || !safeId(source.id) || sourceIds.has(source.id) || typeof source.name !== 'string' ||
        !['website', 'roster_export', 'result_file', 'document', 'swimcloud', 'email', 'manual'].includes(String(source.kind)) ||
        typeof source.reference !== 'string' || !source.reference.trim() || !isoTimestamp(source.collectedAt) ||
        !['complete', 'partial', 'blocked', 'not_checked'].includes(String(source.coverage)) || typeof source.scope !== 'string') {
      throw new Error('Each source needs a unique id, reference, collection time, scope, and coverage.');
    }
    if (source.notes !== undefined && typeof source.notes !== 'string') throw new Error('Source notes must be text.');
    if (!/^[a-f0-9]{64}$/.test(String(source.revisionId)) || !safeId(source.checkId)) throw new Error('Sources require archived revision and check IDs.');
    sourceIds.add(source.id);
  }
  const ids = new Set<string>();
  for (const row of input.rows) {
    if (!record(row) || !safeId(row.id) || ids.has(row.id) || !Object.hasOwn(IMPORT_COLLECTIONS, String(row.kind)) ||
        !strings(row.sourceIds) || !row.sourceIds.length || row.sourceIds.some(id => !sourceIds.has(id)) ||
        typeof row.verified !== 'boolean' || !record(row.data) ||
        (row.holdReason !== undefined && typeof row.holdReason !== 'string')) {
      throw new Error('Each row needs a unique id, kind, known sourceIds, verified flag, and data.');
    }
    if (new TextEncoder().encode(JSON.stringify(row.data)).length > 200000) throw new Error('Split records larger than 200 KB into a separate review.');
    if (!Array.isArray(row.evidence) || !row.evidence.length || row.evidence.length > 10) throw new Error('Rows require scoped capture evidence.');
    for (const e of row.evidence) { validateObservation(e); const source = input.sources.find(s => (s as JsonRecord).id === e.sourceId) as JsonRecord | undefined; if (!source || !row.sourceIds.includes(e.sourceId) || source.revisionId !== e.revisionId || source.checkId !== e.checkId) throw new Error('Evidence does not match its batch source.'); }
    const covered = row.evidence.flatMap(e => e.fields);
    if (factFields(row.data).some(field => !covered.some(scope => field === scope || field.startsWith(scope + '.')))) throw new Error('Every proposed field needs evidence.');
    ids.add(row.id);
  }
  const issueIds = new Set<string>();
  for (const issue of input.unresolved) {
    if (!record(issue) || !safeId(issue.id) || !strings(issue.sourceIds) || issue.sourceIds.some(id => !sourceIds.has(id)) || typeof issue.message !== 'string') {
      throw new Error('Unresolved items require an id, sourceIds, and message.');
    }
    if (issueIds.has(issue.id) || ids.has(issue.id)) throw new Error('Unresolved item ids must be unique and distinct from row ids.');
    issueIds.add(issue.id);
  }
  if (input.metrics !== undefined && (!record(input.metrics) || Object.entries(input.metrics).some(([key, value]) => !['collectionSeconds', 'reviewSeconds'].includes(key) || typeof value !== 'number' || !Number.isFinite(value) || value < 0))) throw new Error('Collection and review measurements must be nonnegative seconds.');
  return input as unknown as ImportBatch;
}

/** Stable snapshots include metadata, so even an unrelated edit invalidates a reviewed write. */
export function stableJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  return '{' + Object.keys(value).sort().filter(key => (value as JsonRecord)[key] !== undefined)
    .map(key => JSON.stringify(key) + ':' + stableJson((value as JsonRecord)[key])).join(',') + '}';
}
export async function batchDigest(batch: ImportBatch): Promise<string> {
  return observationDigest(batch);
}
export async function observationDigest(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJson(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function mergeImportPatch(previous: JsonRecord, patch: JsonRecord): JsonRecord {
  const next = { ...previous };
  for (const [key, value] of Object.entries(patch)) {
    next[key] = record(value) && record(previous[key]) ? mergeImportPatch(previous[key], value) : value;
  }
  return next;
}
export function changedFields(before: JsonRecord | null, after: JsonRecord | null, prefix = ''): string[] {
  const fields: string[] = [];
  for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    if (key === 'metadata' || key === 'createdAt' || key === 'updatedAt' || key === 'id') continue;
    const a = before?.[key], b = after?.[key], path = prefix + key;
    if (record(a) && record(b)) fields.push(...changedFields(a, b, path + '.'));
    else if (stableJson(a) !== stableJson(b)) fields.push(path);
  }
  return fields;
}
export { matchImportAthlete } from './athlete-match.ts';

function keys(data: unknown, allowedKeys: string[], label: string): asserts data is JsonRecord {
  if (!record(data) || Object.keys(data).some(key => !allowedKeys.includes(key))) throw new Error('Unsupported ' + label + ' fields.');
}
const allowed: Record<ImportKind, string[]> = {
  team: [], person: [], venue: [], document: [],
  standard: ['category', 'id', 'name', 'governingBody', 'seasonYears', 'effectiveDate', 'expirationDate', 'cuts'],
  athlete: ['teamId', 'personId', 'documentIds', 'id', 'name', 'dob', 'gender', 'status', 'currentGroup', 'aliases', 'teamUnifyId', 'swimsId', 'swimcloudId', 'graduatingYear', 'contact'],
  meet: ['teamId', 'hostTeamId', 'venueId', 'contactPersonIds', 'documentIds', 'id', 'name', 'sanctionNumber', 'host', 'hostClub', 'location', 'dates', 'type', 'venue', 'events'],
  swim: ['teamId', 'id', 'athleteId', 'externalResult', 'athleteName', 'gender', 'ageAtSwim', 'ageGroup', 'eventCode', 'distance', 'stroke', 'course', 'isRelay', 'relay', 'timeMs', 'timeDisplay', 'splits', 'reactionTimeMs', 'status', 'dqDetails', 'meet', 'round'],
};
export function validateImportData(kind: ImportKind, data: JsonRecord): void {
  if (Object.hasOwn(ENTITY_COLLECTIONS, kind)) { validateEntityPatch(kind as EntityKind, data); return; }
  if (kind === 'standard') {
    keys(data, allowed.standard, 'standard');
    if (!['motivational', 'championship'].includes(String(data.category))) throw new Error('Standards need a category.');
    for (const field of ['name', 'governingBody', 'seasonYears', 'effectiveDate', 'expirationDate']) if (typeof data[field] !== 'string' || !String(data[field]).trim()) throw new Error('Standards require complete verified metadata.');
    if (!isCalendarDate(String(data.effectiveDate)) || !isCalendarDate(String(data.expirationDate)) || !record(data.cuts)) throw new Error('Invalid standards dates or courses.');
    for (const [course, genders] of Object.entries(data.cuts)) {
      if (!['SCY', 'SCM', 'LCM'].includes(course) || !record(genders)) throw new Error('Invalid standards course.');
      for (const [gender, ages] of Object.entries(genders)) {
        if (!['M', 'F'].includes(gender) || !record(ages)) throw new Error('Invalid standards gender.');
        for (const events of Object.values(ages)) { if (!record(events)) throw new Error('Invalid standard events.'); for (const cuts of Object.values(events)) { if (!record(cuts) || Object.keys(cuts).some(key => key !== 'cutsByTier') || !Array.isArray(cuts.cutsByTier) || !cuts.cutsByTier.length || cuts.cutsByTier.some(cut => !record(cut) || Object.keys(cut).some(key => !['tierName', 'timeMs', 'timeDisplay'].includes(key)) || typeof cut.tierName !== 'string' || typeof cut.timeMs !== 'number' || cut.timeMs <= 0 || typeof cut.timeDisplay !== 'string' || parseSwimTime(cut.timeDisplay) !== cut.timeMs)) throw new Error('Invalid standard cuts.'); } }
      }
    }
    return;
  }
  validateEntityLinks(data);
  for (const key of Object.keys(data)) if (!allowed[kind].includes(key)) throw new Error('Import cannot write ' + key + '. Coaching fields cannot be imported.');
  if (data.id !== undefined && !safeId(data.id)) throw new Error('Invalid document id.');
  if (kind === 'athlete') {
    for (const key of ['teamUnifyId', 'swimsId', 'swimcloudId']) if (data[key] !== undefined && (typeof data[key] !== 'string' || !String(data[key]).trim())) throw new Error('External IDs must be nonempty strings.');
    if (data.name !== undefined) keys(data.name, ['first', 'last', 'preferred', 'middle'], 'name');
    if (data.currentGroup !== undefined) { keys(data.currentGroup, ['id', 'name', 'rosterTier', 'assignedAt'], 'group'); if (Object.values(data.currentGroup).some(value => typeof value !== 'string')) throw new Error('Group fields must be text.'); }
    if (data.contact !== undefined) {
      keys(data.contact, ['email', 'phone', 'parents'], 'contact');
      for (const key of ['email', 'phone']) if (data.contact[key] !== undefined && typeof data.contact[key] !== 'string') throw new Error('Contact fields must be text.');
      if (data.contact.parents !== undefined) {
        if (!Array.isArray(data.contact.parents)) throw new Error('Parents must be a list.');
        for (const parent of data.contact.parents) { keys(parent, ['name', 'email', 'phone', 'relationship'], 'parent'); if (Object.values(parent).some(value => typeof value !== 'string') || !['Mother', 'Father', 'Guardian'].includes(String(parent.relationship))) throw new Error('Invalid parent contact.'); }
      }
    }
    if (data.graduatingYear !== undefined && (!Number.isInteger(data.graduatingYear) || Number(data.graduatingYear) < 1900 || Number(data.graduatingYear) > 2200)) throw new Error('Invalid graduation year.');
    if (data.name !== undefined && (!record(data.name) || Object.values(data.name).some(value => typeof value !== 'string'))) throw new Error('Names must contain text fields.');
    if (data.aliases !== undefined && !strings(data.aliases)) throw new Error('Aliases must be a list of names.');
    if (data.currentGroup !== undefined && (!record(data.currentGroup) || typeof data.currentGroup.name !== 'string' || !data.currentGroup.name.trim())) throw new Error('A training group needs a name.');
    if (data.dob !== undefined && (typeof data.dob !== 'string' || !isCalendarDate(data.dob))) throw new Error('Use the real date of birth.');
    if (data.gender !== undefined && !['M', 'F', 'X'].includes(String(data.gender))) throw new Error('Unknown gender.');
    if (data.status !== undefined && !['active', 'taking_break', 'alumni', 'inactive'].includes(String(data.status))) throw new Error('Unknown roster status.');
  }
  if (kind === 'meet') {
    for (const key of ['name', 'sanctionNumber', 'host', 'hostClub', 'location']) if (data[key] !== undefined && typeof data[key] !== 'string') throw new Error('Meet text fields must be strings.');
    if (data.type !== undefined && !['Club', 'LSC', 'Zone', 'Combination', 'National'].includes(String(data.type))) throw new Error('Invalid meet type.');
    if (data.dates !== undefined && !record(data.dates)) throw new Error('Meet dates must be an object.');
    for (const [key, value] of Object.entries((data.dates ?? {}) as JsonRecord)) {
      if (!['startDate', 'endDate', 'entryDeadline', 'scratchDeadline'].includes(key) || typeof value !== 'string' ||
          !(isCalendarDate(value) || (key.endsWith('Deadline') && isoTimestamp(value)))) throw new Error('Invalid meet date: ' + key);
    }
    if (data.venue !== undefined) keys(data.venue, ['facilityName', 'city', 'state', 'location', 'course', 'poolLengthMeters', 'altitudeFeet'], 'venue');
    if (data.venue !== undefined && (!record(data.venue) || (data.venue.course !== undefined && !['SCY', 'SCM', 'LCM'].includes(String(data.venue.course))))) throw new Error('Invalid meet venue or course.');
    if (record(data.venue)) for (const [key, value] of Object.entries(data.venue)) {
      if (['poolLengthMeters', 'altitudeFeet'].includes(key) ? typeof value !== 'number' || value < 0 : typeof value !== 'string') throw new Error('Invalid venue field: ' + key);
    }
    if (data.events !== undefined) throw new Error('Event schedules require a separate reviewed schedule import. Meet imports accept metadata and document ID links.');
  }
  if (kind === 'swim') {
    if (data.athleteName !== undefined) keys(data.athleteName, ['first', 'last'], 'race name');
    if (data.meet !== undefined) keys(data.meet, ['id', 'name', 'date', 'location', 'altitudeFeet'], 'race meet');
    if (data.timeMs !== undefined && (!Number.isInteger(data.timeMs) || Number(data.timeMs) < 0)) throw new Error('Race timeMs must be integer milliseconds.');
    if (data.timeDisplay !== undefined && typeof data.timeDisplay !== 'string') throw new Error('Race display time must be text.');
    if (typeof data.timeDisplay === 'string' && data.timeMs !== undefined && parseSwimTime(data.timeDisplay) !== data.timeMs) throw new Error('Race display time differs from its milliseconds.');
    if (data.relay !== undefined) {
      keys(data.relay, ['teamName', 'leg', 'isLeadOffFlatStart', 'teamResultId'], 'relay');
      if (!data.isRelay || ![1, 2, 3, 4].includes(Number(data.relay.leg)) || typeof data.relay.isLeadOffFlatStart !== 'boolean' || typeof data.relay.teamName !== 'string') throw new Error('Invalid observed relay context.');
    }
    if (data.isRelay === true && !data.relay) throw new Error('Relay races require observed leg and start context.');
    if (data.splits !== undefined || data.reactionTimeMs !== undefined || data.dqDetails !== undefined) throw new Error('Detailed race telemetry needs separate verification; import the core official result first.');
    if (data.externalResult !== undefined) {
      keys(data.externalResult, ['namespace', 'id'], 'external result');
      if (!safeId(data.externalResult.namespace) || !safeId(data.externalResult.id)) throw new Error('A result needs a stable source namespace and id.');
    }
    // Round, relay status, and status must be observed; PB pages alone are not race histories.
    if (!['F', 'P', 'S', 'TT'].includes(String(data.round)) || typeof data.isRelay !== 'boolean' || !['OK', 'DQ', 'DFS', 'NS'].includes(String(data.status))) {
      throw new Error('A race requires its observed round, relay status, and official status; hold incomplete PB observations.');
    }
  }
}
export type ImportedEntity = Athlete | Meet | Swim;
