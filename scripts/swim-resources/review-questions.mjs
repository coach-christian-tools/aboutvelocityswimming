import { readFile } from 'node:fs/promises';
import { adminDatabase } from './lib/admin.mjs';
import { privatePath } from './lib/evidence-archive.mjs';
import { updateReviewQuestions } from './lib/review-questions.mjs';

const args = process.argv.slice(2), option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
if (args.includes('--help')) { console.log('review-questions --project <id> --database velocity-v2 --input backups/... [--apply --confirm-project <id> --confirm-database velocity-v2]'); process.exit(0); }
const context = adminDatabase(), manifest = JSON.parse(await readFile(privatePath(option('--input')), 'utf8'));
console.log(JSON.stringify({ mode: context.apply ? 'applied' : 'dry-run', ...await updateReviewQuestions(context, manifest) }));
