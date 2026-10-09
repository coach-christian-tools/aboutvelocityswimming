// No history backup: the coach explicitly authorized permanent history removal.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { adminDatabase } from './lib/admin.mjs';
import { inspectAssistantHistory, deleteAssistantHistory } from './lib/assistant-cleanup.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('node scripts/swim-resources/cleanup-ptolemy.mjs --project <id> --database "(default)" [--firebase-cli | --key <key.json>] [--apply --confirm-project <id> --confirm-database "(default)" --writes-disabled]');
  process.exit(0);
}
const { db, project, database, apply, getAccessToken } = adminDatabase();
if (database !== '(default)') throw new Error('History cleanup is restricted to the original database.');
const configured = JSON.parse(readFileSync('.firebaserc', 'utf8')).projects.default;
const environment = readFileSync('.env.local', 'utf8').match(/^NEXT_PUBLIC_FIREBASE_PROJECT_ID\s*=\s*["']?([^\s"']+)/m)?.[1];
if (configured !== project || environment !== project) throw new Error('Explicit project must match both .firebaserc and the app environment.');
if (apply && !args.includes('--writes-disabled')) throw new Error('Disable hosted assistant writes first, then supply --writes-disabled.');
const before = await inspectAssistantHistory(db);
console.log(JSON.stringify({ project, mode: apply ? 'delete' : 'dry-run', conversationPaths: before.parents.length, messageDocuments: before.owned.length, collections: before.collections }));
if (!apply) process.exit(0);
// Verify the actual hosted barrier, rather than trusting the command-line flag.
const headers = { authorization: 'Bearer ' + await getAccessToken() };
const releaseResponse = await fetch('https://firebaserules.googleapis.com/v1/projects/' + project + '/releases/cloud.firestore', { headers });
if (!releaseResponse.ok) throw new Error('Cannot verify the deployed Firestore release.');
const release = await releaseResponse.json();
const rulesResponse = await fetch('https://firebaserules.googleapis.com/v1/' + release.rulesetName, { headers });
if (!rulesResponse.ok) throw new Error('Cannot verify the deployed ruleset.');
const rules = await rulesResponse.json();
const hosted = rules.source.files.find(file => file.name === 'firestore.rules')?.content;
if (hosted?.trim() !== readFileSync('firestore.rules', 'utf8').trim() || !hosted.includes('allow create, update: if false')) throw new Error('Publish the tested assistant-write barrier before history deletion.');
// recursiveDelete also visits descendants of nonexistent parent documents.
await deleteAssistantHistory(db);
const after = await inspectAssistantHistory(db);
if (after.parents.length || after.owned.length) throw new Error('History cleanup incomplete; remaining parent paths or orphan messages found. Re-run safely.');
mkdirSync(`backups/archives/${project}/${database}`,  { recursive: true, mode: 0o700 });
const report = { project, completedAt: new Date().toISOString(), before: { conversationPaths: before.parents.length, messageDocuments: before.owned.length, collections: before.collections }, after: { conversationPaths: 0, messageDocuments: 0, collections: after.collections } };
writeFileSync(`backups/archives/${project}/${database}/ptolemy-cleanup.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(JSON.stringify(report));
