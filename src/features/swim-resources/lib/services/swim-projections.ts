import {browserClient} from '@/lib/supabase/client';
// Postgres updates bests atomically with every result mutation, including imports
// and reversals. The review UI only reports the committed projection counts.
export async function recomputeAllAthleteBests():Promise<{totalBestsWritten:number;athletesCount:number}>{const {data,error}=await browserClient().rpc('projection_counts');if(error)throw error;return data as unknown as {totalBestsWritten:number;athletesCount:number};}
export async function refreshSwimProjections(){const counts=await recomputeAllAthleteBests();return {bestsUpdated:counts.totalBestsWritten};}
