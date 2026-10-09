import {dirname,join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {adminDatabase} from './lib/admin.mjs';
import {archiveStorage,hashBytes,privatePath} from './lib/evidence-archive.mjs';
import {verifyArchive,restoreArchive} from './lib/dataset-archive.mjs';
const args=process.argv.slice(2),option=k=>args[args.indexOf(k)+1];
if(args.includes('--help')){console.log('restore-archive --project 127 --database velocity-v2 --manifest backups/<folder>/dataset.json [--apply --confirm-project 127 --confirm-database velocity-v2] (empty local backend only)');process.exit(0);}
const context=adminDatabase();if(context.project!=='127'||!['localhost','127.0.0.1'].includes(new URL(process.env.SUPABASE_URL??process.env.NEXT_PUBLIC_SUPABASE_URL).hostname))throw new Error('Restoration requires an empty local backend.');
const path=privatePath(option('--manifest')),archive=JSON.parse(await readFile(path,'utf8'));verifyArchive(archive);
if(context.apply){if((await context.db.exportPage(null)).length)throw new Error('Restore requires an empty disposable database.');const storage=archiveStorage(context);for(const file of archive.files??[]){const bytes=await readFile(privatePath(join(dirname(path),'files',file.hash)));if(hashBytes(bytes)!==file.hash||bytes.length!==file.size)throw new Error('File checksum mismatch.');await storage.bucket(file.bucket).file(file.object).save(bytes);if(hashBytes((await storage.bucket(file.bucket).file(file.object).download())[0])!==file.hash)throw new Error('Restored file checksum mismatch.');}}
console.log(JSON.stringify({mode:context.apply?'restored-and-verified':'dry-run',records:context.apply?await restoreArchive(context.db,archive):archive.entries.length,fingerprint:archive.fingerprint}));
