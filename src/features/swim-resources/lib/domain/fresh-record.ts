import { canonicalEntity, ENTITY_COLLECTIONS, type EntityKind } from './entities.ts';
import { validateImportData, mergeImportPatch, type ImportKind } from './import-batch.ts';
import { canonicalMeet } from './meet.ts';
import type { Meet } from '../../types/schema';
/** Automatic reconciliation deliberately excludes roster, races and new entities. */
export function canonicalDirectory(kind: ImportKind, id: string, previous: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  if (!['team', 'person', 'venue', 'document', 'meet'].includes(kind)) throw new Error('This kind requires reviewed Import.');
  validateImportData(kind, patch);
  if (Object.hasOwn(ENTITY_COLLECTIONS, kind)) return canonicalEntity(kind as EntityKind, previous, patch, id);
  return canonicalMeet(previous, mergeImportPatch(previous, { ...patch, id }) as unknown as Meet) as unknown as Record<string, unknown>;
}
