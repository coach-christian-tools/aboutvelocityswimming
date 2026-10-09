import type { Json } from "../supabase/database.types";
/* eslint-disable @typescript-eslint/no-explicit-any */
// Registered record keys preserve existing provenance URLs while all persistence
// and filtering use relational Supabase projections. No Firebase SDK is used.
import { browserClient } from "../supabase/client";
export type DocumentData = Record<string, any>;
import { Instant } from "../instant";
export { Instant, Instant as Timestamp } from "../instant";
export const db = { provider: "supabase" as const, path: "" };
export interface Converter<T> {
  fromFirestore(snapshot: QueryDocumentSnapshot, options?: unknown): T;
  toFirestore(value: T): DocumentData;
}
export interface DocumentReference<T = DocumentData> {
  path: string;
  id: string;
  parent: CollectionReference<T>;
}
export interface CollectionReference<T = DocumentData> {
  path: string;
  converter?: Converter<T>;
  withConverter<U>(converter: Converter<U>): CollectionReference<U>;
}
export interface QueryDocumentSnapshot<T = DocumentData> {
  id: string;
  ref: DocumentReference<T>;
  data(): T;
  exists(): boolean;
}
export type SnapshotOptions = unknown;
export type QueryConstraint =
  | { kind: "where"; field: string; op: string; value: unknown }
  | { kind: "limit"; size: number }
  | { kind: "after"; id: string };
export interface RecordQuery<T = DocumentData> {
  path: string;
  constraints: QueryConstraint[];
  converter?: Converter<T>;
}
const pathOf = (base: { path?: string }, parts: string[]) =>
  [base.path, ...parts].filter(Boolean).join("/");
