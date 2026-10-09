import { readFile } from 'node:fs/promises';
import { adminDatabase } from './lib/admin.mjs';
import { privatePath } from './lib/evidence-archive.mjs';
import { validateSource, validateBinding } from '../../src/features/swim-resources/lib/domain/evidence.ts';
import { IMPORT_COLLECTIONS } from '../../src/features/swim-resources/lib/domain/import-batch.ts';
const args = process.argv.slice(2), option = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
if (args.includes('--help')) { console.log('register-evidence --project <id> --database velocity-v2 --config backups/... [--apply --confirm-project <id> --confirm-database velocity-v2]'); process.exit(0); }
const context = adminDatabase(); if (context.database !== 'velocity-v2') throw new Error('Only fresh sources can be registered.');
const configuration = JSON.parse(await readFile(privatePath(option('--config')), 'utf8'));
if (configuration.target?.provider !== 'supabase' || configuration.target?.project !== context.project || configuration.target.database !== context.database || !Array.isArray(configuration.sources) || !Array.isArray(configuration.bindings) || configuration.sources.length + configuration.bindings.length > 100) throw new Error('Invalid source configuration target or size.');
if (new Set(configuration.sources.map(s => s.id)).size !== configuration.sources.length || new Set(configuration.bindings.map(b => b.id)).size !== configuration.bindings.length) throw new Error('Duplicate configuration IDs.');
configuration.sources = configuration.sources.map(source => ({ ...source, intervalDays: source.intervalDays ?? 30 }));
configuration.bindings = configuration.bindings.map(binding => ({ ...binding, priority: binding.priority ?? null }));
configuration.sources.forEach(validateSource); configuration.bindings.forEach(validateBinding);
for (const binding of configuration.bindings) {
  if (!Object.values(IMPORT_COLLECTIONS).includes(binding.targetPath.split('/')[0])) throw new Error('Binding target is not importable.');
  if (!configuration.sources.some(s => s.id === binding.sourceId) && !(await context.db.doc('sources/' + binding.sourceId).get()).exists) throw new Error('Unknown binding source.');
}
if (context.apply) await context.db.runTransaction(async transaction => {
  const references = configuration.sources.map(s => context.db.doc('sources/' + s.id));
  const existing = await Promise.all(references.map(ref => transaction.get(ref)));
  configuration.sources.forEach((source, i) => transaction.set(references[i], { ...existing[i].data(), ...source, origin: 'audit' }));
  configuration.bindings.forEach(binding => transaction.set(context.db.doc('source_bindings/' + binding.id), { ...binding, origin: 'audit' }));
});
console.log(JSON.stringify({ mode: context.apply ? 'applied' : 'dry-run', sources: configuration.sources.length, bindings: configuration.bindings.length }));
