// Node 24 strips the types from this pure, credential-free domain module.
import { publicAthlete, normalizeAthleteStatus } from '../../src/features/swim-resources/lib/domain/athlete.ts';
import { adminDatabase } from './lib/admin.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

if (process.argv.includes('--help')) {
  console.log('node scripts/swim-resources/migrate-public-profiles.mjs --project <id> --database "(default)" [--firebase-cli | --key <service-account.json>] [--profiles-only] [--apply --confirm-project <id> --confirm-database "(default)"]');
  process.exit(0);
}
const { db, project, database, apply } = adminDatabase();
if (database === 'velocity-v2') throw new Error('Legacy maintenance is disabled for velocity-v2. Use evidence-backed Import.');
const profilesOnly = process.argv.includes('--profiles-only');
const snapshot = await db.collection('athletes').get();
const profiles = snapshot.docs.map(document => ({ document, profile: publicAthlete(document.id, document.data()) }));
if (profiles.some(({ profile }) => !profile.name.first || !profile.name.last)) {
  throw new Error('Some athletes have incomplete names. Resolve them before publishing profiles.');
}
console.log(JSON.stringify({ project, athletes: profiles.length, mode: apply ? 'apply' : 'dry-run', normalizePrivateStatus: !profilesOnly, publicFields: ['id', 'name', 'aliases', 'swimcloudId'] }));
if (apply) {
  mkdirSync(`backups/archives/${project}/${database}`, { recursive: true, mode: 0o700 });
  writeFileSync(`backups/archives/${project}/${database}/athletes-before-profile-migration-${Date.now()}.json`, JSON.stringify(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))), { mode: 0o600 });
  for (let i = 0; i < profiles.length; i += 200) {
    const batch = db.batch();
    for (const { document, profile } of profiles.slice(i, i + 200)) {
      batch.set(db.collection('public_athletes').doc(document.id), profile);
      // Canonical status wins over legacy location; existing demographic values remain private.
      const data = document.data();
      if (!profilesOnly) batch.update(document.ref, { status: normalizeAthleteStatus(data.status, data.location) });
    }
    await batch.commit();
  }
  console.log('Profile migration complete. Deploy the updated rules before the updated frontend.');
}
