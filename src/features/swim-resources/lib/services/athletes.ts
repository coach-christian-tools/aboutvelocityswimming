import { assertFreshTarget, prepareOrigins, writeWithOrigins } from './evidence';
import { VELOCITY_TEAM_ID, validateEntityLinks } from '@/features/swim-resources/lib/domain/entities';
import { normalizeAthleteStatus, publicAthlete, type FirestoreAthlete } from '@/features/swim-resources/lib/domain/athlete';
import { isCalendarDate } from '@/features/swim-resources/lib/domain/date';
import { db } from '@/features/swim-resources/lib/backend';
import { cleanFirestoreData } from '@/features/swim-resources/lib/utils/firestore-cleaner';
import { collection, doc, getDocs, runTransaction } from '@/lib/data';
import { buildAliases, statusToLocation } from './athlete-fields';

const LEGACY_FIELDS = ['firstName', 'lastName', 'group', 'rosterGroup', 'location', 'email', 'phone', 'notes', '_formattedGroup'];

export function canonicalAthlete(previous: FirestoreAthlete, changes: Partial<FirestoreAthlete>): FirestoreAthlete {
  validateEntityLinks(changes);
  if (changes.status && !['active', 'taking_break', 'alumni', 'inactive'].includes(changes.status)) throw new Error('Invalid athlete status.');
  if (changes.gender && !['M', 'F', 'X'].includes(changes.gender)) throw new Error('Invalid athlete gender.');
  if (changes.dob && !isCalendarDate(changes.dob)) throw new Error('Invalid date of birth.');
  const next = { ...previous, ...changes, id: previous.id, teamId: changes.teamId ?? previous.teamId ?? VELOCITY_TEAM_ID };
  next.name = {
    ...previous.name,
    ...changes.name,
    first: changes.name?.first ?? changes.firstName ?? previous.name?.first ?? previous.firstName ?? '',
    last: changes.name?.last ?? changes.lastName ?? previous.name?.last ?? previous.lastName ?? '',
  };
  if (!next.name.first.trim() || !next.name.last.trim()) throw new Error('An athlete requires first and last names.');
  next.status = normalizeAthleteStatus(changes.status ?? (changes.location ? undefined : previous.status), changes.location ?? previous.location);
  const group = changes.currentGroup?.name ?? changes.group ?? changes.rosterGroup ?? previous.currentGroup?.name ?? previous.group ?? previous.rosterGroup ?? 'Unassigned';
  next.currentGroup = {
    ...previous.currentGroup, ...changes.currentGroup,
    id: group.toLowerCase().replace(/[^a-z0-9]/g, '_'), name: group,
    assignedAt: previous.currentGroup?.name === group ? previous.currentGroup.assignedAt : changes.currentGroup?.assignedAt ?? new Date().toISOString(),
  };
  next.contact = { ...(previous.email ? { email: previous.email } : {}), ...(previous.phone ? { phone: previous.phone } : {}), ...previous.contact, ...changes.contact,
    ...(changes.email !== undefined ? { email: changes.email } : {}), ...(changes.phone !== undefined ? { phone: changes.phone } : {}) };
  next.styling = { ...(previous.notes ? { notes: previous.notes } : {}), ...previous.styling, ...changes.styling, ...(changes.notes !== undefined ? { notes: changes.notes } : {}) };
  next.aliases = [...new Set([...(changes.aliases ?? previous.aliases ?? []), ...buildAliases(next.name.first, next.name.last, next.name.preferred)])];
  next.metadata = { ...previous.metadata, ...changes.metadata, createdAt: previous.metadata?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() };
  for (const field of [...LEGACY_FIELDS, ...Object.keys(next).filter(key => key.includes('.'))]) delete (next as Record<string, unknown>)[field];
  return cleanFirestoreData(next as unknown as Record<string, unknown>) as unknown as FirestoreAthlete;
}

/** Publish the safe projection in the same transaction as the private write. */
export async function writeAthlete(id: string, changes: Partial<FirestoreAthlete>, mode: 'create' | 'update' | 'upsert' = 'update'): Promise<void> {
  assertFreshTarget();
  await runTransaction(db, async transaction => {
    const reference = doc(db, 'athletes', id);
    const snapshot = await transaction.get(reference);
    if (mode === 'create' && snapshot.exists()) throw new Error('This athlete already exists.');
    if (mode === 'update' && !snapshot.exists()) throw new Error('This athlete no longer exists.');
    const next = canonicalAthlete({ ...snapshot.data(), id }, changes);
    const publicRef = doc(db, 'public_athletes', id), previousPublic = await transaction.get(publicRef);
    const projection = publicAthlete(id, next);
    const publish = await prepareOrigins(transaction, [{ path: `athletes/${id}`, before: snapshot.data() ?? null, after: next as unknown as Record<string, unknown>, origin: 'manual' }, { path: `public_athletes/${id}`, before: previousPublic.data() ?? null, after: projection as unknown as Record<string, unknown>, origin: 'derived', derivedFrom: [`athletes/${id}`] }]);
    transaction.set(reference, next);
    publish();
    transaction.set(doc(db, 'public_athletes', id), publicAthlete(id, next));
  });
}

export async function deleteAthleteDocuments(id: string): Promise<void> {
  assertFreshTarget();
  const bests = await getDocs(collection(db, 'athletes', id, 'bests'));
  const changes = [...bests.docs.map(best => ({ path: `athletes/${id}/bests/${best.id}`, after: null, origin: 'derived' as const })), { path: `athletes/${id}`, after: null, origin: 'manual' as const }, { path: `public_athletes/${id}`, after: null, origin: 'derived' as const }];
  for (let offset = 0; offset < changes.length; offset += 100) await writeWithOrigins(changes.slice(offset, offset + 100));
}

export function attendanceLocation(status?: string, location?: string): string {
  return statusToLocation(normalizeAthleteStatus(status, location));
}
