import { Timestamp, GeoPoint, Firestore } from 'firebase-admin/firestore';
import { hashBytes } from './evidence-archive.mjs';
export function collectionCounts(entries) {
  const counts = {};
  for (const entry of entries) { const path = entry.path.split('/').slice(0, -1).join('/'); counts[path] = (counts[path] ?? 0) + 1; }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

/** Files are verified before the completion manifest is published. */
export async function publishDatasetArchive(storage, bucket, prefix, manifest, readBytes) {
  verifyArchive(manifest);
  const uploaded = new Set();
  for (const file of manifest.files ?? []) {
    if (uploaded.has(file.hash)) continue;
    const bytes = await readBytes(file.hash);
    if (hashBytes(bytes) !== file.hash || bytes.length !== file.size) throw new Error('Archived file checksum mismatch.');
    const object = storage.bucket(bucket).file(`${prefix}/${file.hash}`);
    await object.save(bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentDisposition: 'attachment' } });
    if (hashBytes((await object.download())[0]) !== file.hash) throw new Error('Cloud file verification failed.');
    uploaded.add(file.hash);
  }
  const bytes = Buffer.from(JSON.stringify(manifest)), object = storage.bucket(bucket).file(`${prefix}/dataset.json`);
  await object.save(bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: 'application/json', contentDisposition: 'attachment' } });
  if (hashBytes((await object.download())[0]) !== hashBytes(bytes)) throw new Error('Cloud manifest verification failed.');
}
export function encodeValue(value, proto) {
  if (value === null) return { type: 'null' };
  if (value instanceof Timestamp) return { type: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (value instanceof GeoPoint) return { type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { type: 'bytes', value: Buffer.from(value).toString('base64') };
  if (value?.firestore && typeof value.path === 'string') {
    const qualified = proto?.referenceValue?.match(/^projects\/([^/]+)\/databases\/([^/]+)\/documents\/(.+)$/);
    return { type: 'reference', path: qualified?.[3] ?? value.path, project: qualified?.[1] ?? value.firestore.projectId, database: qualified?.[2] ?? value.firestore.databaseId };
  }
  if (Array.isArray(value)) return { type: 'array', value: value.map((v, index) => encodeValue(v, proto?.arrayValue?.values?.[index])) };
  if (typeof value === 'object') return { type: 'map', value: Object.fromEntries(Object.keys(value).sort().map(key => [key, encodeValue(value[key], proto?.mapValue?.fields?.[key])])) };
  if (typeof value === 'number' && !Number.isFinite(value)) return { type: 'number', value: String(value) };
  return { type: typeof value, value };
}
export function decodeValue(encoded, db) {
  switch (encoded.type) {
    case 'null': return null;
    case 'timestamp': return new Timestamp(encoded.seconds, encoded.nanoseconds);
    case 'geopoint': return new GeoPoint(encoded.latitude, encoded.longitude);
    case 'bytes': return Buffer.from(encoded.value, 'base64');
    case 'reference': return (encoded.project && (encoded.project !== db.projectId || encoded.database !== db.databaseId) ? new Firestore({ projectId: encoded.project, databaseId: encoded.database }) : db).doc(encoded.path);
    case 'array': return encoded.value.map(v => decodeValue(v, db));
    case 'map': return Object.fromEntries(Object.entries(encoded.value).map(([k, v]) => [k, decodeValue(v, db)]));
    case 'number': return typeof encoded.value === 'string' ? Number(encoded.value) : encoded.value;
    default: return encoded.value;
  }
}
export async function exportDataset(db) {
  const entries = [];
  const collections = await db.listCollections();
  for (let index = 0; index < collections.length; index++) {
    const collection = collections[index];
    // listDocuments includes missing parents with live subcollections.
    const references = await collection.listDocuments();
    for (let offset = 0; offset < references.length; offset += 200) {
      const page = await db.getAll(...references.slice(offset, offset + 200));
      let next = 0;
      // Enumerating children requires one request per parent. Keep those reads
      // bounded while avoiding thousands of sequential network round trips.
      const workers = await Promise.allSettled(Array.from({ length: Math.min(8, page.length) }, async () => {
        while (next < page.length) {
          const document = page[next++];
          if (document.exists) {
            // The pinned SDK normalizes cross-database references in data(); retain
            // their original qualified identity from the read-only wire fields.
            const data = encodeValue(document.data(), { mapValue: { fields: document._fieldsProto } }); entries.push({ path: document.ref.path, data, hash: hashBytes(JSON.stringify(data)) });
          }
          collections.push(...await document.ref.listCollections());
        }
      }));
      const failure = workers.find(worker => worker.status === 'rejected');
      if (failure) throw failure.reason;
    }
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { version: 1, entries, counts: collectionCounts(entries), fingerprint: hashBytes(JSON.stringify(entries.map(e => [e.path, e.hash]))) };
}
export function verifyArchive(archive) {
  if (archive.version !== 1 || !Array.isArray(archive.entries) || new Set(archive.entries.map(e => e.path)).size !== archive.entries.length) throw new Error('Invalid dataset archive.');
  if (archive.counts && JSON.stringify(archive.counts) !== JSON.stringify(collectionCounts(archive.entries))) throw new Error('Archive collection counts mismatch.');
  if (archive.filesFingerprint && hashBytes(JSON.stringify(archive.files.map(file => [file.bucket, file.object, file.hash, file.size]).sort())) !== archive.filesFingerprint) throw new Error('Archived file manifest checksum mismatch.');
  for (const entry of archive.entries) if (typeof entry.path !== 'string' || entry.path.split('/').length % 2 || entry.path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid archive record path.');
  for (const entry of archive.entries) if (hashBytes(JSON.stringify(entry.data)) !== entry.hash) throw new Error('Archive record checksum mismatch.');
  if (hashBytes(JSON.stringify(archive.entries.map(e => [e.path, e.hash]))) !== archive.fingerprint) throw new Error('Archive fingerprint mismatch.');
}
export async function restoreArchive(db, archive) {
  verifyArchive(archive);
  if ((await db.listCollections()).length) throw new Error('Restore requires an empty disposable database.');
  for (let offset = 0; offset < archive.entries.length; offset += 200) {
    const batch = db.batch();
    for (const entry of archive.entries.slice(offset, offset + 200)) batch.create(db.doc(entry.path), decodeValue(entry.data, db));
    await batch.commit();
  }
  const restored = await exportDataset(db);
  if (restored.fingerprint !== archive.fingerprint) throw new Error('Restored dataset does not match the archive.');
  return restored.entries.length;
}
export function storageReferences(value, references = new Set()) {
  if (typeof value === 'string') {
    try {
      const url = new URL(value);
      if (url.protocol === 'gs:') references.add(JSON.stringify({ bucket: url.hostname, object: decodeURIComponent(url.pathname.slice(1)) }));
      if (url.hostname === 'firebasestorage.googleapis.com') { const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/); if (match) references.add(JSON.stringify({ bucket: match[1], object: decodeURIComponent(match[2]) })); }
      if (url.hostname === 'storage.googleapis.com') { const [, bucket, ...path] = url.pathname.split('/'); if (bucket && path.length) references.add(JSON.stringify({ bucket, object: decodeURIComponent(path.join('/')) })); }
    } catch {}
  } else if (value && typeof value === 'object') {
    if (typeof value.bucket === 'string' && typeof value.storagePath === 'string') references.add(JSON.stringify({ bucket: value.bucket, object: value.storagePath }));
    for (const child of Object.values(value)) storageReferences(child, references);
  }
  return references;
}
