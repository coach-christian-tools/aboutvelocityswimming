'use client';


import { PREPARED_IMPORTS_PATH } from '../../lib/routes.ts';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/features/swim-resources/lib/firebase';
import type { PreparedImportSummary } from '@/features/swim-resources/lib/domain/prepared-import';

async function preparedRequest(file?: string, signal?: AbortSignal) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to view prepared imports.');
  const token = await user.getIdToken();
  return fetch(PREPARED_IMPORTS_PATH + (file ? '?file=' + encodeURIComponent(file) : ''), {
    headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', signal,
  });
}

export default function PreparedImportList({ busy, onReview }: { busy: boolean; onReview: (input: string) => Promise<void> }) {
  const [batches, setBatches] = useState<PreparedImportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [opening, setOpening] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    const unsubscribe = onAuthStateChanged(auth, async user => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      if (!user) { setBatches([]); setAvailable(false); setLoading(false); return; }
      setLoading(true); setError(null); setBatches([]); setSkipped(0);
      try {
        const response = await preparedRequest(undefined, signal);
        if (response.status === 404) { if (active && !signal.aborted) setAvailable(false); return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Prepared imports could not be loaded.');
        if (active && !signal.aborted) { setAvailable(true); setBatches(data.batches); setSkipped(data.skipped); }
      } catch (e) {
        if (active && !signal.aborted) { setAvailable(true); setError(e instanceof Error ? e.message : 'Prepared imports could not be loaded.'); }
      } finally { if (active && !signal.aborted) setLoading(false); }
    });
    return () => { active = false; controller?.abort(); unsubscribe(); };
  }, [revision]);

  if (!available) return null;
  return <section className="admin-section" aria-label="Prepared imports">
    <h3>Prepared imports</h3><p>Choose a batch to preview. You decide which changes to apply.</p>
    <button type="button" disabled={busy || loading || !!opening} onClick={() => setRevision(value => value + 1)}>Refresh prepared imports</button>
    {loading && <p role="status">Loading prepared imports…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && batches.length === 0 && <p>No prepared batches yet. You can also open a saved file below.</p>}
    {skipped > 0 && <p>{skipped} saved {skipped === 1 ? 'file needs' : 'files need'} correction before review.</p>}
    {batches.length > 0 && <div className="admin-table-scroll"><table><thead><tr><th>Batch</th><th>Observations</th><th>Held</th><th>Collected</th><th>Action</th></tr></thead><tbody>
      {batches.map(batch => <tr key={batch.file}>
        <th scope="row">{batch.label}</th><td>{batch.observations}</td><td>{batch.held}</td><td>{new Date(batch.collectedAt).toLocaleString()}</td>
        <td><button type="button" disabled={busy || !!opening} onClick={async () => {
          setOpening(batch.file); setError(null);
          try {
            const response = await preparedRequest(batch.file);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'This batch could not be opened.');
            await onReview(JSON.stringify(data.batch, null, 2));
          } catch (e) { setError(e instanceof Error ? e.message : 'This batch could not be opened.'); }
          finally { setOpening(null); }
        }}>{opening === batch.file ? 'Opening…' : 'Review ' + batch.label.toLowerCase()}</button></td>
      </tr>)}
    </tbody></table></div>}
  </section>;
}
