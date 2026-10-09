import { adminDatabase } from './lib/admin.mjs';
import { archiveStorage, privateWrite, hashBytes } from './lib/evidence-archive.mjs';
import { exportDataset, verifyArchive, decodeValue, storageReferences, publishDatasetArchive } from './lib/dataset-archive.mjs';
import { readFile } from 'node:fs/promises';
const args = process.argv.slice(2), option = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
if (args.includes('--help')) { console.log('archive-dataset --project <id> --database "(default)" [--firebase-cli] [--bucket <private-bucket> --apply --confirm-project <id> --confirm-database "(default)"]'); process.exit(0); }
const context = adminDatabase(), archive = await exportDataset(context.db);
const verification = await exportDataset(context.db);
if (archive.fingerprint !== verification.fingerprint) throw new Error('Dataset changed during export. Stop source writers and retry.');
verifyArchive(archive);
const id = 'archive_' + Date.now(), directory = `backups/archives/${context.project}/${context.database}/${id}`;
const storage = archiveStorage(context), references = new Set(), files = [];
for (const entry of archive.entries) storageReferences(decodeValue(entry.data, context.db), references);
for (const reference of references) {
  const { bucket, object } = JSON.parse(reference);
  const [bytes] = await storage.bucket(bucket).file(object).download();
  const hash = hashBytes(bytes); await privateWrite(`${directory}/files/${hash}`, bytes); files.push({ bucket, object, hash, size: bytes.length });
}
const filesFingerprint = hashBytes(JSON.stringify(files.map(file => [file.bucket, file.object, file.hash, file.size]).sort()));
if ((await exportDataset(context.db)).fingerprint !== archive.fingerprint) throw new Error('Dataset changed while archiving files.');
const manifest = { ...archive, filesFingerprint, project: context.project, database: context.database, archivedAt: new Date().toISOString(), files };
await privateWrite(`${directory}/dataset.json`, JSON.stringify(manifest));
if (context.apply) {
  const bucket = option('--bucket'); if (!bucket) throw new Error('Supply a private archive bucket.');
  await publishDatasetArchive(storage, bucket, `legacy-archives/${context.project}/${context.database}/${id}`, manifest, hash => readFile(`${directory}/files/${hash}`));
}
console.log(JSON.stringify({ mode: context.apply ? 'archived-private-cloud' : 'archived-local', records: archive.entries.length, files: files.length, fingerprint: archive.fingerprint, manifest: directory + '/dataset.json' }));
