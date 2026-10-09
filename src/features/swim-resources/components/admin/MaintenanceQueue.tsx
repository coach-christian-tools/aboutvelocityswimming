'use client';


import { swimResourcesPath } from '../../lib/routes.ts';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { QueryDocumentSnapshot } from '@/lib/data';
import { isoTime, type EvidenceSource, type Provenance } from '@/features/swim-resources/lib/domain/evidence';
import { VIEWER_COLLECTIONS, viewerHref } from '@/features/swim-resources/lib/domain/data-viewer';
import { maintenanceRecord, maintenanceSource, maintenanceSelection, visibleMaintenance, MAINTENANCE_ISSUES, MAINTENANCE_LABELS, type MaintenanceRow } from '@/features/swim-resources/lib/domain/maintenance';
import { readViewerPage, type ViewerPage } from '@/features/swim-resources/lib/services/data-viewer';

function failureText(error: unknown) {
  return (error as { code?: string })?.code === 'permission-denied' ? 'Firestore denied access. A verified Velocity coaching account is required.' : error instanceof Error ? error.message : 'Maintenance data could not be loaded. Refresh to try again.';
}
type Selection = ReturnType<typeof maintenanceSelection>;
function CheckDate({ value, empty }: { value: string | null; empty: string }) {
  if (!value) return empty;
  if (!isoTime(value)) return value;
  const utc = new Date(value).toISOString();
  return <time dateTime={value} title={value}>{utc.slice(0, 10)}<br />{utc.slice(11, 19)} UTC</time>;
}
function QueuePage({ selected }: { selected: Selection }) {
  const [cursors, setCursors] = useState<(QueryDocumentSnapshot | null)[]>([null]);
  const [page, setPage] = useState(0), [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ page: ViewerPage; rows: MaintenanceRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(true);
  const cursor = cursors[page], collection = selected.view === 'sources' ? 'sources' : 'record_provenance';
  const recordCollection = selected.collection;
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError(null); setResult(null);
      try {
        const next = await readViewerPage(collection, recordCollection ? { field: 'targetCollection', value: recordCollection } : {}, cursor);
        const now = Date.now();
        const rows = next.records.map(record => collection === 'sources' ? maintenanceSource(record.path, record.data as EvidenceSource, now) : maintenanceRecord(record.path, record.data as Provenance, now));
        if (active) setResult({ page: next, rows });
      } catch (issue) { if (active) setError(failureText(issue)); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [collection, recordCollection, cursor, revision]);
  const rows = visibleMaintenance(result?.rows ?? [], selected.issue, selected.search);
  return <>
    <div className="admin-controls"><button disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh</button><Link href={viewerHref(collection) + (recordCollection ? '?' + new URLSearchParams({ field: 'targetCollection', value: recordCollection }) : '')}>Open collection viewer</Link><Link href={swimResourcesPath("/admin/import")}>Review prepared imports</Link></div>
    {loading && <p role="status">Loading maintenance data…</p>}
    {error && <p role="alert">{error}</p>}
    {result && <>
      <p role="status">Page {page + 1} · {rows.length} shown / {result.page.records.length} loaded · up to 100 documents per page</p>
      {result.page.records.length === 0 ? <p>{page ? 'No more documents. Use Previous to return.' : 'No documents match this collection query.'}</p> : rows.length === 0 ? <p>No attention reasons match within this loaded page. Other pages have not been checked.</p> : <div className="admin-table-scroll" role="region" aria-label="Maintenance table, scroll horizontally for all columns" tabIndex={0}><table className="admin-maintenance-table">
        <caption>Attention reasons within the loaded page</caption>
        <thead><tr><th scope="col">{selected.view === 'sources' ? 'Source' : 'Record'}</th><th scope="col">Attention</th><th scope="col">Verified</th>{selected.view === 'records' && <th scope="col">Facts changed</th>}<th scope="col">Next check</th><th scope="col">Evidence</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.path}>
          <th scope="row" className="admin-maintenance-record"><Link href={viewerHref(row.recordPath ?? row.path)}>{row.name}</Link></th>
          <td className="admin-maintenance-attention"><ul>{row.issues.map((issue, index) => <li key={index}>{MAINTENANCE_LABELS[issue.kind]}: {issue.detail}</li>)}</ul></td>
          <td className="admin-maintenance-date"><CheckDate value={row.checkedAt} empty="No external verification recorded" /></td>{selected.view === 'records' && <td className="admin-maintenance-date"><CheckDate value={row.changedAt} empty="Not recorded" /></td>}<td className="admin-maintenance-date"><CheckDate value={row.dueAt} empty="Not scheduled" /></td>
          <td className="admin-maintenance-evidence"><Link href={viewerHref(row.path)}>{selected.view === 'records' ? 'Provenance and questions' : 'Source details'}</Link><br /><Link href={viewerHref(row.path + (selected.view === 'records' ? '/events' : '/checks'))}>History</Link>{selected.view === 'records' && <><br /><Link href={viewerHref(row.path + '/disagreements')}>Disagreements</Link></>}</td>
        </tr>)}</tbody>
      </table></div>}
      <div className="admin-controls" aria-label="Maintenance pagination"><button disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><button disabled={loading || !result.page.hasNext} onClick={() => { setCursors(previous => [...previous.slice(0, page + 1), result.page.cursor]); setPage(value => value + 1); }}>Next</button></div>
    </>}
  </>;
}
export default function MaintenanceQueue() {
  const params = useSearchParams(), router = useRouter();
  let selected: Selection;
  try { selected = maintenanceSelection(new URLSearchParams(params.toString())); }
  catch (error) { return <><h1>Maintenance</h1><p role="alert">{failureText(error)}</p><Link href={swimResourcesPath("/admin/maintenance")}>Reset filters</Link></>; }
  function select(name: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value); else next.delete(name);
    if (name === 'view') next.delete('collection');
    router.push(swimResourcesPath("/admin/maintenance") + (next.size ? '?' + next : ''));
  }
  return <>
    <h1>Maintenance</h1>
    <p>Read-only review of private evidence. Verification dates and fact-change dates are separate.</p>
    <p>Attention and search apply only to the loaded page. Use Next to review more documents. Refresh reloads the current page and recalculates due dates.</p>
    <div className="admin-filters">
      <label>View <select value={selected.view} onChange={event => select('view', event.target.value)}><option value="records">Record evidence</option><option value="sources">Sources</option></select></label>
      {selected.view === 'records' && <label>Record collection <select value={selected.collection} onChange={event => select('collection', event.target.value)}><option value="">All registered records</option>{VIEWER_COLLECTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      <label>Attention within loaded rows <select value={selected.issue} onChange={event => select('issue', event.target.value)}>{MAINTENANCE_ISSUES.map(issue => <option key={issue} value={issue}>{MAINTENANCE_LABELS[issue]}</option>)}</select></label>
      <label>Search loaded rows <input type="search" value={selected.search} onChange={event => { const next = new URLSearchParams(params.toString()); if (event.target.value) next.set('search', event.target.value); else next.delete('search'); window.history.replaceState(null, '', swimResourcesPath("/admin/maintenance") + (next.size ? '?' + next : '')); }} /></label>
    </div>
    <QueuePage key={selected.key} selected={selected} />
  </>;
}
