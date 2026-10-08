import { useState } from 'react';

// We simplified SwimResultsBrowser to avoid massive client-side data processing.
// In the new architecture, we'll fetch paginated Swims here or let individual tabs fetch what they need.
export default function SwimResultsBrowser() {
  const [activeTab, setActiveTab] = useState('swims');
  
  return (
    <div className="flex flex-col h-full bg-background min-h-screen">
      <div className="flex gap-4 border-b border-border p-4 bg-surface sticky top-0 z-10 overflow-x-auto">
        <button onClick={() => setActiveTab('swims')} className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${activeTab === 'swims' ? 'bg-primary-blue text-white' : 'text-text-secondary hover:bg-hover-bg hover:text-text-primary'}`}>All Swims</button>
        <button onClick={() => setActiveTab('team-records')} className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${activeTab === 'team-records' ? 'bg-primary-blue text-white' : 'text-text-secondary hover:bg-hover-bg hover:text-text-primary'}`}>Team Records</button>
        <button onClick={() => setActiveTab('analysis')} className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${activeTab === 'analysis' ? 'bg-primary-blue text-white' : 'text-text-secondary hover:bg-hover-bg hover:text-text-primary'}`}>Analysis</button>
      </div>
      
      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        {activeTab === 'swims' && <div className="text-text-secondary">All Swims view is under construction for the new schema.</div>}
        {activeTab === 'team-records' && <div className="text-text-secondary">Team Records view is under construction for the new schema.</div>}
        {activeTab === 'analysis' && <div className="text-text-secondary">Analysis view is under construction for the new schema.</div>}
      </div>
    </div>
  );
}
