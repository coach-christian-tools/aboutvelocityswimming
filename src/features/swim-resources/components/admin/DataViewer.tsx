'use client';

import RecordEvidence from './RecordEvidence';
import RevisionDownload from './RevisionDownload';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { loadedAttention, fieldValue, parseViewerFilter, resolveViewerPath, viewerHref, type CollectionConfig, type ViewerFilter, type ViewerPath } from '@/features/swim-resources/lib/domain/data-viewer';
import { owningTeam, relatedQueries, relationshipPath, VELOCITY_TEAM_ID } from '@/features/swim-resources/lib/domain/entities';
import { normalizeFirestoreValue, summaryValue } from '@/features/swim-resources/lib/domain/firestore-values';
import { readViewerDocument, readViewerPage, type ViewerPage, type ViewerRecord } from '@/features/swim-resources/lib/services/data-viewer';

function errorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === 'permission-denied') return 'Firestore denied access to this data. A verified Velocity coaching account is required.';
  return error instanceof Error ? error.message : 'Data could not be loaded. Try refreshing.';
}

function ValueView({ value, field = '' }: { value: unknown; field?: string }) {
  const [open, setOpen] = useState(false);
  if (value === null || typeof value !== 'object') {
    const path = relationshipPath(field === 'meet.id' ? 'meetId' : field.split('.').at(-1)!, value);
    if (path && resolveViewerPath(path.split('/'))) return <Link href={viewerHref(path)}>{String(value)}</Link>;
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) return <a href={value} target="_blank" rel="noopener noreferrer">{value}</a>;
    return <span className="admin-value">{String(value)}</span>;
  }
  const data = value as Record<string, unknown>;
  if (data._type === 'reference' && typeof data.path === 'string') {
    const target = resolveViewerPath(data.path.split('/'));
    return target ? <Link href={viewerHref(data.path)}>{data.path}</Link> : <span>{data.path}</span>;
  }
  if (data._type === 'timestamp') return <span>{String(data.iso)} <small>({String(data.seconds)} seconds, {String(data.nanoseconds)} nanoseconds)</small></span>;
  if (data._type === 'coordinates') return <span>{String(data.latitude)}, {String(data.longitude)}</span>;
  if (data._type === 'bytes') return <details><summary>Binary data (base64)</summary><pre>{String(data.base64)}</pre></details>;
  const entries = Object.entries(value);
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{Array.isArray(value) ? `${entries.length} items` : `${entries.length} fields`}</summary>
    {open && <FieldTable entries={entries} prefix={field} arrayLinks={Array.isArray(value) && field.endsWith("Ids")} />}
  </details>;
}

function FieldTable({ entries, prefix = '', arrayLinks = false }: { entries: [string, unknown][]; prefix?: string; arrayLinks?: boolean }) {
  return <table className="admin-fields"><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>
    {entries.map(([key, value]) => <tr key={key}><th scope="row"><code>{key}</code></th><td><ValueView value={value} field={arrayLinks ? prefix : prefix ? prefix + '.' + key : key} /></td></tr>)}
  </tbody></table>;
}

function Filters({ target, initial }: { target: ViewerPath; initial: URLSearchParams }) {
  const router = useRouter();
  const [documentId, setDocumentId] = useState(initial.get('doc') ?? '');
  const [field, setField] = useState(initial.get('field') ?? '');
  const [value, setValue] = useState(initial.get('value') ?? '');
  const [error, setError] = useState<string | null>(null);
  const selected = target.config.filters.find(item => item.path === field);
  function submit(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (documentId) params.set('doc', documentId);
    else if (field) { params.set('field', field); params.set('value', value); }
    try {
      parseViewerFilter(target.config, params); setError(null);
      router.push(viewerHref(target.path) + (params.size ? '?' + params : ''));
    } catch (issue) { setError(errorMessage(issue)); }
  }
  return <form onSubmit={submit} className="admin-filters">
    <label>Exact document ID <input value={documentId} onChange={event => setDocumentId(event.target.value)} /></label>
    <label>Field <select value={field} disabled={!!documentId} onChange={event => { setField(event.target.value); setValue(''); }}>
      <option value="">No field filter</option>{target.config.filters.map(item => <option key={item.path} value={item.path}>{item.label} ({item.type})</option>)}
    </select></label>
    <label>Equals {selected?.type === 'boolean' ? <select value={value} disabled={!!documentId || !field} onChange={event => setValue(event.target.value)}><option value="">Choose…</option><option value="true">true</option><option value="false">false</option></select> : <input type={selected?.type === 'number' ? 'number' : 'text'} step="any" value={value} disabled={!!documentId || !field} onChange={event => setValue(event.target.value)} />}</label>
    <button type="submit">Apply filter</button><Link href={viewerHref(target.path)}>Clear filters</Link>
    {error && <p role="alert">{error}</p>}
  </form>;
}

