import { dirname, join } from 'node:path';
import { archiveStorage, hashBytes } from './lib/evidence-archive.mjs';
import { readFile } from 'node:fs/promises';
import { adminDatabase } from './lib/admin.mjs';
import { privatePath } from './lib/evidence-archive.mjs';
import { verifyArchive, restoreArchive } from './lib/dataset-archive.mjs';
const args = process.argv.slice(2), option = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
if (args.includes('--help')) { console.log('restore-archive --project demo-<id> --database restore-test --manifest backups/... [--apply --confirm-project <id> --confirm-database restore-test] (emulator only)'); process.exit(0); }
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Restoration tests require the Firestore emulator.');
const context = adminDatabase(); if (!context.project.startsWith('demo-') || context.database === 'velocity-v2') throw new Error('Use a disposable demo database for restore verification.');
const archive = JSON.parse(await readFile(privatePath(option('--manifest')), 'utf8')); verifyArchive(archive);
const files = [];
for (const file of archive.files ?? []) { const bytes = await readFile(privatePath(join(dirname(option('--manifest')), 'files', file.hash))); if (hashBytes(bytes) !== file.hash || bytes.length !== file.size) throw new Error('Archived file checksum mismatch.'); files.push({ ...file, bytes }); }
if (context.apply && files.length) {
  if (!process.env.STORAGE_EMULATOR_HOST) throw new Error('File restoration requires the Storage emulator.');
  const storage = archiveStorage(context);
  for (const file of files) {
    const target = storage.bucket(file.bucket).file(file.object);
    try { await target.save(file.bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 } }); } catch (error) { if (![409, 412].includes(Number(error.code))) throw error; }
    if (hashBytes((await target.download())[0]) !== file.hash) throw new Error('Restored file checksum mismatch.');
  }
}
console.log(JSON.stringify({ mode: context.apply ? 'restored-and-verified' : 'dry-run', records: context.apply ? await restoreArchive(context.db, archive) : archive.entries.length, fingerprint: archive.fingerprint }));
