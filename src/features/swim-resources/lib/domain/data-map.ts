import { VIEWER_COLLECTIONS, CHILD_COLLECTIONS, viewerHref } from './data-viewer';
import { TEAM_SCOPED_COLLECTIONS } from './entities';

export type MapGroup = 'Directory' | 'Performance' | 'Coaching' | 'Import' | 'Evidence';
export type RelationshipKind = 'reference' | 'projection' | 'contains' | 'workflow' | 'ownership';
export interface DataNode { id: string; label: string; path: string; href: string; group: MapGroup; purpose: string; storage: string; public: boolean; fields: string[] }
export interface DataRelationship { from: string; to: string; field: string; kind: RelationshipKind; note: string }
const descriptions: Record<string, [MapGroup, string, string]> = {
  sources: ['Evidence', 'Private external, manual and email references; retrieval attempts differ from successful field verification.', 'Source configuration'],
  source_bindings: ['Evidence', 'Exact source, record, field and context scope. Explicit lower priority numbers have greater authority.', 'Field authority configuration'],
  record_provenance: ['Evidence', 'Accepted evidence per field, successful checks, fact changes, failures, unresolved disagreements and evidence-linked review questions.', 'Private record evidence'],
  'sources/checks': ['Evidence', 'Immutable retrieval attempts; retrieval alone does not verify facts.', 'Immutable check history'],
  'sources/revisions': ['Evidence', 'Content hashes and private Storage paths. Earlier decisions retain exact revisions.', 'Immutable archive metadata'],
  'record_provenance/events': ['Evidence', 'Checks, observations, question updates, resolutions and reversals retain evidence history.', 'Immutable evidence history'],
  'record_provenance/disagreements': ['Evidence', 'Competing field claims and their resolution event pointers.', 'Claims with resolution state'],
  teams: ['Directory', 'Team identity, LSC and club codes, listed service locations, website, club contacts and venues. Mailing addresses do not imply pool locations.', 'Canonical entity'],
  people: ['Directory', 'Private contact directory. Athlete-linked people point to the canonical athlete details.', 'Canonical directory identity'],
  venues: ['Directory', 'Pool identity, address, coordinates, courses and contacts.', 'Canonical entity'],
  documents: ['Directory', 'Source URLs and document metadata linked to entities; immutable private captures live in sources/{sourceId}/revisions.', 'Source evidence'],
  athletes: ['Directory', 'Private roster, demographics, groups and athlete contact details.', 'Canonical athlete'],
  public_athletes: ['Directory', 'Allowlisted public athlete identity; excludes private contacts and coaching details.', 'Public projection'],
  swims: ['Performance', 'Structured race facts, times, athlete ID and embedded meet snapshot. Team records are calculated from these facts without a stored records collection.', 'Canonical performance'],

  meets: ['Directory', 'Meet dates, hosting team, venue links, embedded venue details and document links.', 'Canonical entity with embedded snapshots'],
  standards: ['Performance', 'Shared qualifying time matrices and governing-body/season metadata.', 'Reference data'],
  attendance: ['Coaching', 'Typed entries: athleteId, sessionId, date and status. Earlier session maps remain in the original database.', 'Canonical coaching facts'],
  roster_metadata: ['Coaching', 'Roster-wide metadata and update state.', 'Supporting metadata'],
  events: ['Coaching', 'Scheduled team events and dates.', 'Stored schedule'],
  practice_sessions: ['Coaching', 'Practice dates, training group, location and coach labels.', 'Stored schedule'],
  analytics_snapshots: ['Coaching', 'Stored athlete/season analysis. The viewer displays persisted calculations.', 'Derived snapshot'],
  sync_requests: ['Import', 'Requests for external sync processing; lifecycle updates belong to the backend.', 'Workflow queue'],
  import_batches: ['Import', 'Prepared observations, inline source evidence, preview/apply state and projection recovery.', 'Workflow and audit'],
  import_review_items: ['Import', 'Coach review decisions associated with prepared batches.', 'Audit'],
  import_state: ['Import', 'Import concurrency lease and projection recovery state.', 'Workflow state'],
  'athletes/bests': ['Performance', 'Per-athlete best-time projection, keyed by event code and pointing to the selected swim.', 'Derived projection / subcollection'],
  'import_batches/changes': ['Import', 'Per-batch receipts: target kind/ID, before/after snapshots, source IDs and reversal state.', 'Audit / subcollection'],
};
const publicIds = new Set(['public_athletes', 'standards', 'athletes/bests']);
const node = (id: string, label: string, fields: string[], parent?: string): DataNode => {
  const description = descriptions[id];
  if (!description) throw new Error(`Missing data-map description for ${id}`);
  const [group, purpose, storage] = description;
  return { id, label, fields, group, purpose, storage, public: publicIds.has(id), path: parent ? `${parent}/{documentId}/${id.split('/')[1]}` : id, href: viewerHref(parent ?? id) };
};
export const DATA_NODES: DataNode[] = VIEWER_COLLECTIONS.flatMap(collection => [
  node(collection.id, collection.label, [...new Set([...collection.columns, ...collection.filters].map(field => field.path))]),
  ...(collection.children ?? []).map(child => node(`${collection.id}/${child.id}`, child.label, CHILD_COLLECTIONS[`${collection.id}/${child.id}`].columns.map(field => field.path), collection.id)),
]);
const edge = (from: string, to: string, field: string, kind: RelationshipKind = 'reference', note = 'Optional stored ID link; existing documents may omit it.'): DataRelationship => ({ from, to, field, kind, note });
export const DATA_RELATIONSHIPS: DataRelationship[] = [
  edge('sources', 'sources/checks', 'checks', 'contains'), edge('sources', 'sources/revisions', 'revisions', 'contains'),
  edge('source_bindings', 'sources', 'sourceId'),
  edge('record_provenance', 'record_provenance/events', 'events', 'contains'), edge('record_provenance', 'record_provenance/disagreements', 'disagreements', 'contains'),
  edge('record_provenance', 'sources', 'accepted.{field}.sourceId'), edge('record_provenance', 'sources/revisions', 'accepted.{field}.revisionId'),
  edge('documents', 'sources', 'sourceId'), edge('documents', 'sources/revisions', 'currentRevisionId'),
  ...['teams', 'people', 'venues', 'documents', 'athletes', 'swims', 'meets', 'standards'].flatMap(id => [edge('record_provenance', id, 'targetPath'), edge('source_bindings', id, 'targetPath')]),
  ...TEAM_SCOPED_COLLECTIONS.map(id => edge(id, 'teams', 'teamId', 'ownership', 'Stored owning team. Missing legacy ownership resolves to Velocity Swimming; ownership does not imply hosting.')),
  ...['teams', 'venues', 'meets'].map(id => edge(id, 'people', 'contactPersonIds[]')),
  edge('teams', 'venues', 'venueIds[]'),
  ...['teams', 'people', 'venues', 'meets', 'athletes'].map(id => edge(id, 'documents', 'documentIds[]')),
  edge('people', 'athletes', 'athleteId'), edge('athletes', 'people', 'personId'),
  edge('meets', 'teams', 'hostTeamId'), edge('meets', 'venues', 'venueId'),
  ...['meets', 'venues', 'people', 'athletes'].map(id => edge('documents', id, ({ meets: 'meetId', venues: 'venueId', people: 'personId', athletes: 'athleteId' } as Record<string, string>)[id])),
  edge('swims', 'athletes', 'athleteId'), edge('swims', 'meets', 'meet.id', 'reference', 'Embedded meet snapshot also retains name/date; ID links to the meet when present.'),
  edge('athletes', 'public_athletes', 'same document ID', 'projection', 'Allowlisted identity projection. Keep this privacy boundary even if names are duplicated.'),
  edge('athletes', 'athletes/bests', 'bests', 'contains', 'Nested under athletes/{athleteId}; open an athlete document to inspect its bests.'),
  edge('athletes/bests', 'swims', 'swimId', 'reference', 'Selected best performance.'),
  edge('swims', 'athletes/bests', 'eligible performances', 'projection', 'Best-time refresh derives this projection from swims.'),
  edge('analytics_snapshots', 'athletes', 'athleteId'),
  edge('attendance', 'events', 'eventId', 'reference', 'Legacy session records can point to a scheduled event.'),
  edge('attendance', 'athletes', 'athleteId', 'reference', 'Typed entries identify one athlete and session.'),
  edge('attendance', 'practice_sessions', 'sessionId', 'reference', 'Typed attendance entries describe this link; it may be absent in legacy session maps.'),
  edge('import_batches', 'import_batches/changes', 'changes', 'contains', 'Open a batch document to inspect its receipts.'),
  edge('import_review_items', 'import_batches', 'batchId'),
  edge('import_state', 'import_batches', 'projection recovery / lease', 'workflow', 'Processing coordination, not a guaranteed document ID foreign key.'),
  ...['teams', 'people', 'venues', 'documents', 'athletes', 'swims', 'meets'].map(id => edge('import_batches/changes', id, 'kind + targetId', 'reference', 'Polymorphic receipt target: kind selects the collection; before/after preserve the applied change.')),
];
export function mapRelationships(id: string, ownership = true): DataRelationship[] {
  return DATA_RELATIONSHIPS.filter(edge => (edge.from === id || edge.to === id) && (ownership || edge.kind !== 'ownership'));
}
export function mapNeighborhood(id: string, ownership = true): DataNode[] {
  const ids = new Set([id, ...mapRelationships(id, ownership).flatMap(edge => [edge.from, edge.to])]);
  return DATA_NODES.filter(node => ids.has(node.id));
}
export const SIMPLIFICATION_NOTES = [

  { title: 'Meet venue and attachment duplication', nodes: ['meets', 'venues', 'documents'], text: 'Consider venueId/documentIds as the durable links. Fresh packets use document links and immutable source revisions. Embedded venue fields are meet snapshots.' },
  { title: 'Athlete and directory identity', nodes: ['athletes', 'people', 'public_athletes'], text: 'Athlete-linked people duplicate names for directory browsing. Keep athlete details canonical and define how name corrections propagate. Public profiles deliberately omit private fields; retain that boundary.' },
  { title: 'Attendance shapes and schedules', nodes: ['attendance', 'events', 'practice_sessions'], text: 'Fresh attendance uses one athlete/session entry. Previous session maps remain archived; location and coach strings are currently labels, not entity IDs.' },
  { title: 'Derived performance data', nodes: ['swims', 'athletes/bests', 'analytics_snapshots'], text: 'Swims are the source for team-record calculations; there is no separate stored record board. Best times retain their athlete subcollection projection. Document rebuild ownership and freshness for bests and analytics.' },
  { title: 'Import evidence and retention', nodes: ['import_batches', 'import_batches/changes', 'import_review_items', 'import_state'], text: 'Inline batch sources and receipt snapshots support review, recovery and guarded reversal. Accepted facts reference exact private source revisions; history survives reversal and is never automatically deleted.' },
];
