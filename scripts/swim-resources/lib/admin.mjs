import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

export function adminDatabase() {
  const args = process.argv.slice(2);
  const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const project = args.includes('--project') ? option('--project') : undefined;
  if (!project || project.startsWith('--')) throw new Error('Supply --project <firebase-project-id> explicitly.');
  if (args.includes('--apply') && option('--confirm-project') !== project) {
    throw new Error('For writes, also supply --confirm-project with the same project ID.');
  }
  const database = option('--database');
  if (!database || (database !== '(default)' && !/^[a-z][a-z0-9-]{2,62}$/.test(database))) throw new Error('Supply --database <id> explicitly.');
  if (args.includes('--apply') && option('--confirm-database') !== database) throw new Error('Writes require matching --confirm-database.');
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    if (!project.startsWith('demo-')) throw new Error('Emulators require a demo project.');
    if (!/^(127[.]0[.]0[.]1|localhost):[0-9]+$/.test(process.env.FIRESTORE_EMULATOR_HOST) || (process.env.STORAGE_EMULATOR_HOST && !/^(http:\/\/)?(127[.]0[.]0[.]1|localhost):[0-9]+$/.test(process.env.STORAGE_EMULATOR_HOST))) throw new Error('Emulator verification requires local Firestore and Storage hosts.');
    return { db: new Firestore({ projectId: project, databaseId: database }), project, database, apply: args.includes('--apply'), storageOptions: { projectId: project }, getAccessToken: async () => 'emulator' };
  }
  if (process.env.STORAGE_EMULATOR_HOST) throw new Error('Do not mix live Firestore with emulated Storage.');
  const key = args.includes('--key') ? option('--key') : undefined;
  if (args.includes('--key') && (!key || key.startsWith('--'))) throw new Error('Supply a path after --key.');
  if (args.includes('--firebase-cli')) {
    if (key) throw new Error('Choose either --key or --firebase-cli.');
    // Reuse the existing CLI login without printing or copying credentials.
    const executable = realpathSync(execFileSync('which', ['firebase'], { encoding: 'utf8' }).trim());
    const cliAuth = createRequire(executable)('../auth.js');
    const account = cliAuth.getGlobalDefaultAccount();
    if (!account?.user?.email?.endsWith('@velocity-swimming.com')) throw new Error('Firebase CLI must be signed into the Velocity coach account.');
    const { GoogleAuth, OAuth2Client } = createRequire(import.meta.url)('google-auth-library');
    const client = new OAuth2Client();
    client.refreshHandler = async () => {
      const token = await cliAuth.getAccessToken(account.tokens.refresh_token, account.tokens.scopes ?? ['https://www.googleapis.com/auth/cloud-platform']);
      return { access_token: token.access_token, expiry_date: token.expires_at ?? Date.now() + 3600000 };
    };
    // Storage's auth dependency expects plain header objects; Firestore's newer
    // auth client returns Headers. Reuse the login through each SDK's own client.
    const { OAuth2Client: StorageOAuth2Client } = createRequire(createRequire(import.meta.url).resolve('@google-cloud/storage'))('google-auth-library');
    const storageClient = new StorageOAuth2Client();
    storageClient.refreshHandler = client.refreshHandler;
    return { db: new Firestore({ projectId: project, databaseId: database, auth: new GoogleAuth({ projectId: project, authClient: client }) }), project, database, apply: args.includes('--apply'), storageOptions: { projectId: project, authClient: storageClient }, getAccessToken: async () => (await client.getAccessToken()).token };
  }
  const credential = key ? cert(JSON.parse(readFileSync(key, 'utf8'))) : applicationDefault();
  const app = initializeApp({ credential, projectId: project });
  return { db: getFirestore(app, database), project, database, apply: args.includes('--apply'), storageOptions: key ? { projectId: project, keyFilename: key } : { projectId: project }, getAccessToken: async () => (await credential.getAccessToken()).access_token };
}
