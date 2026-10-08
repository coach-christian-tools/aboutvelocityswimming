import { readFile } from 'node:fs/promises';
import { adminDatabase } from './lib/admin.mjs';
import { privatePath } from './lib/evidence-archive.mjs';
import { reconcileBundle } from './lib/evidence-reconciler.mjs';
const args = process.argv.slice(2), option = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
if (args.includes('--help')) { console.log('reconcile-evidence --project <id> --database velocity-v2 --bundle backups/... --bucket <bucket> [--apply --confirm-project <id> --confirm-database velocity-v2]'); process.exit(0); }
const context = adminDatabase();
const bundle = JSON.parse(await readFile(privatePath(option('--bundle')), 'utf8'));
console.log(JSON.stringify({ mode: context.apply ? 'applied' : 'dry-run', ...await reconcileBundle(context, bundle, option('--bucket')) }));
