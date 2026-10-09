import { swimResourcesPath } from '../routes.ts';
import { type Provenance, freshness } from './evidence';
import { TEAM_SCOPED_COLLECTIONS } from './entities';
export type FilterType = 'string' | 'number' | 'boolean';
export interface ViewerField { path: string; label: string; type?: FilterType }
export interface CollectionConfig {
  id: string;
  label: string;
  columns: ViewerField[];
  filters: ViewerField[];
  children?: { id: string; label: string }[];
}

const field = (path: string, label: string, type: FilterType = 'string'): ViewerField => ({ path, label, type });
const config = (id: string, label: string, columns: ViewerField[], filters = columns): CollectionConfig => ({ id, label, columns, filters });
const athleteFields = [field('name.first', 'First name'), field('name.last', 'Last name'), field('currentGroup.name', 'Group'), field('status', 'Status')];
const swimFields = [field('athleteId', 'Athlete ID'), field('eventCode', 'Event'), field('timeMs', 'Time (ms)', 'number'), field('meet.id', 'Meet ID'), field('meet.date', 'Race date'), field('course', 'Course')];

/** Explicitly registered paths only. Adding a collection does not grant Firestore permission. */
export const VIEWER_COLLECTIONS: CollectionConfig[] = [
  { ...config('sources', 'Sources', [field('name', 'Name'), field('reference', 'Reference'), field('lastAttemptAt', 'Last attempt'), field('lastSuccessfulCheckAt', 'Source scope checked'), field('currentRevisionId', 'Current revision')], [field('kind', 'Kind'), field('retrieval', 'Retrieval'), field('enabled', 'Enabled', 'boolean')]), children: [{ id: 'checks', label: 'Check history' }, { id: 'revisions', label: 'Archived revisions' }] },
  config('source_bindings', 'Source bindings', [field('sourceId', 'Source'), field('targetPath', 'Record'), field('fields', 'Covered fields'), field('context', 'Context'), field('priority', 'Priority', 'number')], [field('sourceId', 'Source'), field('targetPath', 'Record'), field('context', 'Context'), field('priority', 'Priority', 'number')]),
  { ...config('record_provenance', 'Record provenance', [field('targetPath', 'Record'), field('origin', 'Origin'), field('lastSuccessfulCheckAt', 'Accepted fields checked'), field('lastChangedAt', 'Facts changed'), field('needsAttention', 'Stored attention', 'boolean')], [field('targetCollection', 'Collection'), field('targetPath', 'Record'), field('origin', 'Origin'), field('needsAttention', 'Attention reasons', 'boolean')]), children: [{ id: 'events', label: 'Evidence history' }, { id: 'disagreements', label: 'Disagreements' }] },
  config('teams', 'Teams', [field('name', 'Name'), field('lscCode', 'LSC'), field('clubCode', 'Club code'), field('location', 'Listed location'), field('website', 'Website'), field('email', 'Club email')]),
  config('people', 'People / contacts', [field('name', 'Name'), field('role', 'Role'), field('email', 'Email'), field('phone', 'Phone'), field('athleteId', 'Athlete ID')]),
  config('venues', 'Venues', [field('name', 'Name'), field('city', 'City'), field('state', 'State')]),
  config('documents', 'Documents', [field('name', 'Name'), field('type', 'Type'), field('url', 'Source URL'), field('meetId', 'Meet ID'), field('sourceId', 'Source')], [field('name', 'Name'), field('type', 'Type'), field('meetId', 'Meet ID'), field('venueId', 'Venue ID'), field('personId', 'Person ID'), field('athleteId', 'Athlete ID')]),
  { ...config('athletes', 'Athletes', athleteFields, [...athleteFields, field('gender', 'Gender'), field('personId', 'Person ID')]), children: [{ id: 'bests', label: 'Best times' }] },
  config('public_athletes', 'Public profiles', [field('name.first', 'First name'), field('name.last', 'Last name'), field('swimcloudId', 'SwimCloud ID')]),
  config('swims', 'Swims', swimFields, [...swimFields, field('gender', 'Gender'), field('isRelay', 'Relay', 'boolean'), field('status', 'Status')]),
  config('meets', 'Meets', [field('name', 'Name'), field('dates.startDate', 'Start date'), field('host', 'Host'), field('venue.city', 'City'), field('venue.course', 'Course')], [field('name', 'Name'), field('dates.startDate', 'Start date'), field('venue.state', 'State'), field('venue.course', 'Course'), field('entryStatus', 'Entry status'), field('hostTeamId', 'Host team ID'), field('venueId', 'Venue ID')]),
  config('standards', 'Standards', [field('name', 'Name'), field('governingBody', 'Governing body'), field('seasonYears', 'Seasons'), field('effectiveDate', 'Effective date')]),
  config('attendance', 'Attendance', [field('date', 'Date'), field('athleteId', 'Athlete ID'), field('sessionId', 'Session ID'), field('status', 'Status')]),
  config('roster_metadata', 'Roster metadata', [field('updatedAt', 'Updated')], []),
  config('events', 'Events', [field('name', 'Name'), field('date', 'Date'), field('startTime', 'Start time')]),
  config('practice_sessions', 'Practice sessions', [field('date', 'Date'), field('trainingGroup', 'Group'), field('location', 'Location'), field('leadCoach', 'Lead coach')]),
  config('analytics_snapshots', 'Stored analytics', [field('athleteId', 'Athlete ID'), field('season', 'Season'), field('calculatedAt', 'Calculated')]),
  config('sync_requests', 'Sync requests', [field('status', 'Status'), field('createdAt', 'Created')]),
  { ...config('import_batches', 'Import batches', [field('updatedAt', 'Updated'), field('projectionState', 'Projection state')]), children: [{ id: 'changes', label: 'Change receipts' }] },
  config('import_review_items', 'Import review items', [field('decision', 'Decision'), field('reviewedAt', 'Reviewed')]),
  config('import_state', 'Import state', [field('state', 'State'), field('updatedAt', 'Updated')]),
].map(item => (TEAM_SCOPED_COLLECTIONS as readonly string[]).includes(item.id)
  ? { ...item, columns: [...item.columns, field('teamId', 'Owning team ID')], filters: [...item.filters, field('teamId', 'Stored owning team ID')] }
  : item);

