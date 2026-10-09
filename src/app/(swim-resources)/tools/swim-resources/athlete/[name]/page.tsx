'use client';

import AthleteBestTimes from '@/features/swim-resources/components/AthleteBestTimes';
import type { PublicAthlete } from '@/features/swim-resources/lib/domain/athlete';
import { db } from '@/features/swim-resources/lib/backend';
import type { AthleteBest } from '@/features/swim-resources/types/schema';
import { collection, getDocs, query, where } from '@/lib/data';
import { useParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function AthleteContainer() {
  const params = useParams();
  const rawName = decodeURIComponent(params.name as string || '');
  
  // Format: "Christian_Cutter" or "Emma_Knott"
  const nameParts = rawName.split('_');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  const athleteName = `${firstName} ${lastName}`.trim();

  const [results, setResults] = useState<AthleteBest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [athlete, setAthlete] = useState<PublicAthlete | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Query athletes by name using aliases array
        const athletesQuery = query(collection(db, 'public_athletes'), where('aliases', 'array-contains', athleteName));
        const athletesSnap = await getDocs(athletesQuery);
        
        if (!athletesSnap.empty) {
          const athleteDoc = athletesSnap.docs[0];
          setAthlete({ id: athleteDoc.id, ...athleteDoc.data() } as PublicAthlete);
          
          // Fetch bests subcollection
          const bestsSnap = await getDocs(collection(db, `athletes/${athleteDoc.id}/bests`));
          const bests = bestsSnap.docs.map(doc => doc.data() as AthleteBest);
          setResults(bests);
        } else {
          // Empty state
          setResults([]);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    if (athleteName) {
      fetchData();
    }
  }, [athleteName]);

  return (
    <div className="w-full">
      <AthleteBestTimes results={results} isLoading={isLoading} athleteName={athleteName} athlete={athlete} />
    </div>
  );
}

export default function AthletePage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-[60vh] text-text-secondary">Loading Profile...</div>}>
      <AthleteContainer />
    </Suspense>
  );
}
