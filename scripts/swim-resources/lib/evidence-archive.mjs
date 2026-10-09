import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat, realpath } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';

export const MAX_CAPTURE_BYTES = 20 * 1024 * 1024;
export const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex');
export function privatePath(path, root = 'backups') {
  const full = resolve(path), base = resolve(root);
  if (relative(base, full).startsWith('..') || full === base) throw new Error('Artifacts must stay inside the private backups directory.');
  return full;
}
export async function privateWrite(path, data) {
  const full = privatePath(path); await mkdir(dirname(full), { recursive: true, mode: 0o700 });
  await writeFile(full, data, { mode: 0o600 });
}
export async function captureBytes(path, expected) {
  const full = privatePath(path);
  const info = await lstat(full);
  if (info.isSymbolicLink() || !privatePath(await realpath(full))) throw new Error('Symlink captures are not supported.'); if (!info.isFile() || info.size > MAX_CAPTURE_BYTES) throw new Error('Capture exceeds the 20 MB limit.');
  const bytes = await readFile(full); if (hashBytes(bytes) !== expected) throw new Error('Capture changed after collection.'); return bytes;
}
export function archiveStorage(context) {
 return {bucket(name){if(name!=='evidence')throw new Error('Captures require the private evidence bucket.');return {file(path){const bucket=context.client.storage.from(name);return {
 async save(bytes,options={}){const {error}=await bucket.upload(path,bytes,{contentType:options.metadata?.contentType,upsert:false});if(error)throw Object.assign(error,{code:Number(error.statusCode)});},
 async download(){const {data,error}=await bucket.download(path);if(error)throw error;return [Buffer.from(await data.arrayBuffer())];},
 async getMetadata(){const {data,error}=await bucket.info(path);if(error)throw error;return [{generation:data.id}];}
 };}};}};
}
export async function archiveCapture(context, bucket, sourceId, capture, bytes, storage = archiveStorage(context)) {
  if (!bucket || !/^[a-z0-9._-]+$/.test(bucket)) throw new Error('Supply a private archive bucket.');
  const path = `evidence/${context.project}/${context.database}/${sourceId}/${capture.hash}`;
  const file = storage.bucket(bucket).file(path);
  try {
    await file.save(bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: capture.contentType, contentDisposition: 'attachment', metadata: { sha256: capture.hash } } });
  } catch (error) {
    if (![409, 412].includes(Number(error.code))) throw error;
    const [existing] = await file.download(); if (hashBytes(existing) !== capture.hash) throw new Error('Archive hash collision or corruption.');
  }
  const [metadata] = await file.getMetadata();
  return { bucket, storagePath: path, hash: capture.hash, size: bytes.length, contentType: capture.contentType, generation: String(metadata.generation), capturedAt: capture.at };
}
