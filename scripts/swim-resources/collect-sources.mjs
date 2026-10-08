import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { adminDatabase } from './lib/admin.mjs';
import { privateWrite, privatePath, hashBytes, MAX_CAPTURE_BYTES } from './lib/evidence-archive.mjs';
import { collectHttp } from './lib/source-collector.mjs';
import { validateSource } from '../../src/features/swim-resources/lib/domain/evidence.ts';
import { importDirectory } from '../../src/features/swim-resources/lib/domain/database-target.ts';
const args = process.argv.slice(2), option = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
if (args.includes('--help')) { console.log('collect-sources --project <id> --database velocity-v2 [--source <id> | --due] [--input backups/... --content-type <mime>] [--firebase-cli]'); process.exit(0); }
if (args.includes('--apply')) throw new Error('Collection stages captures only. Apply through reconcile-evidence.');
const context = adminDatabase(); if (context.database !== 'velocity-v2') throw new Error('Collection requires velocity-v2.');
if (!!option('--source') === args.includes('--due')) throw new Error('Choose --source or --due.');
const runId = 'check_' + randomUUID(), at = new Date().toISOString();
const directory = importDirectory(context.project, context.database) + '/captures/' + runId;
const sources = [];
if (option('--source')) sources.push((await context.db.doc('sources/' + option('--source')).get()).data());
else {
  let cursor;
  while (sources.length < 100) {
    let query = context.db.collection('sources').orderBy('__name__').limit(100); if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    sources.push(...page.docs.map(d => d.data()).filter(s => s.enabled && (!s.lastSuccessfulCheckAt || Date.parse(s.lastSuccessfulCheckAt) + s.intervalDays * 86400000 <= Date.now())).slice(0, 100 - sources.length));
    if (page.size < 100) break; cursor = page.docs.at(-1);
  }
}
const captures = [];
for (const source of sources) {
  validateSource(source);
  try {
    let collected;
    if (source.retrieval === 'http') collected = await collectHttp(source.reference);
    else {
      if (!option('--input') || sources.length !== 1) throw new Error('Local/email sources require --input and one selected source.');
      const bytes = await readFile(privatePath(option('--input')));
      if (!bytes.length || bytes.length > MAX_CAPTURE_BYTES) throw new Error('Invalid local capture size.');
      if (source.retrieval === 'email') { const email = JSON.parse(bytes); if (Object.keys(email).some(key => !['provider', 'account', 'messageId', 'reference', 'excerpt'].includes(key)) || typeof email.provider !== 'string' || typeof email.messageId !== 'string' || Object.entries(email).some(([key, value]) => key !== 'excerpt' && (typeof value !== 'string' || !value.trim() || value.length > 2048)) || typeof email.excerpt !== 'string' || !email.excerpt.trim() || email.excerpt.length > 4000) throw new Error('Email capture requires only a message reference and minimal excerpt.'); }
      collected = { bytes, hash: hashBytes(bytes), contentType: option('--content-type') || 'application/octet-stream' };
    }
    const file = directory + '/' + source.id + '-' + collected.hash;
    await privateWrite(file, collected.bytes);
    captures.push({ sourceId: source.id, checkId: runId, at, outcome: 'retrieved', hash: collected.hash, contentType: collected.contentType, file, ...(collected.finalUrl ? { finalUrl: collected.finalUrl } : {}) });
  } catch { captures.push({ sourceId: source.id, checkId: runId, at, outcome: 'failed', error: 'Source unavailable, capture invalid, or access required.' }); }
}
const manifest = directory + '/bundle.json';
await privateWrite(manifest, JSON.stringify({ version: 2, target: { project: context.project, database: context.database }, id: runId, captures, observations: [] }, null, 2));
console.log(JSON.stringify({ mode: 'staged-only', sources: captures.length, retrieved: captures.filter(c => c.outcome === 'retrieved').length, manifest }));
