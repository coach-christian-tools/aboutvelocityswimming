'use client';


import { swimResourcesPath } from '../../../../../features/swim-resources/lib/routes.ts';
import SwimResultsBrowser from '@/features/swim-resources/components/SwimResultsBrowser';
import Link from 'next/link';
import { Suspense } from 'react';

export default function TimesPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto w-full">
      <Link href={swimResourcesPath("/")} className="inline-flex items-center gap-2 mb-6 text-primary-blue font-medium hover:underline">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Home
      </Link>
      <Suspense fallback={<div className="p-6 text-center">Loading Team Times...</div>}>
        <SwimResultsBrowser />
      </Suspense>
    </div>
  );
}
