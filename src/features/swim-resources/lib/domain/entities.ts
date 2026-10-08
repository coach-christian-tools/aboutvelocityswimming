/** Stable private entity links. Owning team is distinct from a meet's host. */
export const VELOCITY_TEAM_ID = 'velocity-swimming';
export const VELOCITY_TEAM = { id: VELOCITY_TEAM_ID, name: 'Velocity Swimming' } as const;
export const TEAM_SCOPED_COLLECTIONS = ['athletes', 'people', 'venues', 'documents', 'meets', 'swims', 'attendance', 'roster_metadata', 'events', 'practice_sessions', 'analytics_snapshots'] as const;
export type EntityKind = 'team' | 'person' | 'venue' | 'document';
export const ENTITY_COLLECTIONS = { team: 'teams', person: 'people', venue: 'venues', document: 'documents' } as const;
export const entityId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const relations: Record<string, string> = { teamId: 'teams', hostTeamId: 'teams', personId: 'people', contactPersonIds: 'people', venueId: 'venues', venueIds: 'venues', documentIds: 'documents', athleteId: 'athletes', meetId: 'meets', swimId: 'swims', sessionId: 'practice_sessions', sourceId: 'sources', batchId: 'import_batches' };
export function relationshipPath(field: string, id: unknown): string | null {
  if (typeof id === 'string' && ['targetPath', 'receiptPath', 'derivedFrom'].includes(field)) return id;
  // Existing Firestore IDs may be less restrictive than new imported entity IDs.
  if (typeof id !== 'string' || !id || ['.', '..'].includes(id) || /[\x00-\x1f/]/.test(id) || new TextEncoder().encode(id).length > 1500) return null;
  const collection = relations[field];
  return collection ? `${collection}/${id}` : null;
}
export function owningTeam(collection: string, data: Record<string, unknown>): { id: string; assumed: boolean } | null {
  if (!(TEAM_SCOPED_COLLECTIONS as readonly string[]).includes(collection)) return null;
  if (typeof data.teamId === 'string' && data.teamId) return { id: data.teamId, assumed: false };
  return { id: VELOCITY_TEAM_ID, assumed: true };
}
/** Only explicit graph links are enforced; legacy embedded race/venue snapshots remain readable. */
export function entityReferences(data: Record<string, unknown>): string[] {
  return [...new Set(Object.entries(data).flatMap(([field, value]) => {
    if (!['teamId', 'hostTeamId', 'personId', 'contactPersonIds', 'venueId', 'venueIds', 'documentIds', 'athleteId', 'meetId'].includes(field)) return [];
    return (Array.isArray(value) ? value : [value]).flatMap(id => { const path = relationshipPath(field, id); return path ? [path] : []; });
  }))];
}
export function validateEntityLinks(data: Record<string, unknown>): void {
  for (const [field, value] of Object.entries(data)) {
    if (!relations[field]) continue;
    if (field.endsWith('Ids')) {
      if (!Array.isArray(value) || value.length > 100 || value.some(id => !entityId(id)) || new Set(value).size !== value.length) throw new Error(`${field} requires up to 100 distinct stable IDs.`);
    } else if (!entityId(value)) throw new Error(`${field} requires a stable document ID.`);
  }
}
const allowed: Record<EntityKind, string[]> = {
  team: ['id', 'name', 'lscCode', 'clubCode', 'location', 'website', 'email', 'phone', 'mailingAddress', 'contactPersonIds', 'venueIds', 'documentIds'],
  person: ['id', 'name', 'teamId', 'athleteId', 'role', 'email', 'phone', 'documentIds'],
  venue: ['id', 'name', 'teamId', 'address', 'city', 'state', 'postalCode', 'latitude', 'longitude', 'courses', 'website', 'contactPersonIds', 'documentIds'],
  document: ['id', 'name', 'teamId', 'url', 'type', 'meetId', 'venueId', 'personId', 'athleteId', 'publishedAt', 'sourceId', 'currentRevisionId'],
};
export function validateEntityPatch(kind: EntityKind, data: Record<string, unknown>): void {
  if (Object.keys(data).some(key => !allowed[kind].includes(key))) throw new Error(`Unsupported ${kind} fields.`);
  validateEntityLinks(data);
  if (data.id !== undefined && !entityId(data.id)) throw new Error('Invalid entity ID.');
  for (const [field, value] of Object.entries(data)) {
    if (['latitude', 'longitude'].includes(field)) {
      const bound = field === 'latitude' ? 90 : 180;
      if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > bound) throw new Error(`Invalid ${field}.`);
    } else if (field === 'courses') {
      if (!Array.isArray(value) || value.some(course => !['SCY', 'SCM', 'LCM'].includes(String(course)))) throw new Error('Invalid pool courses.');
    } else if (field.endsWith('Ids')) continue;
    else if (typeof value !== 'string') throw new Error(`${field} must be text.`);
  }
  for (const field of ['url', 'website']) if (data[field] !== undefined) {
    let url: URL;
    try { url = new URL(String(data[field])); } catch { throw new Error(`${field} requires an HTTP or HTTPS URL.`); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(`${field} requires an HTTP or HTTPS URL without credentials.`);
  }
  if (data.name !== undefined && !String(data.name).trim()) throw new Error('An entity name cannot be blank.');
  if (kind === 'team') {
    if (data.lscCode !== undefined && !/^[A-Z]{2}$/.test(String(data.lscCode))) throw new Error('Use a two-letter LSC code.');
    if (data.clubCode !== undefined && !/^[A-Z0-9]{1,8}$/.test(String(data.clubCode))) throw new Error('Use a published club code.');
    for (const [field, bound] of [['location', 500], ['mailingAddress', 1000], ['phone', 80]] as const) if (data[field] !== undefined && (!String(data[field]).trim() || String(data[field]).length > bound || /[\x00-\x1f]/.test(String(data[field])))) throw new Error(`Invalid team ${field}.`);
    if (data.email !== undefined && (String(data.email).length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email)))) throw new Error('Invalid team email.');
  }
  if (data.publishedAt !== undefined && !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(String(data.publishedAt))) throw new Error('Invalid publication date.');
}
export function canonicalEntity(kind: EntityKind, previous: Record<string, unknown> | null, patch: Record<string, unknown>, id: string): Record<string, unknown> {
  validateEntityPatch(kind, patch);
  if (kind === 'person' && previous?.athleteId && patch.athleteId && previous.athleteId !== patch.athleteId) throw new Error('A person cannot be reassigned to another athlete.');
  const next: Record<string, unknown> = { ...previous, ...patch, id };
  if (typeof next.name !== 'string' || !next.name.trim()) throw new Error(`A ${kind} needs a verified name.`);
  if (kind !== 'team' && !next.teamId) next.teamId = VELOCITY_TEAM_ID;
  if (kind === 'document' && !next.url) throw new Error('A document needs its source URL.');
  // Validate merged known fields too, without rejecting existing unrelated metadata.
  validateEntityPatch(kind, Object.fromEntries(Object.entries(next).filter(([key]) => allowed[kind].includes(key))));
  return next;
}

export interface RelatedQuery { label: string; collection: string; field: string; value: string }
export function relatedQueries(collection: string, id: string): RelatedQuery[] {
  const definitions: Record<string, [string, string][]> = {
    teams: (TEAM_SCOPED_COLLECTIONS as readonly string[]).map(target => [target, 'teamId']),
    people: [['athletes', 'personId'], ['documents', 'personId']],
    venues: [['meets', 'venueId'], ['documents', 'venueId']],
    meets: [['swims', 'meet.id'], ['documents', 'meetId']],
    athletes: [['people', 'athleteId'], ['swims', 'athleteId'], ['analytics_snapshots', 'athleteId'], ['documents', 'athleteId']],
  };
  return (definitions[collection] ?? []).map(([target, field]) => ({ label: target.replaceAll('_', ' '), collection: target, field, value: id }));
}
