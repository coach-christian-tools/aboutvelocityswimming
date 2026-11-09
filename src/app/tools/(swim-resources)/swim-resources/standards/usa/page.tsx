'use client';


import { swimResourcesPath } from '../../../../../../features/swim-resources/lib/routes.ts';
import EventSelector, {
  SwimEventSelection,
  formatEventName,
} from '@/features/swim-resources/components/admin/EventSelector';
import StandardsEventTable from '@/features/swim-resources/components/standards/StandardsEventTable';
import rawStandardsData from '@/features/swim-resources/lib/data/raw-standards.json';
import { currentStandard } from '@/features/swim-resources/lib/domain/standards';
import { standardsCol, DATASET_ID } from '@/features/swim-resources/lib/backend';
import {
  transformRawStandardsToStandardSets,
  type RawStandardEntry
} from '@/features/swim-resources/lib/utils/standards-transformer';
import type { StandardSet } from '@/features/swim-resources/types/schema';
import { onSnapshot } from '@/lib/data';
import { ArrowLeft, Award, Flame } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function UsaStandardsPage() {
  const [motivationalSet, setMotivationalSet] = useState<StandardSet | null>(() => {
    if (DATASET_ID === 'velocity-v2') return null;
    const bundled = transformRawStandardsToStandardSets(rawStandardsData as RawStandardEntry[]);
    return bundled.motivationalSet;
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
      const match = DATASET_ID === 'velocity-v2' ? currentStandard(sets, 'motivational') : sets.find(s => s.id === 'usas_motivational_2024_2028');
      if (DATASET_ID === 'velocity-v2' || match) setMotivationalSet(match ?? null);
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
          href={swimResourcesPath("/standards/champ")}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-hover-bg text-text-primary transition-colors"
        >
          <Award size={14} className="text-amber-500" />
          <span>View Championship Cuts</span>
        </Link>
      </div>

      {/* Hero Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Flame size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">
              USA Swimming Motivational Standards
            </h1>
            <p className="text-sm text-text-secondary">
              {motivationalSet ? `${motivationalSet.name} · ${motivationalSet.seasonYears}` : 'No current verified motivational standards have been imported.'}
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
          motivationalSet={motivationalSet}
          selectedEvent={selectedEvent}
        />
      )}
    </div>
  );
}