function CollectionData({ target, filter, search }: { target: ViewerPath; filter: ViewerFilter; search: string }) {
  const params = useSearchParams();
  const [cursors, setCursors] = useState<(QueryDocumentSnapshot | null)[]>([null]);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<ViewerPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const cursor = cursors[page];
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError(null); setResult(null);
      try { const next = await readViewerPage(target.path, filter, cursor); if (active) setResult(next); }
      catch (issue) { if (active) setError(errorMessage(issue)); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [target.path, filter, cursor, revision]);
  const attention = params.get('attention') === 'true';
  const records = useMemo(() => (result?.records ?? []).filter(record => !attention || loadedAttention(record.data)).filter(record => !search || `${record.id} ${JSON.stringify(normalizeFirestoreValue(record.data))}`.toLowerCase().includes(search.toLowerCase())), [result, search, attention]);
  return <>
    <div className="admin-controls">
      <label>Search loaded rows <input type="search" value={search} onChange={event => {
        const next = new URLSearchParams(params.toString());
        if (event.target.value) next.set('search', event.target.value); else next.delete('search');
        window.history.replaceState(null, '', viewerHref(target.path) + (next.size ? '?' + next : ''));
      }} /></label>
      {target.path === 'record_provenance' && <label><input type="checkbox" checked={attention} onChange={event => { const next = new URLSearchParams(params.toString()); if (event.target.checked) next.set('attention', 'true'); else next.delete('attention'); window.history.replaceState(null, '', viewerHref(target.path) + (next.size ? '?' + next : '')); }} />Needs attention within loaded rows (includes due fields)</label>}
      <button disabled={loading} onClick={() => { setCursors([null]); setPage(0); setRevision(value => value + 1); }}>Refresh</button>
    </div>
    {loading && <p role="status">Loading documents…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && result && <>
      <p role="status">Page {page + 1} · {records.length} shown / {result.records.length} loaded · up to 100 documents per page</p>
      {result.records.length === 0 ? <p>{filter.documentId ? 'Document not found.' : page ? 'No more documents. Use Previous to return.' : 'No documents match this collection query.'}</p> : records.length === 0 ? <p>No loaded rows match your search.</p> : <div className="admin-table-scroll"><CollectionTable records={records} configuration={target.config} /></div>}
      <div className="admin-controls" aria-label="Pagination">
        <button disabled={page === 0 || loading} onClick={() => setPage(value => value - 1)}>Previous</button>
        <button disabled={!result.hasNext || loading} onClick={() => {
          setCursors(previous => [...previous.slice(0, page + 1), result.cursor]); setPage(value => value + 1);
        }}>Next</button>
      </div>
    </>}
  </>;
}

