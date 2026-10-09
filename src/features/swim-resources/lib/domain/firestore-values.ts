

/** Convert Firestore values without serializing client credentials or SDK internals. */
export function normalizeFirestoreValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.map(normalizeFirestoreValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeFirestoreValue(item)]));
  return value;
}

export function summaryValue(value: unknown): string {
  if (value === undefined) return '—';
  const normalized = normalizeFirestoreValue(value);
  if (normalized === null) return 'null';
  if (typeof normalized === 'object' && !Array.isArray(normalized)) {
    const data = normalized as Record<string, unknown>;
    if (data._type === 'timestamp') return String(data.iso);
    if (data._type === 'coordinates') return `${data.latitude}, ${data.longitude}`;
    if (data._type === 'reference') return String(data.path);
    if (data._type === 'bytes') return 'Binary data';
    return `{${Object.keys(data).length} fields}`;
  }
  if (Array.isArray(normalized)) return `[${normalized.length} items]`;
  return String(normalized);
}
