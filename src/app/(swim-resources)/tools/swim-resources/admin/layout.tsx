'use client';


import { swimResourcesPath } from '../../../../../features/swim-resources/lib/routes.ts';
import Link from 'next/link';
import { onAuthStateChanged } from '@/lib/auth';
import { useEffect, useState } from 'react';
import { auth, BACKEND_PROJECT_ID, DATASET_ID } from '@/features/swim-resources/lib/backend';
import { isViewerCoach } from '@/features/swim-resources/lib/domain/data-viewer';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [access, setAccess] = useState<'checking' | 'allowed' | 'denied'>('checking');
  useEffect(() => {
    try {
      for (const key of ['ptolemy-history-height', 'admin-chatbot-history-width', 'admin-import-history-width', 'cutter_gemini_api_key']) localStorage.removeItem(key);
    } catch {}
    return onAuthStateChanged(auth, user => setAccess(isViewerCoach(user) ? 'allowed' : 'denied'));
  }, []);
  return <div className="admin-simple">
    <header className="admin-header">
      <nav aria-label="Admin navigation"><Link href={swimResourcesPath("/admin")}>Collections</Link><Link href={swimResourcesPath("/admin/maintenance")}>Maintenance</Link><Link href={swimResourcesPath("/admin/import")}>Import</Link><Link href={swimResourcesPath("/")}>Home</Link></nav>
    </header>
    <main id="admin-content">
      <p>Database: <code>{BACKEND_PROJECT_ID} / {DATASET_ID}</code>{DATASET_ID !== 'velocity-v2' && ' · Original dataset; fresh Import is disabled until cutover.'}</p>
      {access === 'checking' ? <p role="status">Checking authentication…</p> : access === 'denied' ? <p role="alert">A verified Velocity coaching account is required. <Link href={swimResourcesPath("/")}>Return home to sign in.</Link></p> : children}
    </main>
  </div>;
}
