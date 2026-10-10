'use client';

import ReviewQueue from "@/components/collection/ReviewQueue";
import { useMemo, useState } from 'react';
import { DATASET_ID } from '@/features/swim-resources/lib/backend';
import BatchImportPanel from '@/features/swim-resources/components/admin/BatchImportPanel';

/** Legacy HTML remains useful as a capture, but a PB list is not a race history. */
function HtmlObservations() {
  const [html, setHtml] = useState('');
  const observations = useMemo(() => {
    if (!html.trim() || typeof DOMParser === 'undefined') return [];
    const document = new DOMParser().parseFromString(html, 'text/html');
    return Array.from(document.querySelectorAll('#js-swimmer-profile-times-container tbody tr')).flatMap(row => {
      const cells = Array.from(row.querySelectorAll('td')).map(cell => cell.textContent?.trim() ?? '');
      return cells.length >= 5 && cells[0] && cells[1] ? [{ event: cells[0], time: cells[1], meet: cells[3], date: cells[4] }] : [];
    });
  }, [html]);
  return <section className="space-y-4 max-w-5xl">
    <h2 className="text-xl font-semibold">Inspect SwimCloud HTML</h2>
    <p className="text-sm text-text-secondary">Personal-best snapshots can help identify gaps. To import races, prepare a structured batch with verified athlete identity, course, meet date, round, relay status, and official result status.</p>
    <label className="block space-y-2 text-sm"><span>Saved HTML</span><textarea aria-label="Saved SwimCloud HTML" value={html} onChange={event => setHtml(event.target.value)} className="w-full min-h-40 bg-bg border border-border p-3 font-mono text-xs" /></label>
    {html && <p role="status" className="text-sm">{observations.length} PB observations found. These observations have not been added to race histories.</p>}
    {observations.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Event', 'Time', 'Meet', 'Date', 'Review'].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{observations.map((row, index) => <tr className="border-t border-border" key={index}><td className="p-2">{row.event}</td><td className="p-2">{row.time}</td><td className="p-2">{row.meet}</td><td className="p-2">{row.date}</td><td className="p-2 text-amber-700">Needs official race context</td></tr>)}</tbody></table></div>}
  </section>;
}

export default function ImportPage() {
  const [mode, setMode] = useState<'collected' | 'batch' | 'html'>('collected');
  return <div className="admin-import">
    <h1 >Import</h1>
    <div className="admin-controls" role="group" aria-label="Import options">
      <button aria-pressed={mode === 'collected'} onClick={() => setMode('collected')}>Collected changes</button>
      <button aria-pressed={mode === 'batch'}  onClick={() => setMode('batch')}>Structured batch</button>
      <button aria-pressed={mode === 'html'}  onClick={() => setMode('html')}>Inspect HTML</button>
    </div>
    {mode === 'collected' ? <ReviewQueue /> : mode === 'batch' ? DATASET_ID === 'velocity-v2' ? <BatchImportPanel /> : <p>Fresh imports require velocity-v2. Switch only after the archive and new dataset pass release verification.</p> : <HtmlObservations />}
  </div>;
}
