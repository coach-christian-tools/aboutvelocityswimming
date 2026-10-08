import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { workshareEmulatorEnv } from './emulator-env.mjs';

const root = new URL('../../', import.meta.url);
const child = spawn(process.execPath, [fileURLToPath(new URL('node_modules/next/dist/bin/next', root)), 'dev', ...process.argv.slice(2)], {
  cwd: fileURLToPath(root), stdio: 'inherit', env: { ...process.env, ...workshareEmulatorEnv },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
