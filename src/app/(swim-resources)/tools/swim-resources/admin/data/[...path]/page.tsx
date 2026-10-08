import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { resolveViewerPath } from '@/features/swim-resources/lib/domain/data-viewer';
import DataViewer from '@/features/swim-resources/components/admin/DataViewer';

export default async function DataPage({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = resolveViewerPath(path);
  if (!target) notFound();
  return <Suspense fallback={<p role="status">Loading data viewer…</p>}><DataViewer target={target} /></Suspense>;
}
