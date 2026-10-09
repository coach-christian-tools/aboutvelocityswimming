import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const backend = fileURLToPath(new URL('firebase/workshare/', root));
const cli = fileURLToPath(new URL('node_modules/firebase-tools/lib/bin/firebase.js', root));
const modes = {
  'deploy:functions': ['deploy', '--only', 'functions'],
  'deploy:rules': ['deploy', '--only', 'firestore:rules'],
  'emulators:start': ['emulators:start', '--only', 'firestore,functions,auth'],
  'emulators:exec': ['emulators:exec', '--only', 'firestore,functions,auth',
    `"${process.execPath}" --test "${fileURLToPath(new URL('tests/workshare/invitations.emulator.test.mjs', root))}"`],
};
const mode = process.argv[2];
if (!Object.hasOwn(modes, mode) || process.argv.length !== 3) {
  throw new Error('Choose deploy:functions, deploy:rules, emulators:start, or emulators:exec. Project overrides are intentionally unsupported.');
}
const project = mode.startsWith('deploy:') ? 'velocityworkshareportal' : 'demo-velocityworkshare';
const result = spawnSync(process.execPath, [cli, ...modes[mode], '--config', 'firebase.json', '--project', project], {
  cwd: backend, env: process.env, stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