export const CHILD_COLLECTIONS: Record<string, CollectionConfig> = {
  'sources/checks': config('checks', 'Check history', [field('at', 'Attempt date'), field('outcome', 'Outcome'), field('revisionId', 'Revision'), field('error', 'Error')]),
  'sources/revisions': config('revisions', 'Archived revisions', [field('capturedAt', 'First capture'), field('hash', 'Content hash'), field('size', 'Bytes', 'number'), field('contentType', 'Type')]),
  'record_provenance/events': config('events', 'Evidence history', [field('at', 'Date'), field('type', 'Event'), field('sourceId', 'Source'), field('checkedFields', 'Checked fields')]),
  'record_provenance/disagreements': config('disagreements', 'Disagreements', [field('sourceId', 'Source'), field('status', 'Status'), field('resolutionEventId', 'Resolution')]),
  'athletes/bests': config('bests', 'Best times', [field('eventCode', 'Event'), field('bestTimeMs', 'Best time (ms)', 'number'), field('swimDate', 'Race date'), field('swimId', 'Swim ID')]),
  'import_batches/changes': config('changes', 'Change receipts', [field('kind', 'Kind'), field('targetId', 'Target ID'), field('state', 'State')]),
};

export function validDocumentId(value: string): boolean {
  return !!value && !['.', '..'].includes(value) && !/[\x00-\x1f/]/.test(value) && new TextEncoder().encode(value).length <= 1500;
}

export interface ViewerPath { kind: 'collection' | 'document'; path: string; collectionPath: string; config: CollectionConfig }
export function resolveViewerPath(parts: string[]): ViewerPath | null {
  if (parts.length < 1 || parts.length > 4 || parts.some(part => !validDocumentId(part))) return null;
  const root = VIEWER_COLLECTIONS.find(item => item.id === parts[0]);
  if (!root) return null;
  const configuration = parts.length > 2 ? CHILD_COLLECTIONS[`${parts[0]}/${parts[2]}`] : root;
  if (!configuration) return null;
  const kind = parts.length % 2 === 1 ? 'collection' : 'document';
  return { kind, path: parts.join('/'), collectionPath: parts.slice(0, kind === 'document' ? -1 : undefined).join('/'), config: configuration };
}

export const viewerHref = (path: string) => swimResourcesPath("/admin/data/") + path.split('/').map(encodeURIComponent).join('/');
export function fieldValue(data: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' && Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined, data);
}

export interface ViewerFilter { documentId?: string; field?: string; value?: string | number | boolean }
export function parseViewerFilter(configuration: CollectionConfig, params: URLSearchParams): ViewerFilter {
  const documentId = params.get('doc');
  const path = params.get('field');
  if (documentId !== null) {
    if (!validDocumentId(documentId)) throw new Error('Enter a valid document ID without slashes.');
    if (path) throw new Error('Use either a document ID or a field filter.');
    return { documentId };
  }
  if (!path) return {};
  const definition = configuration.filters.find(item => item.path === path);
  if (!definition || !params.has('value')) throw new Error('Choose a supported filter field and value.');
  const raw = params.get('value')!;
  if (definition.type === 'boolean') {
    if (!['true', 'false'].includes(raw)) throw new Error('Boolean filters require true or false.');
    return { field: path, value: raw === 'true' };
  }
  if (definition.type === 'number') {
    if (!raw.trim() || !Number.isFinite(Number(raw))) throw new Error('Enter a finite number for this filter.');
    return { field: path, value: Number(raw) };
  }
  return { field: path, value: raw };
}

export function isViewerCoach(user: { email: string | null; emailVerified: boolean; staff?: boolean } | null): boolean {
  return user?.staff === true || (user?.emailVerified === true && !!user.email?.toLowerCase().endsWith('@velocity-swimming.com'));
}

export const LEGACY_COLLECTIONS: Record<string, string> = {
  roster: 'athletes', athletes: 'athletes', swimsdb: 'swims', meets: 'meets', records: 'swims', standards: 'standards', attendance: 'attendance', analysis: 'analytics_snapshots',
};
export function legacyViewerHref(page: string, athlete?: string): string {
  const collection = LEGACY_COLLECTIONS[page];
  if (!collection) return swimResourcesPath("/admin");
  if (!athlete || !validDocumentId(athlete)) return viewerHref(collection);
  if (collection === 'athletes') return viewerHref(`${collection}/${athlete}`);
  if (['swims', 'analytics_snapshots'].includes(collection)) return viewerHref(collection) + '?' + new URLSearchParams({ field: 'athleteId', value: athlete });
  return viewerHref(collection);
}

export function loadedAttention(data: Record<string, unknown>, now = Date.now()): boolean {
  return data.accepted && data.targetPath ? freshness(data as unknown as Provenance, now).needsAttention : data.needsAttention === true;
}