export function collection<T = DocumentData>(
  base: typeof db | DocumentReference,
  ...parts: string[]
): CollectionReference<T> {
  const path = pathOf(base, parts);
  return {
    path,
    withConverter<U>(converter: Converter<U>) {
      return { ...collection<U>(db, path), converter };
    },
  };
}
export function doc<T = DocumentData>(
  base: typeof db | CollectionReference<T> | DocumentReference,
  ...parts: string[]
): DocumentReference<T> {
  const path = pathOf(base, parts.length ? parts : [crypto.randomUUID()]);
  return {
    path,
    id: path.split("/").at(-1)!,
    parent: collection<T>(db, path.split("/").slice(0, -1).join("/")),
  };
}
export function where(
  field: string,
  op: string,
  value: unknown,
): QueryConstraint {
  return { kind: "where", field, op, value };
}
export function limit(size: number): QueryConstraint {
  return { kind: "limit", size };
}
export function startAfter(snapshot: QueryDocumentSnapshot): QueryConstraint {
  return { kind: "after", id: snapshot.id };
}
export function query<T>(
  base: CollectionReference<T>,
  ...constraints: QueryConstraint[]
): RecordQuery<T> {
  return { path: base.path, converter: base.converter, constraints };
}
function decode(value: any, root: string, key = ""): any {
  if (
    ["postings", "registrations", "manual_hours"].includes(root) &&
    ["date", "startTime", "endTime"].includes(key) &&
    typeof value === "string" &&
    /^\d{4}-\d\d-\d\dT/.test(value)
  )
    return Instant.fromDate(new Date(value));
  if (Array.isArray(value)) return value.map((v) => decode(v, root));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, decode(v, root, k)]),
    );
  return value;
}
export function snapshot<T = DocumentData>(
  path: string,
  value: DocumentData | null,
  converter?: Converter<T>,
): QueryDocumentSnapshot<T> {
  const result = {
    id: path.split("/").at(-1)!,
    ref: doc<T>(db, path),
    exists: () => value !== null,
    data: () => decode(value ?? undefined, path.split("/")[0]) as T,
  };
  if (converter) {
    const plain = result.data;
    result.data = () =>
      converter.fromFirestore({
        ...result,
        data: plain,
      } as QueryDocumentSnapshot);
  }
  return result;
}
async function request(body: unknown) {
  const response = await fetch("/api/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(result.error ?? "Unable to save data."), {
      code: result.code,
    });
  return result;
}
export async function getDoc<T>(
  reference: DocumentReference<T>,
): Promise<QueryDocumentSnapshot<T>> {
  const { data, error } = await browserClient().rpc("query_records", {
    collection_path: reference.parent.path,
    record_id: reference.id,
    page_size: 1,
  });
  if (error) throw error;
  return snapshot<T>(reference.path, (data?.[0]?.data as DocumentData) ?? null);
}
export const getDocFromServer = getDoc;
export async function getDocs<T = DocumentData>(
  target: CollectionReference<T> | RecordQuery<T>,
) {
  const constraints = "constraints" in target ? target.constraints : [];
  const { data, error } = await browserClient().rpc("query_records", {
    collection_path: target.path,
    filters: JSON.parse(
      JSON.stringify(constraints.filter((c) => c.kind === "where")),
    ) as Json,
    after_id: constraints.find((c) => c.kind === "after")?.id ?? undefined,
    page_size: constraints.find((c) => c.kind === "limit")?.size ?? 1000,
  });
  if (error) throw error;
  const docs: QueryDocumentSnapshot<T>[] = (data ?? []).map(
    (row: { path: string; data: Json }) =>
      snapshot<T>(row.path, row.data as DocumentData, target.converter),
  );
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (fn: (d: QueryDocumentSnapshot<T>) => void) => docs.forEach(fn),
  };
}
export const getDocsFromServer = getDocs;
export interface Transaction {
  get<T>(ref: DocumentReference<T>): Promise<QueryDocumentSnapshot<T>>;
  set<T>(
    ref: DocumentReference<T>,
    data: Partial<T>,
    options?: { merge?: boolean },
  ): Transaction;
  update(ref: DocumentReference, data: DocumentData): Transaction;
  delete(ref: DocumentReference): Transaction;
}
export async function runTransaction<T>(
  _db: typeof db,
  callback: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  const reads = new Map<string, DocumentData | null>(),
    writes = new Map<string, DocumentData | null>();
  const transaction: Transaction = {
    async get(ref) {
      const result = await getDoc(ref);
      reads.set(
        ref.path,
        result.exists() ? (result.data() as DocumentData) : null,
      );
      return result;
    },
    set(ref, value, options) {
      const before = reads.get(ref.path);
      writes.set(
        ref.path,
        options?.merge ? { ...before, ...value } : (value as DocumentData),
      );
      return transaction;
    },
    update(ref, value) {
      if (!reads.has(ref.path))
        throw new Error("Read a record before updating it.");
      writes.set(ref.path, { ...reads.get(ref.path), ...value });
      return transaction;
    },
    delete(ref) {
      writes.set(ref.path, null);
      return transaction;
    },
  };
  const result = await callback(transaction);
  // Include an existence check for every newly written key. Do not retry reviewed
  // snapshots automatically: a conflict requires the operator to review again.
  for (const path of writes.keys())
    if (!reads.has(path)) {
      const current = await getDoc(doc(db, path));
      reads.set(path, current.exists() ? current.data() : null);
    }
  await request({
    reads: [...reads].map(([path, before]) => ({ path, before })),
    writes: [...writes].map(([path, after]) => ({ path, after })),
  });
  window.dispatchEvent(new Event("velocity-data"));
  return result;
}
export async function addDoc<T>(
  target: CollectionReference<T>,
  value: Partial<T>,
) {
  const reference = doc(target);
  await runTransaction(db, async (tx) => {
    await tx.get(reference);
    tx.set(reference, value);
  });
  return reference;
}
export async function setDoc<T>(
  ref: DocumentReference<T>,
  value: Partial<T>,
  options?: { merge?: boolean },
) {
  return runTransaction(db, async (tx) => {
    await tx.get(ref);
    tx.set(ref, value, options);
  });
}
export async function updateDoc(ref: DocumentReference, value: DocumentData) {
  return runTransaction(db, async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists()) throw new Error("Record no longer exists.");
    tx.update(ref, value);
  });
}
export async function deleteDoc(ref: DocumentReference) {
  return runTransaction(db, async (tx) => {
    await tx.get(ref);
    tx.delete(ref);
  });
}
export function writeBatch(_db: typeof db) {
  const operations: ((tx: Transaction) => void)[] = [];
  const refs: DocumentReference[] = [];
  return {
    set(ref: DocumentReference, data: DocumentData) {
      refs.push(ref);
      operations.push((tx) => tx.set(ref, data));
    },
    update(ref: DocumentReference, data: DocumentData) {
      refs.push(ref);
      operations.push((tx) => tx.update(ref, data));
    },
    delete(ref: DocumentReference) {
      refs.push(ref);
      operations.push((tx) => tx.delete(ref));
    },
    async commit() {
      await runTransaction(db, async (tx) => {
        await Promise.all(refs.map((ref) => tx.get(ref)));
        operations.forEach((op) => op(tx));
      });
    },
  };
}
export function onSnapshot(
  target: DocumentReference,
  callback: (value: QueryDocumentSnapshot) => void,
  onError?: (error: Error) => void,
): () => void;
export function onSnapshot<T>(
  target: CollectionReference<T> | RecordQuery<T>,
  callback: (value: Awaited<ReturnType<typeof getDocs<T>>>) => void,
  onError?: (error: Error) => void,
): () => void;
export function onSnapshot(
  target: any,
  callback: (value: any) => void,
  onError?: (error: Error) => void,
) {
  let active = true;
  let running = false;
  const refresh = async () => {
    if (running) return;
    running = true;
    try {
      const value =
        "id" in target ? await getDoc(target) : await getDocs(target);
      if (active) callback(value);
    } catch (error) {
      if (active) onError?.(error as Error);
    } finally {
      running = false;
    }
  };
  void refresh();
  window.addEventListener("velocity-data", refresh);
  window.addEventListener("velocity-auth", refresh);
  const timer = setInterval(refresh, 15000);
  return () => {
    active = false;
    clearInterval(timer);
    window.removeEventListener("velocity-data", refresh);
    window.removeEventListener("velocity-auth", refresh);
  };
}
