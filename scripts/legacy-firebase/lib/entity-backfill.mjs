import { createHash } from 'node:crypto';
import { entityId, TEAM_SCOPED_COLLECTIONS, VELOCITY_TEAM, VELOCITY_TEAM_ID } from '../../../src/features/swim-resources/lib/domain/entities.ts';

const personId = id => 'athlete_' + createHash('sha256').update(id).digest('hex').slice(0, 32);
/** Add links only. Never move explicitly owned records or guess host teams/venues. */
export function ownershipPatch(data) {
  return data.teamId === undefined ? { teamId: VELOCITY_TEAM_ID } : {};
}
export function athleteLinks(id, data) {
  const linkedId = data.personId || personId(id);
  if (!entityId(linkedId)) throw new Error('Invalid athlete person ID; resolve it before backfilling.');
  const name = data.name ? [data.name.first, data.name.last].filter(Boolean).join(' ') : [data.firstName, data.lastName].filter(Boolean).join(' ');
  if (!name) throw new Error('An athlete has no readable name; resolve it before backfilling people.');
  return { personId: linkedId, person: { id: linkedId, name, athleteId: id, role: 'Athlete', teamId: data.teamId ?? VELOCITY_TEAM_ID } };
}
/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {{ apply?: boolean, beforeWrite?: (path: string, data: unknown) => void }} options
 */
export async function backfillEntities(db, { apply = false, beforeWrite = () => {} } = {}) {
  const counts = { scanned: 0, ownership: 0, athletesLinked: 0, peopleCreated: 0, teamCreated: 0 };
  const teamRef = db.doc(`teams/${VELOCITY_TEAM_ID}`);
  await db.runTransaction(async tx => {
    const team = await tx.get(teamRef);
    if (!team.exists) {
      counts.teamCreated = 1;
      if (apply) { beforeWrite(teamRef.path, null); tx.create(teamRef, VELOCITY_TEAM); }
    }
  });
  for (const collection of TEAM_SCOPED_COLLECTIONS) {
    let cursor;
    while (true) {
      let query = db.collection(collection).orderBy('__name__').limit(200);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      // Bound concurrent work and wait for the entire group on errors. Each write
      // still re-reads its record and linked person inside its own transaction.
      for (let offset = 0; offset < page.docs.length; offset += 8) {
        const results = await Promise.allSettled(page.docs.slice(offset, offset + 8).map(async snapshot => {
          const inspect = async tx => {
          const current = await tx.get(snapshot.ref);
          if (!current.exists) return null;
          const data = current.data(), patch = ownershipPatch(data);
          let newPerson;
          if (collection === 'athletes') {
            const linked = athleteLinks(current.id, data);
            const ref = db.doc(`people/${linked.personId}`), person = await tx.get(ref);
            if (person.exists && person.data().athleteId !== current.id) throw new Error('An athlete person link belongs to another identity. No changes applied to this athlete.');
            if (!data.personId) patch.personId = linked.personId;
            if (!person.exists) newPerson = { ref, data: linked.person };
          }
          if (apply && Object.keys(patch).length) { beforeWrite(current.ref.path, data); tx.update(current.ref, patch); }
          if (apply && newPerson) { beforeWrite(newPerson.ref.path, null); tx.create(newPerson.ref, newPerson.data); }
          return { ownership: !!patch.teamId, linked: !!patch.personId, created: !!newPerson };
          };
          // Preflight is a point-in-time inspection; apply always checks fresh data.
          return apply ? db.runTransaction(inspect) : inspect({ get: ref => ref.path === snapshot.ref.path ? Promise.resolve(snapshot) : ref.get() });
        }));
        for (const settled of results) {
          if (settled.status === 'rejected') throw settled.reason;
          const result = settled.value;
          if (result) {
            counts.scanned++;
            counts.ownership += Number(result.ownership);
            counts.athletesLinked += Number(result.linked);
            counts.peopleCreated += Number(result.created);
          }
        }
      }
      if (page.size < 200) break;
      cursor = page.docs.at(-1);
    }
  }
  return counts;
}
