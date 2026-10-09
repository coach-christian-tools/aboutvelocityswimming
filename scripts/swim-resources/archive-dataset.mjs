import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {adminDatabase} from './lib/admin.mjs';
import {exportDataset,storageReferences} from './lib/dataset-archive.mjs';
import {archiveStorage,hashBytes,privatePath} from './lib/evidence-archive.mjs';
const args=process.argv.slice(2),option=k=>args[args.indexOf(k)+1];
if(args.includes('--help')){console.log('archive-dataset --project <Supabase-ref> --database velocity-v2 --out backups/<folder>');process.exit(0);}
const context=adminDatabase(),dir=privatePath(option('--out')),archive=await exportDataset(context.db),storage=archiveStorage(context),files=[];
await mkdir(join(dir,'files'),{recursive:true,mode:0o700});
const refs=new Set();for(const e of archive.entries)for(const ref of storageReferences(e.data))refs.add(ref);
// Encoded values are inspected after decoding to preserve literal field names.
const {decodeValue}=await import('./lib/dataset-archive.mjs');
for(const e of archive.entries)for(const ref of storageReferences(decodeValue(e.data)))refs.add(ref);
for(const ref of refs){const {bucket,object}=JSON.parse(ref),bytes=(await storage.bucket(bucket).file(object).download())[0],hash=hashBytes(bytes);await writeFile(join(dir,'files',hash),bytes,{mode:0o600});files.push({bucket,object,hash,size:bytes.length});}
archive.files=files;archive.filesFingerprint=hashBytes(JSON.stringify(files.map(f=>[f.bucket,f.object,f.hash,f.size]).sort()));archive.project=context.project;
await writeFile(join(dir,'dataset.json'),JSON.stringify(archive),{mode:0o600});console.log(JSON.stringify({records:archive.entries.length,files:files.length,fingerprint:archive.fingerprint}));
