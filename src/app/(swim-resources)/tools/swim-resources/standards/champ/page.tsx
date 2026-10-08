'use client';


import { swimResourcesPath } from '../../../../../../features/swim-resources/lib/routes.ts';
import EventSelector, {
  SwimEventSelection,
  formatEventName,
} from '@/features/swim-resources/components/admin/EventSelector';
import StandardsEventTable from '@/features/swim-resources/components/standards/StandardsEventTable';
import rawStandardsData from '@/features/swim-resources/lib/data/raw-standards.json';
import { currentStandard } from '@/features/swim-resources/lib/domain/standards';
import { standardsCol, FIRESTORE_DATABASE_ID } from '@/features/swim-resources/lib/firebase';
import {
  transformRawStandardsToStandardSets,
  type RawStandardEntry
} from '@/features/swim-resources/lib/utils/standards-transformer';
import type { StandardSet } from '@/features/swim-resources/types/schema';
import { onSnapshot } from 'firebase/firestore';
import { ArrowLeft, Award, Flame } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function ChampStandardsPage() {
  const [championshipSet, setChampionshipSet] = useState<StandardSet | null>(() => {
    if (FIRESTORE_DATABASE_ID === 'velocity-v2') return null;
    const bundled = transformRawStandardsToStandardSets(rawStandardsData as RawStandardEntry[]);
    return bundled.championshipSet;
  });

  const [selectedEvent, setSelectedEvent] = useState<SwimEventSelection | null>({
    course: 'SCY',
    stroke: 'FR',
    distance: 100,
    isRelay: false,
    eventName: formatEventName('SCY', 'FR', 100, false),
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(standardsCol, (snapshot) => {
      const sets = snapshot.docs.map(d => d.data());
      const match = FIRESTORE_DATABASE_ID === 'velocity-v2' ? currentStandard(sets, 'championship') : sets.find(s => s.id === 'championship_cuts_2025_2026');
      if (FIRESTORE_DATABASE_ID === 'velocity-v2' || match) setChampionshipSet(match ?? null);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto w-full flex flex-col gap-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href={swimResourcesPath("/")}
          className="inline-flex items-center gap-2 text-primary-blue font-medium hover:underline text-sm"
        >
          <ArrowLeft size={16} />
          <span>Back to Home</span>
        </Link>

        <Link
          href={swimResourcesPath("/standards/usa")}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-hover-bg text-text-primary transition-colors"
        >
          <Flame size={14} className="text-emerald-500" />
          <span>View USA Motivational Standards</span>
        </Link>
      </div>

      {/* Hero Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Award size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">
              Championship Qualifying Standards
            </h1>
            <p className="text-sm text-text-secondary">
              {championshipSet ? `${championshipSet.name} · ${championshipSet.seasonYears}` : 'No current verified championship standards have been imported.'}
            </p>
          </div>
        </div>
      </div>

      {/* Event Selector */}
      <EventSelector
        value={selectedEvent}
        onChange={(evt) => setSelectedEvent(evt)}
      />

      {/* Standards Display Table */}
      {selectedEvent && (
        <StandardsEventTable
          championshipSet={championshipSet}
          selectedEvent={selectedEvent}
        />
      )}
    </div>
  );
}
