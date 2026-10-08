import { hashBytes } from './lib/evidence-archive.mjs';
import { importDirectory } from '../../src/features/swim-resources/lib/domain/database-target.ts';
// Convert a roster export into a review batch. This script never writes Firestore.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import iconv from 'iconv-lite';
import { parse } from 'csv-parse/sync';
import { adminDatabase } from './lib/admin.mjs';
import { rosterBatch } from './lib/roster-batch.mjs';

const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
if (args.includes('--help')) {
  console.log('node scripts/swim-resources/update-roster.mjs --project <id> --database velocity-v2 --source <id> --check <id> --csv backups/.../current-roster.csv [--encoding utf8|macroman] [--firebase-cli | --key <key.json>] [--out backups/imports/<project>/velocity-v2/pending/roster.json] [--complete] [--teamunify-id-column <header>] [--swims-id-column <header>] [--swimcloud-id-column <header>]');
  process.exit(0);
}
if (args.includes('--apply')) throw new Error('Roster writes require selected review in the Import page. This script only stages JSON.');
const { db, project, database } = adminDatabase();
if (database !== 'velocity-v2') throw new Error('Fresh roster batches require velocity-v2.');
const output = resolve(option('--out') ?? importDirectory(project, database) + '/pending/roster.json');
if (!output.startsWith(resolve('backups') + '/')) throw new Error('Save pending batches inside the ignored backups directory.');

const csvPath = option('--csv') ?? 'export.csv';
const encoding = option('--encoding') ?? 'utf8';
if (!['utf8', 'macroman'].includes(encoding)) throw new Error('Use utf8 or macroman encoding explicitly.');
const rows = parse(iconv.decode(readFileSync(csvPath), encoding), { columns: true, skip_empty_lines: true, bom: true });
for (const column of ['Memb. First Name', 'Memb. Last Name']) if (!rows.length || !(column in rows[0])) throw new Error('Missing roster column: ' + column);
const columns = {};
for (const [field, flag] of [['teamUnifyId', '--teamunify-id-column'], ['swimsId', '--swims-id-column'], ['swimcloudId', '--swimcloud-id-column']]) {
  const column = option(flag);
  if (column) { if (!(column in rows[0])) throw new Error('Missing identity column: ' + column); columns[field] = column; }
}
const snapshot = await db.collection('athletes').get();
const athletes = snapshot.docs.map(document => ({ ...document.data(), id: document.id }));
const sourceId = option('--source'), checkId = option('--check');
if (!sourceId || !checkId) throw new Error('Supply the registered --source and archived --check.');
const source = (await db.doc('sources/' + sourceId).get()).data(), check = (await db.doc(`sources/${sourceId}/checks/${checkId}`).get()).data();
const hash = hashBytes(readFileSync(csvPath));
if (!source || check?.outcome !== 'retrieved' || check.revisionId !== hash) throw new Error('CSV must match the published archived source check.');
const collectedAt = check.at;
const batch = rosterBatch(rows, athletes, { id: sourceId, name: source.name, kind: 'roster_export', reference: source.reference, revisionId: hash, checkId, target: { project, database },
  collectedAt, coverage: args.includes('--complete') ? 'complete' : 'partial', scope: args.includes('--complete') ? 'Coach confirmed a complete, unfiltered membership export.' : 'Export completeness unconfirmed; omissions do not change membership.' }, 'roster_' + Date.now(), columns);
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
if (batch.rows.length > 1000) throw new Error('More than 1000 relevant observations; split the export into explicitly scoped review batches.');
writeFileSync(output, JSON.stringify(batch, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ project, mode: 'staged-review-only', sourceRows: rows.length, held: batch.rows.filter(row => !row.verified).length, reviewItems: batch.unresolved.length, output }));
