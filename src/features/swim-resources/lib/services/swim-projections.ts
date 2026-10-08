import { writeWithOrigins } from './evidence';
import { db } from '@/features/swim-resources/lib/firebase';
import { cleanFirestoreData } from '@/features/swim-resources/lib/utils/firestore-cleaner';
import type { AthleteBest, Swim } from '@/features/swim-resources/types/schema';
import { collection, getDocs } from 'firebase/firestore';
const chunkArray = <T,>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

export async function recomputeAllAthleteBests(): Promise<{ totalBestsWritten: number; athletesCount: number }> {
  // Fetch all valid swims
  const swimsSnap = await getDocs(collection(db, 'swims'));
  const swims = swimsSnap.docs.map(d => d.data() as Swim);

  // Group by athleteId -> eventCode -> best swim
  const athleteBestsMap = new Map<string, Map<string, Swim>>();
  // Every athlete with any swim (valid or not) — used to purge stale bests.
  const athleteSnapshot = await getDocs(collection(db, 'athletes'));
  const allSwimAthleteIds = new Set(athleteSnapshot.docs.map(d => d.id));

  for (const s of swims) {
    allSwimAthleteIds.add(s.athleteId);
    if (s.status !== 'OK' || !s.timeMs || s.timeMs <= 0 || s.isRelay) continue;
    
    if (!athleteBestsMap.has(s.athleteId)) {
      athleteBestsMap.set(s.athleteId, new Map());
    }
    
    const athleteEvents = athleteBestsMap.get(s.athleteId)!;
    const existingBest = athleteEvents.get(s.eventCode);
    
    if (!existingBest || s.timeMs < existingBest.timeMs) {
      athleteEvents.set(s.eventCode, s);
    }
  }

  // Write materialized AthleteBest documents into `athletes/{athleteId}/bests/{eventCode}`
  let totalBestsWritten = 0;
  const bestDocOperations: { path: string; data: AthleteBest }[] = [];

  athleteBestsMap.forEach((eventsMap, athleteId) => {
    eventsMap.forEach((bestSwim, eventCode) => {
      const bestRecord: AthleteBest = {
        eventCode,
        distance: bestSwim.distance,
        stroke: bestSwim.stroke,
        course: bestSwim.course,
        bestTimeMs: bestSwim.timeMs,
        bestTimeDisplay: bestSwim.timeDisplay,
        swimDate: bestSwim.meet.date,
        meetName: bestSwim.meet.name,
        swimId: bestSwim.id,
        standard: bestSwim.standardsTag?.usasMotivational || '',
        ageWhenSwum: bestSwim.ageAtSwim,
        clubRankAllTime: 1, // default
        clubRankActiveRoster: 1,
      };

      bestDocOperations.push({
        path: `athletes/${athleteId}/bests/${eventCode}`,
        data: bestRecord,
      });
    });
  });

  const chunks = chunkArray(bestDocOperations, 100);
  for (const chunk of chunks) {
    await writeWithOrigins(chunk.map(op => ({ path: op.path, after: cleanFirestoreData(op.data) as unknown as Record<string, unknown>, origin: 'derived', derivedFrom: [`swims/${op.data.swimId}`] })));
    totalBestsWritten += chunk.length;
  }

  // Prune stale bests for every athlete that has swims (including athletes
  // whose swims all became invalid, so their old bests don't linger).
  for (const athleteId of allSwimAthleteIds) {
    const eventsMap = athleteBestsMap.get(athleteId) || new Map<string, Swim>();
    const bestsCol = collection(db, 'athletes', athleteId, 'bests');
    const existingSnap = await getDocs(bestsCol);
    const stale = existingSnap.docs.filter(d => !eventsMap.has(d.id));
    const staleChunks = chunkArray(stale, 100);
    for (const staleChunk of staleChunks) {
      await writeWithOrigins(staleChunk.map(d => ({ path: `athletes/${athleteId}/bests/${d.id}`, after: null, origin: 'derived' })));
    }
  }

  return { totalBestsWritten, athletesCount: athleteBestsMap.size };
}

/** Best times are the only persisted swim projection. Team records use swims directly. */
export async function refreshSwimProjections(): Promise<{ bestsUpdated: number }> {
  const bests = await recomputeAllAthleteBests();
  return { bestsUpdated: bests.totalBestsWritten };
}
