/**
 * Recursively cleans objects/arrays before passing them to Firestore SDK methods
 * (updateDoc, setDoc, writeBatch.set, writeBatch.update).
 *
 * Why this is necessary:
 * The Firebase client JS SDK strictly prohibits `undefined` field values and will
 * throw "FirebaseError: Function updateDoc() called with invalid data. Unsupported field value: undefined".
 *
 * This function:
 * 1. Recursively omits any object properties where the value is `undefined`.
 * 2. Filters out any `undefined` entries in arrays.
 * 3. Preserves `null`, `Date`, Firestore Timestamps/GeoPoints, numbers, strings, and booleans.
 * 4. Preserves Firestore FieldValue sentinels (e.g., deleteField(), serverTimestamp(), increment()).
 */

import { DocumentReference, FieldValue, GeoPoint, Timestamp } from 'firebase/firestore';

function isFirestoreValue(obj: unknown): boolean {
  if (obj instanceof Timestamp || obj instanceof GeoPoint || obj instanceof DocumentReference || obj instanceof FieldValue) {
    return true;
  }
  // Duck-typing fallback for alternate builds/bundling where instanceof may fail
  // (Timestamp has toDate+toMillis; GeoPoint has latitude+longitude).
  const o = obj as { toDate?: unknown; toMillis?: unknown; latitude?: unknown; longitude?: unknown; constructor?: { name?: string } };
  return (
    typeof o.toDate === 'function' &&
    typeof o.toMillis === 'function' &&
    o.constructor?.name === 'Timestamp'
  ) || (
    typeof o.latitude === 'number' &&
    typeof o.longitude === 'number' &&
    o.constructor?.name === 'GeoPoint'
  );
}

function isFieldValueSentinel(obj: unknown): boolean {
  // FieldValue instances (deleteField, serverTimestamp, increment, arrayUnion...)
  // carry a `_methodName` string; private class fields (`#delegate`) are exposed
  // via `_delegate` on some SDK builds. Require `_methodName` to be a non-empty
  // string so ordinary user objects with coincidental keys aren't skipped.
  const o = obj as { _methodName?: unknown; _delegate?: unknown };
  return typeof o._methodName === 'string' && o._methodName.length > 0;
}

export function cleanFirestoreData<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as unknown as T;
  }

  // Preserve Dates
  if (obj instanceof Date) {
    return obj;
  }

  if (typeof obj === 'object') {
    // Preserve Firestore Timestamps, GeoPoints, references and FieldValue sentinels
    if (isFirestoreValue(obj) || isFieldValueSentinel(obj)) {
      return obj;
    }

    // Clean Arrays
    if (Array.isArray(obj)) {
      return obj
        .filter((item) => item !== undefined)
        .map((item) => cleanFirestoreData(item)) as unknown as T;
    }

    // Clean Objects
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== undefined) {
        cleaned[key] = cleanFirestoreData(value);
      }
    }
    return cleaned as T;
  }

  return obj;
}