function CollectionTable({ records, configuration }: { records: ViewerRecord[]; configuration: CollectionConfig }) {
  return <table><thead><tr><th>Document ID</th>{configuration.columns.map(item => <th key={item.path}>{item.label}</th>)}</tr></thead><tbody>
    {records.map(record => <tr key={record.path}><td><Link href={viewerHref(record.path)}>{record.id}</Link></td>{configuration.columns.map(item => {
      const value = fieldValue(record.data, item.path);
      const owner = item.path === 'teamId' ? owningTeam(configuration.id, record.data) : null;
      if (owner?.assumed) return <td key={item.path}><Link href={viewerHref(`teams/${owner.id}`)}>Velocity Swimming (default)</Link></td>;
      const path = relationshipPath(item.path === 'meet.id' ? 'meetId' : item.path, value);
      return <td key={item.path}>{path ? <Link href={viewerHref(path)}>{String(value)}</Link> : typeof value === 'string' && /^https?:\/\//i.test(value) ? <a href={value} target="_blank" rel="noopener noreferrer">{value}</a> : summaryValue(value)}</td>;
    })}</tr>)}
  </tbody></table>;
}

function CollectionView({ target }: { target: ViewerPath }) {
  const params = useSearchParams();
  const documentId = params.get('doc');
  const field = params.get('field');
  const value = params.get('value');
  const queryKey = JSON.stringify([documentId, field, value]);
  const parsed = useMemo(() => {
    const selected = new URLSearchParams();
    if (documentId !== null) selected.set('doc', documentId);
    if (field !== null) selected.set('field', field);
    if (value !== null) selected.set('value', value);
    try { return { filter: parseViewerFilter(target.config, selected), error: null }; }
    catch (issue) { return { filter: null, error: errorMessage(issue) }; }
  }, [target.config, documentId, field, value]);
  return <>
    {owningTeam(target.config.id, {}) && <p>Records without a team ID belong to Velocity Swimming by default. Team filters match stored IDs only.</p>}
    <Filters key={queryKey} target={target} initial={new URLSearchParams(params.toString())} />
    {parsed.error ? <p role="alert">{parsed.error}</p> : parsed.filter && <CollectionData key={target.path + queryKey} target={target} filter={parsed.filter} search={params.get('search') ?? ''} />}
  </>;
}

function Relationships({ target, data }: { target: ViewerPath; data: Record<string, unknown> }) {
  const collection = target.path.split('/')[0], id = target.path.split('/')[1];
  const owner = owningTeam(collection, data);
  const queries = relatedQueries(collection, id);
  return <section className="admin-section" aria-label="Relationships">
    <h2>Relationships</h2>
    {owner && <p>Owning team: <Link href={viewerHref(`teams/${owner.id}`)}>{owner.id === VELOCITY_TEAM_ID ? 'Velocity Swimming' : owner.id}</Link>{owner.assumed && ' (default; no stored team ID)'}</p>}
    <nav className="admin-controls" aria-label="Related data">{queries.map(item => <Link key={item.collection + item.field} href={viewerHref(item.collection) + '?' + new URLSearchParams({ field: item.field, value: item.value })}>{item.label}</Link>)}</nav>
    {collection === 'teams' && <p>These links match stored team IDs. Legacy records default to Velocity Swimming in the viewer; backfill their team IDs to include them in team queries.</p>}
  </section>;
}

function DocumentView({ target }: { target: ViewerPath }) {
  const [revision, setRevision] = useState(0);
  const [record, setRecord] = useState<ViewerRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rawOpen, setRawOpen] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError(null); setRecord(null);
      try { const next = await readViewerDocument(target.path); if (active) setRecord(next); }
      catch (issue) { if (active) setError(errorMessage(issue)); }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [target.path, revision]);
  const data = useMemo(() => record ? normalizeFirestoreValue(record.data) as Record<string, unknown> : null, [record]);
  return <>
    <div className="admin-controls"><Link href={viewerHref(target.collectionPath)}>Back to collection</Link><button disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh</button></div>
    {loading && <p role="status">Loading document…</p>}{error && <p role="alert">{error}</p>}
    {!loading && !error && !record && <><p role="status">Document not found.</p>{target.path === `teams/${VELOCITY_TEAM_ID}` && <><p>Velocity Swimming is the configured default owner. Its team document has not been stored yet.</p><Relationships target={target} data={{}} /></>}</>}
    {record && data && <>
      <p>Document ID: <code>{record.id}</code></p>
      <Relationships target={target} data={data} />
      {!['sources', 'source_bindings', 'record_provenance'].includes(target.path.split('/')[0]) && <RecordEvidence path={target.path} revision={revision} />}
      {typeof data.sourceId === 'string' && typeof (data.currentRevisionId ?? data.revisionId) === 'string' && <p><Link href={viewerHref(`sources/${data.sourceId}/revisions/${data.currentRevisionId ?? data.revisionId}`)}>Exact archived revision</Link></p>}
      {target.path.split('/')[0] === 'sources' && target.path.split('/')[2] === 'revisions' && <RevisionDownload key={target.path} sourceId={target.path.split('/')[1]} revisionId={record.id} />}
      <FieldTable entries={Object.entries(data)} />
      {target.config.children && <nav className="admin-controls" aria-label="Subcollections">{target.config.children.map(child => <Link key={child.id} href={viewerHref(`${target.path}/${child.id}`)}>{child.label}</Link>)}</nav>}
      <details onToggle={event => setRawOpen(event.currentTarget.open)}><summary>Raw JSON</summary>{rawOpen && <pre>{JSON.stringify(data, null, 2)}</pre>}</details>
    </>}
  </>;
}

export default function DataViewer({ target }: { target: ViewerPath }) {
  // Resolve locally so URL-only navigation does not recreate serialized config/filter objects.
  const stableTarget = useMemo(() => resolveViewerPath(target.path.split('/'))!, [target.path]);
  return <>
    <h1>{target.config.label}{target.kind === 'document' ? ' document' : ''}</h1>
    <p>Firestore path: <code>{target.path}</code> · read-only</p>
    {target.kind === 'collection' ? <CollectionView key={target.path} target={stableTarget} /> : <DocumentView key={target.path} target={stableTarget} />}
  </>;
}
