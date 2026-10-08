'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { evidenceKey, freshness, type Provenance } from '@/features/swim-resources/lib/domain/evidence';
import { viewerHref } from '@/features/swim-resources/lib/domain/data-viewer';
import { readRecordProvenance } from '@/features/swim-resources/lib/services/evidence';

export default function RecordEvidence({ path, revision }: { path: string; revision: number }) {
  const [result, setResult] = useState<{ value: Provenance | null; key: string; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([readRecordProvenance(path), evidenceKey(path)]).then(([value, key]) => { if (active) setResult({ value, key }); }).catch(error => { if (active) setResult({ value: null, key: '', error: error instanceof Error ? error.message : 'Evidence unavailable.' }); });
    return () => { active = false; };
  }, [path, revision]);
  if (!result) return <p role="status">Loading private evidence…</p>;
  if (result.error) return <p role="alert">{result.error}</p>;
  if (!result.value) return <p>No provenance stored. This record has not been verified by the fresh workflow.</p>;
  const value = result.value, status = freshness(value);
  return <section className="admin-section" aria-label="Evidence and freshness">
    <h2>Evidence and freshness</h2>
    <p>Origin: {value.origin} · Facts changed: {value.lastChangedAt ?? 'Not recorded'} · Accepted fields checked: {value.lastSuccessfulCheckAt ?? 'No external verification'}</p>
    <p>Last attempt: {value.lastAttemptAt ?? 'Not recorded'} · {status.needsAttention ? 'Needs attention' : value.origin === 'external' && !status.fullyChecked ? 'Field verification incomplete' : 'No attention reasons recorded'}</p>
    {status.due.length > 0 && <p>Due or uncovered fields: {status.due.join(', ')}</p>}
    {Object.entries(value.failures).map(([source, reason]) => <p key={source}>{source}: {reason}</p>)}
    {!!value.reviewQuestions?.length && <details open={value.reviewQuestions.some(question => question.status === 'open')}><summary>Review questions ({value.reviewQuestions.filter(question => question.status === 'open').length} open)</summary><ul>{value.reviewQuestions.map(question => <li key={question.id}>
      <p>{question.status}: {question.question} · Fields: {question.fields.join(', ')} · Updated: {question.updatedAt}</p>
      {question.resolution && <p>Resolution: {question.resolution}</p>}
      <ul>{question.evidence.map((evidence, index) => <li key={index}><Link href={viewerHref(`sources/${evidence.sourceId}/revisions/${evidence.revisionId}`)}>Exact supporting capture</Link> · <Link href={viewerHref(`sources/${evidence.sourceId}/checks/${evidence.checkId}`)}>{evidence.checkedAt}</Link>: {evidence.excerpt}</li>)}</ul>
    </li>)}</ul></details>}
    <nav className="admin-controls" aria-label="Evidence links"><Link href={viewerHref(`record_provenance/${result.key}`)}>Provenance</Link><Link href={viewerHref(`record_provenance/${result.key}/events`)}>Check and decision history</Link><Link href={viewerHref(`record_provenance/${result.key}/disagreements`)}>Disagreements ({value.openDisagreements.length} open)</Link><Link href={viewerHref('source_bindings') + '?' + new URLSearchParams({ field: 'targetPath', value: path })}>Field bindings</Link></nav>
    {Object.keys(value.accepted).length > 0 && <div className="admin-table-scroll"><table><caption>Accepted evidence covers only these fields</caption><thead><tr><th>Field</th><th>Source</th><th>Accepted check</th><th>Latest confirmation</th><th>Revision</th><th>Context / support</th></tr></thead><tbody>{Object.entries(value.accepted).map(([field, evidence]) => <tr key={field}><th scope="row">{field}</th><td><Link href={viewerHref(`sources/${evidence.sourceId}`)}>{evidence.sourceId}</Link></td><td><Link href={viewerHref(`sources/${evidence.sourceId}/checks/${evidence.checkId}`)}>{evidence.checkedAt}</Link></td><td>{evidence.confirmedBy ? <Link href={viewerHref(`sources/${evidence.confirmedBy.sourceId}/checks/${evidence.confirmedBy.checkId}`)}>{evidence.confirmedBy.checkedAt}</Link> : evidence.checkedAt}</td><td><Link href={viewerHref(`sources/${evidence.sourceId}/revisions/${evidence.revisionId}`)}>{evidence.revisionId.slice(0, 12)}</Link></td><td>{evidence.context}<br />{evidence.excerpt}</td></tr>)}</tbody></table></div>}
  </section>;
}
