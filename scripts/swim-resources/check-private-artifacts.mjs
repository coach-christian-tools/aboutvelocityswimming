import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const root = process.cwd();
async function traceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map(entry => entry.isDirectory() ? traceFiles(join(directory, entry.name)) : Promise.resolve(entry.name.endsWith('.nft.json') ? [join(directory, entry.name)] : [])));
  return groups.flat();
}
const traces = await traceFiles(join(root, '.next', 'server'));
for (const entry of await readdir(join(root, '.next'))) if (entry.endsWith('.nft.json')) traces.push(join(root, '.next', entry));
if (!traces.length) throw new Error('No production file traces found. Run the build first.');
const exposed = new Set();
for (const trace of traces) {
  const { files } = JSON.parse(await readFile(trace, 'utf8'));
  for (const file of files) {
    const path = relative(root, resolve(trace, '..', file)).split('\\').join('/');
    if (path.startsWith('backups/') || /^db_.*\.json$/.test(path) || path === 'export.csv' || /^scripts\/(?:[^/]+\/)*serviceAccountKey[^/]*\.json$/.test(path) || /^\.env[^/]*$/.test(path)) exposed.add(path);
  }
}
if (exposed.size) throw new Error('Private local files appear in production traces: ' + [...exposed].join(', '));
console.log('Production file traces exclude private local data.');
