'use client';


import { swimResourcesPath } from '../../../../../features/swim-resources/lib/routes.ts';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { auth, FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from '@/features/swim-resources/lib/firebase';
import { isViewerCoach } from '@/features/swim-resources/lib/domain/data-viewer';

const subscribeTheme = (callback: () => void) => {
  window.addEventListener('theme-change', callback);
  window.addEventListener('storage', callback);
  return () => { window.removeEventListener('theme-change', callback); window.removeEventListener('storage', callback); };
};
const readTheme = () => {
  try { const saved = localStorage.getItem('theme'); return saved === 'light' || saved === 'dark' ? saved : 'system'; }
  catch { return 'system'; }
};

function AdminTheme() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => 'system');
  return <label>Theme <select value={theme} onChange={event => {
    const value = event.target.value;
    try { localStorage.setItem('theme', value); } catch {}
    if (value === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', value);
    window.dispatchEvent(new Event('theme-change'));
  }}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>;
}

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
      <nav aria-label="Admin navigation"><Link href={swimResourcesPath("/admin")}>Collections</Link><Link href={swimResourcesPath("/admin/map")}>Data map</Link><Link href={swimResourcesPath("/admin/maintenance")}>Maintenance</Link><Link href={swimResourcesPath("/admin/import")}>Import</Link><Link href={swimResourcesPath("/")}>Home</Link></nav>
      <AdminTheme />
    </header>
    <main id="admin-content">
      <p>Database: <code>{FIREBASE_PROJECT_ID} / {FIRESTORE_DATABASE_ID}</code>{FIRESTORE_DATABASE_ID !== 'velocity-v2' && ' · Original dataset; fresh Import is disabled until cutover.'}</p>
      {access === 'checking' ? <p role="status">Checking authentication…</p> : access === 'denied' ? <p role="alert">A verified Velocity coaching account is required. <Link href={swimResourcesPath("/")}>Return home to sign in.</Link></p> : children}
    </main>
  </div>;
}
