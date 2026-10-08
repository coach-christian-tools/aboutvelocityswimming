import { readFile } from 'node:fs/promises';
import { adminDatabase } from './lib/admin.mjs';
import { privatePath, privateWrite } from './lib/evidence-archive.mjs';
import { importDirectory } from '../../src/features/swim-resources/lib/domain/database-target.ts';
import { parseImportBatch } from '../../src/features/swim-resources/lib/domain/import-batch.ts';
const args = process.argv.slice(2), option = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
if (args.includes('--help')) { console.log('prepare-import --project <id> --database velocity-v2 --input backups/... [--out backups/.../pending/<id>.json]'); process.exit(0); }
if (args.includes('--apply')) throw new Error('Prepared batches require selected Import review.');
const context = adminDatabase(), batch = parseImportBatch(await readFile(privatePath(option('--input')), 'utf8'));
if (batch.target.project !== context.project || batch.target.database !== context.database) throw new Error('Import target mismatch.');
for (const source of batch.sources) { const check = await context.db.doc(`sources/${source.id}/checks/${source.checkId}`).get(); if (!check.exists || check.data().revisionId !== source.revisionId || check.data().outcome !== 'retrieved') throw new Error('Publish captures before preparing an import.'); }
const output = importDirectory(context.project, context.database) + '/pending/' + batch.id + '.json';
await privateWrite(output, JSON.stringify(batch, null, 2));
console.log(JSON.stringify({ mode: 'staged-review-only', observations: batch.rows.length, output }));
