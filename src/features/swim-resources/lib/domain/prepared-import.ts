import type { ImportKind } from './import-batch';

export interface PreparedImportSummary {
  file: string;
  id: string;
  collectedAt: string;
  label: string;
  observations: number;
  counts: Record<ImportKind, number>;
  held: number;
  unresolved: number;
}
