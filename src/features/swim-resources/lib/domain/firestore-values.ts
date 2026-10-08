import { Bytes, DocumentReference, GeoPoint, Timestamp } from 'firebase/firestore';

/** Convert Firestore values without serializing client credentials or SDK internals. */
export function normalizeFirestoreValue(value: unknown): unknown {
  if (value instanceof Timestamp) return { _type: 'timestamp', iso: value.toDate().toISOString(), seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (value instanceof GeoPoint) return { _type: 'coordinates', latitude: value.latitude, longitude: value.longitude };
  if (value instanceof DocumentReference) return { _type: 'reference', path: value.path };
  if (value instanceof Bytes) return { _type: 'bytes', base64: value.toBase64() };
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
