'use client';

import { useRef, useState } from 'react';
import { parseImportBatch } from '@/features/swim-resources/lib/domain/import-batch';
import type { ImportPreviewRow, JsonRecord } from '@/features/swim-resources/lib/domain/import-batch';
import { isCalendarDate } from '@/features/swim-resources/lib/domain/date';
import { acknowledgeImportItem, importProjectionsPending, applyImportBatch, loadImportReceipts, previewImportBatch, reverseImportChanges, retryImportProjections } from '@/features/swim-resources/lib/services/import-batches';
import type { ImportPreview, ImportReceipt } from '@/features/swim-resources/lib/services/import-batches';
import PreparedImportList from './PreparedImportList';

const fieldValue = (data: JsonRecord | null, path: string): string => {
  let value: unknown = data;
  for (const key of path.split('.')) value = value && typeof value === 'object' ? (value as JsonRecord)[key] : undefined;
  if (value === undefined) return '—';
  if (path === 'timeMs' && typeof value === 'number') return (value / 1000).toFixed(2) + ' seconds';
  if (path.endsWith('assignedAt') && typeof value === 'string') return new Date(isCalendarDate(value) ? value + 'T12:00:00' : value).toLocaleDateString();
  return typeof value === 'string' ? value : JSON.stringify(value);
};
const fieldLabel = (field: string) => ({ 'currentGroup.name': 'Training group', 'currentGroup.id': 'Group ID', 'currentGroup.assignedAt': 'Group since', 'dates.startDate': 'Start date', 'dates.endDate': 'End date', 'dates.entryDeadline': 'Entry deadline', 'venue.course': 'Pool course', timeMs: 'Time', timeDisplay: 'Displayed time', dob: 'Date of birth', status: 'Status', swimcloudId: 'SwimCloud identity', teamUnifyId: 'TeamUnify identity' })[field] ?? field.replaceAll('.', ' / ').replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
function FieldChanges({ row }: { row: ImportPreviewRow }) {
  if (!row.fields.length) return null;
  const table = <div className="overflow-x-auto mt-3"><table className="w-full text-xs text-left"><thead><tr className="text-text-secondary"><th className="pb-2 pr-3">Field</th><th className="pb-2 pr-3">Current</th><th className="pb-2">Proposed</th></tr></thead><tbody>{row.fields.map(field => <tr key={field} className="border-t border-border"><td className="py-2 pr-3 font-medium align-top">{fieldLabel(field)}</td><td className="py-2 pr-3 break-all max-w-xs align-top">{fieldValue(row.comparisonBefore ?? row.before, field)}</td><td className="py-2 break-all max-w-xs align-top">{fieldValue(row.after, field)}</td></tr>)}</tbody></table></div>;
  if (row.row.kind !== 'swim' || row.status !== 'add') return table;
  const round = { F: 'Final', P: 'Preliminary', S: 'Swim-off', TT: 'Time trial' }[String(row.after?.round)];
  return <div className="mt-2 text-sm"><p>{fieldValue(row.after, 'timeDisplay')} · {round} · {fieldValue(row.after, 'meet.name')} · {fieldValue(row.after, 'status')}</p><details className="mt-2"><summary className="cursor-pointer text-xs text-text-secondary">Full race details</summary>{table}</details></div>;
}
export default function BatchImportPanel() {
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingBatchId, setPendingBatchId] = useState('');
  const reviewStarted = useRef(0);
  const [showReviewed, setShowReviewed] = useState(false);
  const [receiptBatchId, setReceiptBatchId] = useState('');
  const [receipts, setReceipts] = useState<ImportReceipt[]>([]);
  const [reverseSelection, setReverseSelection] = useState<string[]>([]);
  const [confirmReverse, setConfirmReverse] = useState(false);
  async function run(work: () => Promise<void>) {
    setBusy(true); setError(null); setMessage(null);
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  function changeInput(value: string) {
    setInput(value); setPreview(null); setSelected([]); setError(null); setMessage(null);
  }
  function toggle(id: string, values: string[], setter: (next: string[]) => void) {
    setter(values.includes(id) ? values.filter(value => value !== id) : [...values, id]);
  }
  async function buildPreview(value: string) {
    const next = await previewImportBatch(value);
    let rows: ImportReceipt[] = [], pending = false;
    if (next.reviewHistoryAvailable) [rows, pending] = await Promise.all([loadImportReceipts(next.batch.id), importProjectionsPending(next.batch.id)]);
    setPreview(next); setSelected([]); setReceiptBatchId(next.batch.id); setReceipts(rows); setReverseSelection([]); setConfirmReverse(false); setPendingBatchId(rows.length && pending ? next.batch.id : ''); reviewStarted.current = Date.now();
  }
  const downloadReceipts = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ batchId: receiptBatchId, receipts }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'import-receipts-' + receiptBatchId + '.json'; link.click(); URL.revokeObjectURL(url);
  };
  return <section aria-label="Structured import review">
    <h2>Review collected data</h2>
    <p>Open a batch prepared by Codex. Check its sources and changes, then choose what to import.</p>
    <PreparedImportList busy={busy} onReview={value => run(async () => {
      parseImportBatch(value); changeInput(value); await buildPreview(value);
    })} />
    <details open={!preview}><summary>Import batch JSON</summary>
      <textarea aria-label="Import batch JSON" rows={8} className="w-full font-mono" value={input} disabled={busy} onChange={event => changeInput(event.target.value)} placeholder="Paste an ImportBatch JSON file here." />
    </details>
    <div className="admin-controls">
      <label>Open JSON file <input type="file" accept=".json,application/json" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file) return;
        void run(async () => {
          if (file.size > 4 * 1024 * 1024) throw new Error('Import files must be 4 MB or smaller.');
          const value = await file.text(); parseImportBatch(value); changeInput(value);
        });
      }} /></label>
      <button disabled={busy || !input.trim()} onClick={() => void run(async () => { await buildPreview(input); })}>Preview changes</button>
    </div>
    <p>Preview does not write to your database.</p>
    {busy && <p role="status">Working…</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {preview && <>
      {!preview.reviewHistoryAvailable && <p role="alert">Review history is unavailable. An administrator must enable import permissions before changes can be applied.</p>}
      <section className="admin-section">
        <h3>Sources · {new Date(preview.batch.collectedAt).toLocaleString()}</h3>
        <div className="admin-table-scroll"><table><thead><tr><th>Source</th><th>Coverage</th><th>Scope</th><th>Reference</th><th>Checked</th></tr></thead><tbody>
          {preview.batch.sources.map(source => <tr key={source.id}>
            <th scope="row">{source.name}</th><td>{source.coverage.replace('_', ' ')}</td><td>{source.scope}{source.notes && <p>{source.notes}</p>}</td>
            <td>{/^(https?:\/\/)/.test(source.reference) ? <a href={source.reference} target="_blank" rel="noopener noreferrer">Open source</a> : source.reference}</td>
            <td>{new Date(source.collectedAt).toLocaleString()}</td>
          </tr>)}
        </tbody></table></div>
        {preview.batch.unresolved.some(issue => showReviewed || !preview.reviewedIssues.includes(issue.id)) && <>
          <h3>Needs attention</h3>
          <ul>{preview.batch.unresolved.filter(issue => showReviewed || !preview.reviewedIssues.includes(issue.id)).map(issue => <li key={issue.id}>{issue.message} <button disabled={busy || !preview.reviewHistoryAvailable || preview.reviewedIssues.includes(issue.id)} onClick={() => void run(async () => { await acknowledgeImportItem(preview, issue.id); setSelected([]); setPreview(await previewImportBatch(input)); })}>Reviewed · keep current</button></li>)}</ul>
        </>}
      </section>
      <p>{preview.rows.length} observations · {preview.rows.filter(row => ['add', 'change'].includes(row.status)).length} changes · {preview.rows.filter(row => row.status === 'checked').length} unchanged checks · {preview.rows.filter(row => row.status === 'conflict').length} conflicts</p>
      <div className="admin-controls">
        <button disabled={busy} onClick={() => setSelected(preview.rows.filter(row => ['add', 'change', 'checked'].includes(row.status)).slice(0, 25).map(row => row.row.id))}>Select up to 25 changes / checks</button>
        <button disabled={busy || !selected.length} onClick={() => setSelected([])}>Clear selection</button>
      </div>
      {receipts.length > 0 && <p role="status">{receipts.filter(receipt => receipt.state === 'applied').length} changes already imported from this batch.{receipts.some(receipt => receipt.state === 'reversed') ? ' Some changes were reversed; check the receipts below.' : ''}</p>}
      <label><input type="checkbox" checked={showReviewed} onChange={event => setShowReviewed(event.target.checked)} />Show unchanged checks and previously reviewed observations</label>
      <div className="admin-table-scroll"><table><thead><tr><th>Select</th><th>Observation</th><th>Kind</th><th>Status</th><th>Changes and evidence</th></tr></thead><tbody>
        {preview.rows.filter(row => showReviewed || (row.status !== 'checked' && !row.reviewed)).map(row => <tr key={row.row.id}>
          <td><input type="checkbox" aria-label={'Select ' + row.label} checked={selected.includes(row.row.id)} disabled={busy || !['add', 'change', 'checked'].includes(row.status) || (selected.length >= 25 && !selected.includes(row.row.id))} onChange={() => toggle(row.row.id, selected, setSelected)} /></td>
          <th scope="row">{row.label}</th><td>{row.row.kind}</td><td>{row.status}</td><td>
            {row.reason && <p>{row.reason}</p>}
            {['conflict', 'skipped'].includes(row.status) && <button disabled={busy || !preview.reviewHistoryAvailable || row.reviewed} onClick={() => void run(async () => { await acknowledgeImportItem(preview, row.row.id); setSelected([]); setPreview(await previewImportBatch(input)); })}>Reviewed · keep current</button>}
            <FieldChanges row={row} />
            <p>Checked fields: {row.row.evidence.flatMap(e => e.fields).join(', ')}</p>
            <p>Sources: {row.row.sourceIds.map(id => preview.batch.sources.find(source => source.id === id)?.name).join(', ')}</p>
          </td>
        </tr>)}
      </tbody></table></div>
      <div className="admin-controls">
        <p>{selected.length} selected · changes are checked again before writing</p>
        <button disabled={busy || !preview.reviewHistoryAvailable || !selected.length} onClick={() => void run(async () => {
          const result = await applyImportBatch(preview, selected, (Date.now() - reviewStarted.current) / 1000); reviewStarted.current = Date.now(); setPendingBatchId(result.projectionsPending ? preview.batch.id : ''); setSelected([]);
          setMessage(result.applied + ' changes applied. ' + result.alreadyApplied + ' were already imported.' + (result.projectionsPending ? ' Best times still need a refresh.' : ' Best times are current.'));
          setReceipts(await loadImportReceipts(preview.batch.id)); setPreview(await previewImportBatch(input));
        })}>Apply {selected.length} selected changes</button>
      </div>
    </>}
    {pendingBatchId && <button disabled={busy} onClick={() => void run(async () => { await retryImportProjections(pendingBatchId); const pending = await importProjectionsPending(pendingBatchId); setPendingBatchId(pending ? pendingBatchId : ''); setMessage(pending ? 'Another change arrived during refresh. Retry again.' : 'Best times refreshed.'); })}>Retry best times refresh</button>}
    <section className="admin-section">
      <h3>Import receipts and reversal</h3>
      <p>Receipts keep the previous values. Reversal stops if a coach has changed a record since the import. New athletes and meets require reviewed deletion to protect coaching references.</p>
      <div className="admin-controls"><label>Receipt batch ID <input value={receiptBatchId} disabled={busy} onChange={event => { setReceiptBatchId(event.target.value); setReceipts([]); setReverseSelection([]); setConfirmReverse(false); }} /></label>
        <button disabled={busy || !/^[a-zA-Z0-9_-]{1,128}$/.test(receiptBatchId)} onClick={() => void run(async () => { const [rows, pending] = await Promise.all([loadImportReceipts(receiptBatchId), importProjectionsPending(receiptBatchId)]); setReceipts(rows); setPendingBatchId(pending ? receiptBatchId : ''); setReverseSelection([]); })}>Load receipts</button>
        {receipts.length > 0 && <button onClick={downloadReceipts}>Download receipts</button>}
      </div>
      {receipts.length > 0 && <table><thead><tr><th>Select</th><th>Kind</th><th>Target ID</th><th>State</th></tr></thead><tbody>
        {receipts.map(receipt => <tr key={receipt.rowId}><td><input type="checkbox" aria-label={'Reverse ' + receipt.targetId} checked={reverseSelection.includes(receipt.rowId)} disabled={busy || receipt.state === 'reversed'} onChange={() => { toggle(receipt.rowId, reverseSelection, setReverseSelection); setConfirmReverse(false); }} /></td><td>{receipt.kind}</td><td>{receipt.targetId}</td><td>{receipt.state}</td></tr>)}
      </tbody></table>}
      {reverseSelection.length > 0 && <>
        <label><input type="checkbox" checked={confirmReverse} onChange={event => setConfirmReverse(event.target.checked)} />Restore previous values for these {reverseSelection.length} records</label>
        <button disabled={busy || !confirmReverse} onClick={() => void run(async () => {
          const result = await reverseImportChanges(receiptBatchId, reverseSelection); setPendingBatchId(result.projectionsPending ? receiptBatchId : '');
          setMessage(result.reversed + ' changes reversed.' + (result.projectionsPending ? ' Best times need a refresh.' : ' Best times refreshed.'));
          const [rows, pending] = await Promise.all([loadImportReceipts(receiptBatchId), importProjectionsPending(receiptBatchId)]); setReceipts(rows); setPendingBatchId(pending ? receiptBatchId : ''); setReverseSelection([]); setConfirmReverse(false); setPreview(null);
        })}>Reverse selected changes</button>
      </>}
    </section>
  </section>;
}
