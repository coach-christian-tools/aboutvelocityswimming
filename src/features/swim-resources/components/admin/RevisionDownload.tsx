'use client';
import { useEffect, useRef, useState } from 'react';
import { readRevisionCapture } from '@/features/swim-resources/lib/services/evidence';
export default function RevisionDownload({ sourceId, revisionId }: { sourceId: string; revisionId: string }) {
  const [url, setUrl] = useState<string | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  async function prepare() {
    setLoading(true); setError(null);
    try { const blob = await readRevisionCapture(sourceId, revisionId); if (active.current) setUrl(URL.createObjectURL(blob)); }
    catch (issue) { if (active.current) setError(issue instanceof Error ? issue.message : 'Capture could not be loaded.'); }
    finally { if (active.current) setLoading(false); }
  }
  return <div className="admin-controls">
    {url ? <><a href={url} download={`evidence-${revisionId}`}>Download verified private capture</a><span role="status">Archive checksum verified.</span></> : <button disabled={loading} onClick={() => { void prepare(); }}>{loading ? 'Loading private capture…' : 'Prepare private download'}</button>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
