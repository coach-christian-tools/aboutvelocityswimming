import { Suspense } from 'react';
import MaintenanceQueue from '@/features/swim-resources/components/admin/MaintenanceQueue';

export default function MaintenancePage() {
  return <Suspense fallback={<p role="status">Loading maintenance…</p>}><MaintenanceQueue /></Suspense>;
}
