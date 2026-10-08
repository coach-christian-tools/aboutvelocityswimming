import { isoTime, type EvidenceSource, type Provenance } from './evidence';
import { resolveViewerPath, VIEWER_COLLECTIONS, type ViewerFilter } from './data-viewer';

export const MAINTENANCE_ISSUES = ['all', 'overdue', 'failed', 'missing', 'disagreement', 'question'] as const;
export type MaintenanceIssueKind = Exclude<typeof MAINTENANCE_ISSUES[number], 'all'>;
export const MAINTENANCE_LABELS: Record<typeof MAINTENANCE_ISSUES[number], string> = {
  all: 'All attention reasons', overdue: 'Overdue checks', failed: 'Failed checks', missing: 'Missing evidence', disagreement: 'Unresolved disagreements', question: 'Open review questions',
};
export interface MaintenanceIssue { kind: MaintenanceIssueKind; detail: string }
export interface MaintenanceRow {
  path: string; recordPath?: string; name: string; checkedAt: string | null; changedAt: string | null;
  dueAt: string | null; issues: MaintenanceIssue[];
}
const DAY = 86400000;
const dueDate = (at: unknown, interval: unknown): number | null => isoTime(at) && Number.isInteger(interval) && Number(interval) >= 1 && Number(interval) <= 3650 ? Date.parse(at) + Number(interval) * DAY : null;

/** Computed only from the loaded page. Retrieval alone is not verification. */
export function maintenanceRecord(path: string, data: Provenance, now: number): MaintenanceRow {
  const issues: MaintenanceIssue[] = [], due: number[] = [];
  const missing = new Set((data.requiredFields ?? []).filter(field => !data.accepted?.[field]));
  if (!data.retired) {
    for (const [field, accepted] of Object.entries(data.accepted ?? {})) {
      // User declarations and projections have no external check schedule.
      if (accepted.origin === 'manual' || (!accepted.origin && data.origin === 'manual')) continue;
      const date = dueDate(accepted.confirmedBy?.checkedAt ?? accepted.checkedAt, accepted.confirmedBy?.intervalDays ?? accepted.intervalDays);
      if (date === null) missing.add(field);
      else { due.push(date); if (date <= now) issues.push({ kind: 'overdue', detail: field }); }
    }
    if (data.origin === 'external' && !Object.keys(data.accepted ?? {}).length) issues.push({ kind: 'missing', detail: 'No accepted field evidence' });
    if (missing.size) issues.push({ kind: 'missing', detail: [...missing].join(', ') });
    for (const [source, error] of Object.entries(data.failures ?? {})) issues.push({ kind: 'failed', detail: `${source}: ${error}` });
    if (data.openDisagreements?.length) issues.push({ kind: 'disagreement', detail: `${data.openDisagreements.length} open` });
    for (const question of data.reviewQuestions ?? []) if (question.status === 'open') issues.push({ kind: 'question', detail: question.question });
  }
  return { path, recordPath: resolveViewerPath(data.targetPath?.split('/') ?? [])?.kind === 'document' ? data.targetPath : undefined, name: data.targetPath ?? path, checkedAt: data.lastSuccessfulCheckAt ?? null, changedAt: data.lastChangedAt ?? null, dueAt: due.length ? new Date(Math.min(...due)).toISOString() : null, issues };
}
export function maintenanceSource(path: string, data: EvidenceSource & { lastError?: string | null }, now: number): MaintenanceRow {
  const issues: MaintenanceIssue[] = [];
  const due = dueDate(data.lastSuccessfulCheckAt, data.intervalDays);
  if (data.enabled && data.kind !== 'manual') {
    if (data.lastError) issues.push({ kind: 'failed', detail: data.lastError });
    if (due === null) issues.push({ kind: 'missing', detail: 'No source-scope verification recorded; individual records may have accepted evidence. An archived retrieval alone does not verify facts' });
    else if (due <= now) issues.push({ kind: 'overdue', detail: 'Source scope due for verification' });
  }
  return { path, name: data.name ?? path, checkedAt: data.lastSuccessfulCheckAt ?? null, changedAt: null, dueAt: due === null ? null : new Date(due).toISOString(), issues };
}
export function maintenanceSelection(params: URLSearchParams) {
  const view = params.get('view') ?? 'records', issue = params.get('issue') ?? 'all', collection = params.get('collection') ?? '';
  if (!['records', 'sources'].includes(view) || !(MAINTENANCE_ISSUES as readonly string[]).includes(issue)) throw new Error('Unsupported maintenance filter.');
  if (collection && (view !== 'records' || !VIEWER_COLLECTIONS.some(item => item.id === collection))) throw new Error('Choose a registered record collection.');
  return { view: view as 'records' | 'sources', issue: issue as typeof MAINTENANCE_ISSUES[number], collection, filter: (collection ? { field: 'targetCollection', value: collection } : {}) as ViewerFilter, search: params.get('search') ?? '', key: JSON.stringify([view, collection, issue]) };
}
export function visibleMaintenance(rows: MaintenanceRow[], issue: typeof MAINTENANCE_ISSUES[number], search: string) {
  return rows.filter(row => row.issues.some(reason => issue === 'all' || reason.kind === issue)).filter(row => !search || `${row.name} ${row.path} ${row.issues.map(reason => reason.detail).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
}
