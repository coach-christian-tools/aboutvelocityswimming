'use client';

import type { CourseType, SwimEventSelection } from '@/features/swim-resources/components/admin/EventSelector';
import type { StandardSet, StandardTierCut } from '@/features/swim-resources/types/schema';
import { Award, Flame } from 'lucide-react';
import { useState } from 'react';

interface StandardsEventTableProps {
  motivationalSet?: StandardSet | null;
  championshipSet?: StandardSet | null;
  selectedEvent: SwimEventSelection;
}

const MOTIVATIONAL_TIERS = ['AAAA', 'AAA', 'AA', 'A', 'BB', 'B'];
const MOTIVATIONAL_AGE_GROUPS = ['10&U', '11-12', '13-14', '15-16', '17-18'];

const TIER_BADGE_STYLES: Record<string, string> = {
  AAAA: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-bold',
  AAA: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30 font-semibold',
  AA: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 font-medium',
  A: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 font-medium',
  BB: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 font-medium',
  B: 'bg-surface border-border text-text-secondary font-medium',
};

export default function StandardsEventTable({
  motivationalSet,
  championshipSet,
  selectedEvent,
}: StandardsEventTableProps) {
  const [activeGender, setActiveGender] = useState<'both' | 'F' | 'M'>('both');

  const course: CourseType = selectedEvent.course || 'SCY';
  const eventCode = `${selectedEvent.distance}_${selectedEvent.stroke}_${course}`;

  // Helper to retrieve cut display for a motivational event
  const getMotivationalCut = (
    gender: 'F' | 'M',
    ageGroup: string,
    tierName: string
  ): string | null => {
    if (!motivationalSet?.cuts?.[course]?.[gender]?.[ageGroup]?.[eventCode]) {
      return null;
    }
    const cuts = motivationalSet.cuts[course]![gender]![ageGroup]![eventCode].cutsByTier;
    const match = cuts.find((c: StandardTierCut) => c.tierName === tierName);
    return match ? match.timeDisplay : null;
  };

  // Helper to retrieve all cuts for championship event
  const getChampionshipCuts = (gender: 'F' | 'M') => {
    const ageMap: Record<string, StandardTierCut[]> = {};
    const cutsObj = championshipSet?.cuts?.[course]?.[gender];
    if (!cutsObj) return ageMap;

    for (const ageGroup of Object.keys(cutsObj)) {
      if (cutsObj[ageGroup]?.[eventCode]?.cutsByTier) {
        ageMap[ageGroup] = cutsObj[ageGroup]![eventCode].cutsByTier;
      }
    }
    return ageMap;
  };

  const femaleChampCuts = getChampionshipCuts('F');
  const maleChampCuts = getChampionshipCuts('M');

  const hasMotivationalData =
    motivationalSet &&
    motivationalSet.cuts?.[course] &&
    (MOTIVATIONAL_AGE_GROUPS.some((ag) => getMotivationalCut('F', ag, 'A')) ||
      MOTIVATIONAL_AGE_GROUPS.some((ag) => getMotivationalCut('M', ag, 'A')));

  const hasChampData =
    championshipSet &&
    (Object.keys(femaleChampCuts).length > 0 || Object.keys(maleChampCuts).length > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header controls: Gender view filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-surface border border-border">
        <div className="flex items-center gap-2">
          <Award size={18} className="text-primary-blue" />
          <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
            Display Standards for {selectedEvent.eventName}
          </span>
        </div>

        <div className="inline-flex rounded-lg bg-bg p-1 border border-border text-xs">
          <button
            type="button"
            onClick={() => setActiveGender('both')}
            className={`px-3 py-1 rounded-md font-medium transition-all ${
              activeGender === 'both'
                ? 'bg-surface text-primary-blue shadow-sm font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Girls &amp; Boys
          </button>
          <button
            type="button"
            onClick={() => setActiveGender('F')}
            className={`px-3 py-1 rounded-md font-medium transition-all ${
              activeGender === 'F'
                ? 'bg-pink-500/10 text-pink-600 dark:text-pink-400 shadow-sm font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Girls Only
          </button>
          <button
            type="button"
            onClick={() => setActiveGender('M')}
            className={`px-3 py-1 rounded-md font-medium transition-all ${
              activeGender === 'M'
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-sm font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Boys Only
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. USA SWIMMING MOTIVATIONAL STANDARDS TABLE                  */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border bg-surface flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Flame size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary">
                USA Swimming Motivational Standards
              </h3>
              <p className="text-[11px] text-text-secondary">
                {motivationalSet?.seasonYears ?? 'No current imported set'} • {selectedEvent.course} Course
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {MOTIVATIONAL_TIERS.map((tier) => (
              <span
                key={tier}
                className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  TIER_BADGE_STYLES[tier] || 'bg-bg text-text-secondary'
                }`}
              >
                {tier}
              </span>
            ))}
          </div>
        </div>

        {hasMotivationalData ? (
          <div className="p-4 flex flex-col gap-6">
            {(activeGender === 'both' || activeGender === 'F') && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-pink-500" />
                  <h4 className="text-xs font-bold text-pink-600 dark:text-pink-400 uppercase tracking-wider">
                    Girls Standards
                  </h4>
                </div>
                <div className="overflow-x-auto border border-border rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-bg/70 border-b border-border text-text-secondary font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Age Group</th>
                        {MOTIVATIONAL_TIERS.map((tier) => (
                          <th key={tier} className="py-2.5 px-3 text-center">
                            {tier}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {MOTIVATIONAL_AGE_GROUPS.map((ag) => (
                        <tr key={ag} className="hover:bg-hover-bg/40 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-text-primary">
                            {ag}
                          </td>
                          {MOTIVATIONAL_TIERS.map((tier) => {
                            const time = getMotivationalCut('F', ag, tier);
                            return (
                              <td
                                key={tier}
                                className="py-2.5 px-3 text-center font-mono text-[11px]"
                              >
                                {time ? (
                                  <span className="font-semibold text-text-primary">
                                    {time}
                                  </span>
                                ) : (
                                  <span className="text-text-secondary/40">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(activeGender === 'both' || activeGender === 'M') && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <h4 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                    Boys Standards
                  </h4>
                </div>
                <div className="overflow-x-auto border border-border rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-bg/70 border-b border-border text-text-secondary font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Age Group</th>
                        {MOTIVATIONAL_TIERS.map((tier) => (
                          <th key={tier} className="py-2.5 px-3 text-center">
                            {tier}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {MOTIVATIONAL_AGE_GROUPS.map((ag) => (
                        <tr key={ag} className="hover:bg-hover-bg/40 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-text-primary">
                            {ag}
                          </td>
                          {MOTIVATIONAL_TIERS.map((tier) => {
                            const time = getMotivationalCut('M', ag, tier);
                            return (
                              <td
                                key={tier}
                                className="py-2.5 px-3 text-center font-mono text-[11px]"
                              >
                                {time ? (
                                  <span className="font-semibold text-text-primary">
                                    {time}
                                  </span>
                                ) : (
                                  <span className="text-text-secondary/40">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-text-secondary text-xs">
            No motivational cut data found for {selectedEvent.eventName}.
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. CHAMPIONSHIP QUALIFYING STANDARDS TABLE                    */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border bg-surface flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Award size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary">
                Championship Qualifying Standards
              </h3>
              <p className="text-[11px] text-text-secondary">
                {championshipSet?.seasonYears ?? 'No current imported set'}
              </p>
            </div>
          </div>
        </div>

        {hasChampData ? (
          <div className="p-4 flex flex-col gap-6">
            {(activeGender === 'both' || activeGender === 'F') && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-pink-500" />
                  <h4 className="text-xs font-bold text-pink-600 dark:text-pink-400 uppercase tracking-wider">
                    Girls Championship Cuts
                  </h4>
                </div>
                {Object.keys(femaleChampCuts).length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(femaleChampCuts).map(([ag, cuts]) => (
                      <div
                        key={ag}
                        className="rounded-xl border border-border bg-bg/50 p-3 flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between pb-1.5 border-b border-border">
                          <span className="text-xs font-bold text-text-primary">
                            Age: {ag}
                          </span>
                          <span className="text-[10px] text-text-secondary">
                            {cuts.length} {cuts.length === 1 ? 'Cut' : 'Cuts'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {cuts.map((cut, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-xs py-0.5"
                            >
                              <span className="text-text-secondary font-medium truncate max-w-[150px]">
                                {cut.tierName}
                              </span>
                              <span className="font-mono font-bold text-primary-blue bg-primary-blue/10 px-2 py-0.5 rounded border border-primary-blue/20">
                                {cut.timeDisplay}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-secondary italic">
                    No girls championship cuts listed for this event.
                  </p>
                )}
              </div>
            )}

            {(activeGender === 'both' || activeGender === 'M') && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <h4 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                    Boys Championship Cuts
                  </h4>
                </div>
                {Object.keys(maleChampCuts).length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(maleChampCuts).map(([ag, cuts]) => (
                      <div
                        key={ag}
                        className="rounded-xl border border-border bg-bg/50 p-3 flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between pb-1.5 border-b border-border">
                          <span className="text-xs font-bold text-text-primary">
                            Age: {ag}
                          </span>
                          <span className="text-[10px] text-text-secondary">
                            {cuts.length} {cuts.length === 1 ? 'Cut' : 'Cuts'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {cuts.map((cut, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-xs py-0.5"
                            >
                              <span className="text-text-secondary font-medium truncate max-w-[150px]">
                                {cut.tierName}
                              </span>
                              <span className="font-mono font-bold text-primary-blue bg-primary-blue/10 px-2 py-0.5 rounded border border-primary-blue/20">
                                {cut.timeDisplay}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-secondary italic">
                    No boys championship cuts listed for this event.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-text-secondary text-xs">
            No championship qualifying cut data found for {selectedEvent.eventName}.
          </div>
        )}
      </div>
    </div>
  );
}
