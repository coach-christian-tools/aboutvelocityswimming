import { mkdirSync, appendFileSync } from 'node:fs';
import { adminDatabase } from './lib/admin.mjs';
import { backfillEntities } from './lib/entity-backfill.mjs';

if (process.argv.includes('--help')) {
  console.log('node scripts/swim-resources/backfill-entity-links.mjs --project <id> --database "(default)" [--firebase-cli | --key <key.json>] [--apply --confirm-project <id> --confirm-database "(default)"]');
  process.exit(0);
}
const { db, project, database, apply } = adminDatabase();
if (database === 'velocity-v2') throw new Error('Legacy maintenance is disabled for velocity-v2. Use evidence-backed Import.');
const backup = `backups/archives/${project}/${database}/entity-links-before-${Date.now()}.jsonl`;
if (apply) mkdirSync(`backups/archives/${project}/${database}`, { recursive: true, mode: 0o700 });
const result = await backfillEntities(db, {
  apply,
  beforeWrite: (path, data) => appendFileSync(backup, JSON.stringify({ path, before: data }) + '\n', { mode: 0o600 }),
});
console.log(JSON.stringify({ project, mode: apply ? 'apply' : 'dry-run', ...result, ...(apply ? { backup } : {}) }));
