import { readFile } from 'node:fs/promises';
/** Installed CLI initializes only default rules; explicitly protect named test DBs. */
export async function loadEmulatorRules(project, database, host = process.env.FIRESTORE_EMULATOR_HOST) {
  if (!project.startsWith('demo-') || !/^(127[.]0[.]0[.]1|localhost):[0-9]+$/.test(host ?? '')) throw new Error('Rule loading requires a local demo emulator.');
  const response = await fetch(`http://${host}/emulator/v1/projects/${project}:securityRules`, { method: 'PUT', body: JSON.stringify({ database: `projects/${project}/databases/${database}`, rules: { files: [{ content: await readFile('firestore.rules', 'utf8') }] } }) });
  if (!response.ok) throw new Error('Named emulator rules could not be loaded: ' + await response.text());
}
