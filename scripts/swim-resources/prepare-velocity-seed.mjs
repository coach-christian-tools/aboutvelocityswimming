import { randomUUID } from 'node:crypto';
import { privateWrite, hashBytes } from './lib/evidence-archive.mjs';
import { importDirectory } from '../../src/features/swim-resources/lib/domain/database-target.ts';
const args = process.argv.slice(2), option = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
if (args.includes('--help')) { console.log('prepare-velocity-seed --project <id> --database velocity-v2 (local artifacts only; no database writes)'); process.exit(0); }
if (args.includes('--apply') || option('--database') !== 'velocity-v2') throw new Error('Seed preparation is local-only for velocity-v2.');
const project = option('--project'), database = 'velocity-v2', target = { project, database };
const directory = importDirectory(project, database) + '/seed/' + randomUUID();
const at = new Date().toISOString(), checkId = 'manual_' + randomUUID(), sourceId = 'velocity-identity';
const bytes = Buffer.from('User-approved team identity: Velocity Swimming. All team-specific records belong to Velocity Swimming. No website, contacts, roster or performance claims are supplied.');
const hash = hashBytes(bytes), file = directory + '/identity.txt';
const source = { id: sourceId, name: 'Velocity identity approval', kind: 'manual', reference: 'manual:velocity-team-identity', scope: 'Team identity only', retrieval: 'local', intervalDays: 30, enabled: true };
await privateWrite(file, bytes);
await privateWrite(directory + '/sources.json', JSON.stringify({ target, sources: [source], bindings: [] }, null, 2));
await privateWrite(directory + '/bundle.json', JSON.stringify({ version: 2, target, captures: [{ sourceId, checkId, at, outcome: 'retrieved', hash, contentType: 'text/plain', file }], observations: [] }, null, 2));
await privateWrite(directory + '/import.json', JSON.stringify({ version: 2, target, id: 'velocity_seed_' + randomUUID(), collectedAt: at, sources: [{ id: sourceId, name: source.name, kind: 'manual', reference: source.reference, revisionId: hash, checkId, collectedAt: at, coverage: 'complete', scope: source.scope }], rows: [{ id: 'velocity_team', kind: 'team', sourceIds: [sourceId], verified: true, data: { id: 'velocity-swimming', name: 'Velocity Swimming' }, evidence: [{ sourceId, revisionId: hash, checkId, checkedAt: at, fields: ['name'], context: source.scope, excerpt: 'User-approved identity: Velocity Swimming.' }] }], unresolved: [] }, null, 2));
console.log(JSON.stringify({ mode: 'local-only', directory, next: 'Register source, archive bundle, prepare Import, then review the team seed.' }));
