import { swimResourcesPath } from '../lib/routes.ts';
import type { PublicAthlete } from '@/features/swim-resources/lib/domain/athlete';
import type { AthleteBest } from '@/features/swim-resources/types/schema';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export default function AthleteBestTimes({ results, isLoading, athleteName, athlete }: { results: AthleteBest[], isLoading: boolean, athleteName: string, athlete?: PublicAthlete | null }) {
  const [selectedRecord, setSelectedRecord] = useState<AthleteBest | null>(null);

  if (isLoading) {
    return <div className="flex justify-center items-center h-[60vh] text-text-secondary">Loading Best Times...</div>;
  }

  if (results.length === 0) {
    return <div className="p-6 text-text-secondary">No best times found for {athleteName}.</div>;
  }

  return (
    <div className="p-6">
      <Link href={swimResourcesPath("/")} className="inline-flex items-center gap-2 mb-6 px-4 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm font-medium cursor-pointer transition-colors hover:bg-hover-bg">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
        Back to Dashboard
      </Link>

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <h1 className="heading-1">{athleteName}&apos;s Best Times</h1>
        {athlete?.swimcloudId && (
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`https://www.swimcloud.com/swimmer/${athlete.swimcloudId}/times/`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-border text-xs font-medium text-text-secondary hover:text-primary-blue hover:border-primary-blue/30 transition-all"
            >
              <ExternalLink size={14} /> Times
            </Link>
            <Link
              href={`https://www.swimcloud.com/swimmer/${athlete.swimcloudId}/meets/`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-border text-xs font-medium text-text-secondary hover:text-primary-blue hover:border-primary-blue/30 transition-all"
            >
              <ExternalLink size={14} /> Meets
            </Link>
            <Link
              href={`https://www.swimcloud.com/swimmer/${athlete.swimcloudId}/powerindex/`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-border text-xs font-medium text-text-secondary hover:text-primary-blue hover:border-primary-blue/30 transition-all"
            >
              <ExternalLink size={14} /> Power Index
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.map((result, index) => (
          <div 
            key={index} 
            className="flex items-center gap-3 p-4 bg-surface border border-border rounded-xl shadow-sm transition-shadow hover:shadow-md cursor-pointer w-full"
            onClick={() => setSelectedRecord(result)}
          >
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-text-primary text-sm sm:text-base">
                  {result.eventCode}
                </span>
                <span className="font-bold text-primary-blue tabular-nums text-sm sm:text-base ml-2">
                  {result.bestTimeDisplay}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs text-text-secondary">
                <span className="truncate pr-2">{result.meetName}</span>
                <span className="flex-shrink-0">{result.swimDate}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-fade-in-up">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="heading-3">{selectedRecord.eventCode}</h3>
              <button onClick={() => setSelectedRecord(null)} className="p-2 -mr-2 text-text-secondary hover:text-text-primary rounded-full hover:bg-hover-bg transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="flex justify-between border-b border-border pb-4">
                <span className="text-text-secondary text-sm">Time</span>
                <span className="font-bold text-text-primary">{selectedRecord.bestTimeDisplay}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-4">
                <span className="text-text-secondary text-sm">Meet</span>
                <span className="font-bold text-text-primary text-right">{selectedRecord.meetName}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-4">
                <span className="text-text-secondary text-sm">Date</span>
                <span className="font-bold text-text-primary">{selectedRecord.swimDate}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-4">
                <span className="text-text-secondary text-sm">Standard</span>
                <span className="font-bold text-text-primary">{selectedRecord.standard || 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
