// Cleanup placeholder athletes only, never real names. Dry-run is the default.
import { mkdirSync, writeFileSync } from 'node:fs';
import { adminDatabase } from './lib/admin.mjs';
if (process.argv.includes('--help')) {
  console.log('node scripts/swim-resources/delete-swimmers.mjs --project <id> --database "(default)" [--key <key.json>] [--apply --confirm-project <id> --confirm-database "(default)"]');
  process.exit(0);
}
const { db, project, database, apply } = adminDatabase();
if (database === 'velocity-v2') throw new Error('Legacy maintenance is disabled for velocity-v2. Use evidence-backed Import.');
const snapshot = await db.collection('athletes').get();
const matches = snapshot.docs.filter(d => String(d.data().name?.first || d.data().firstName || '').trim().toLowerCase() === 'swimmer');
console.log(JSON.stringify({ project, mode: apply ? 'apply' : 'dry-run', placeholderAthletes: matches.length }));
if (apply && matches.length) {
  mkdirSync(`backups/archives/${project}/${database}`, { recursive: true, mode: 0o700 });
  // Include bests in the backup before deleting their athlete descendants.
  const backups = [];
  for (const athlete of matches) {
    const bests = await athlete.ref.collection('bests').get();
    backups.push({ id: athlete.id, data: athlete.data(), bests: bests.docs.map(d => ({ id: d.id, data: d.data() })) });
  }
  writeFileSync(`backups/archives/${project}/${database}/placeholders-before-delete-${Date.now()}.json`, JSON.stringify(backups), { mode: 0o600 });
  for (const athlete of matches) {
    await db.recursiveDelete(athlete.ref);
    await db.collection('public_athletes').doc(athlete.id).delete();
  }
  console.log(`Deleted ${matches.length} placeholder athletes. Historical swims and goals are retained.`);
}
