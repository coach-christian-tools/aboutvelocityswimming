import { importDirectory } from '@/features/swim-resources/lib/domain/database-target';
import { constants } from 'node:fs';
import { open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { IMPORT_COLLECTIONS, parseImportBatch } from '@/features/swim-resources/lib/domain/import-batch';
import type { ImportBatch } from '@/features/swim-resources/lib/domain/import-batch';
import type { PreparedImportSummary } from '@/features/swim-resources/lib/domain/prepared-import';

const pendingDirectory = () => join(process.cwd(), importDirectory(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_ATTENDANCE_FIREBASE_PROJECT_ID || 'unconfigured', process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID || '(default)'), 'pending');

export async function readPreparedImport(file: string, directory = pendingDirectory()): Promise<ImportBatch> {
  if (!/^[a-zA-Z0-9_-]{1,128}\.json$/.test(file)) throw new Error('Invalid prepared import name.');
  // Reject symlinks as well as traversal; only bounded regular JSON files are readable.
  const handle = await open(join(directory, file), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 4 * 1024 * 1024) throw new Error('Invalid prepared import file.');
    const batch = parseImportBatch(await handle.readFile('utf8'));
    if (directory === pendingDirectory() && (batch.target.project !== (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_ATTENDANCE_FIREBASE_PROJECT_ID) || batch.target.database !== process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID)) throw new Error('Batch belongs to another database.');
    return batch;
  } finally {
    await handle.close();
  }
}

export async function listPreparedImports(directory = pendingDirectory()): Promise<{ batches: PreparedImportSummary[]; skipped: number }> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { batches: [], skipped: 0 };
    throw error;
  }
  const batches: PreparedImportSummary[] = [];
  let skipped = 0;
  for (const entry of entries.filter(entry => entry.name.endsWith('.json'))) {
    if (!entry.isFile()) { skipped++; continue; }
    try {
      const batch = await readPreparedImport(entry.name, directory);
      const counts = Object.fromEntries(Object.keys(IMPORT_COLLECTIONS).map(kind => [kind, 0])) as Record<keyof typeof IMPORT_COLLECTIONS, number>;
      for (const row of batch.rows) counts[row.kind]++;
      const kinds = Object.values(counts).filter(count => count > 0).length;
      const label = kinds > 1 ? 'Combined updates' : counts.athlete ? 'Roster updates' : counts.meet ? 'Regional meet opportunities' : counts.swim ? 'Swimmer results' : counts.team ? 'Team updates' : counts.person ? 'People updates' : counts.venue ? 'Venue updates' : counts.document ? 'Document updates' : counts.standard ? 'Standards updates' : 'Source review';
      batches.push({ file: entry.name, id: batch.id, collectedAt: batch.collectedAt, label, observations: batch.rows.length, counts, held: batch.rows.filter(row => !row.verified || row.holdReason).length, unresolved: batch.unresolved.length });
    } catch { skipped++; }
  }
  return { batches: batches.sort((a, b) => b.collectedAt.localeCompare(a.collectedAt) || a.label.localeCompare(b.label)), skipped };
}
