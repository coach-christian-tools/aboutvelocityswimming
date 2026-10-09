import { createClient } from "@supabase/supabase-js";
export function adminDatabase() {
  const args = process.argv.slice(2),
    option = (name) =>
      args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    project = option("--project"),
    database = option("--database");
  if (!url || !project || database !== "velocity-v2")
    throw new Error(
      "Supply SUPABASE_URL, --project <backend-ref> and --database velocity-v2 explicitly.",
    );
  const parsed = new URL(url),
    actual = ["localhost", "127.0.0.1"].includes(parsed.hostname)
      ? "127"
      : parsed.hostname.split(".")[0];
  if (actual !== project)
    throw new Error(
      "The supplied backend project does not match SUPABASE_URL.",
    );
  if (
    args.includes("--apply") &&
    (option("--confirm-project") !== project ||
      option("--confirm-database") !== database)
  )
    throw new Error(
      "Writes require matching project and dataset confirmations.",
    );
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret)
    throw new Error(
      "Supply the server-only Supabase key through the environment.",
    );
  const client = createClient(url, secret, { auth: { persistSession: false } });
  const snap = (path, data) => ({
    id: path.split("/").at(-1),
    ref: document(path),
    exists: data !== null,
    data: () => data,
  });
  const read = async (path, filters = [], size = 1000, after = null) => {
    const { data, error } = await client.rpc("query_records", {
      collection_path: path,
      filters,
      page_size: size,
      after_id: after,
    });
    if (error) throw error;
    return {
      docs: (data ?? []).map((r) => snap(r.path, r.data)),
      size: data?.length ?? 0,
      empty: !data?.length,
    };
  };
  function document(path) {
    return {
      path,
      id: path.split("/").at(-1),
      collection: (name) => collection(path + "/" + name),
      get: async () => {
        const parts = path.split("/");
        const { data, error } = await client.rpc("query_records", {
          collection_path: parts.slice(0, -1).join("/"),
          record_id: parts.at(-1),
          page_size: 1,
        });
        if (error) throw error;
        return snap(path, data?.[0]?.data ?? null);
      },
      set: async (data) =>
        transaction(async (tx) => tx.set(document(path), data)),
      update: async (data) =>
        transaction(async (tx) => {
          const before = await tx.get(document(path));
          tx.set(document(path), { ...before.data(), ...data });
        }),
      delete: async () => transaction(async (tx) => tx.delete(document(path))),
    };
  }
  function collection(path, filters = [], size = 1000, after = null) {
    return {
      path,
      doc: (id) => document(path + "/" + (id ?? crypto.randomUUID())),
      where: (field, op, value) =>
        collection(path, [...filters, { field, op, value }], size, after),
      orderBy: () => collection(path, filters, size, after),
      limit: (n) => collection(path, filters, n, after),
      startAfter: (cursor) =>
        collection(
          path,
          filters,
          size,
          typeof cursor === "string" ? cursor : cursor.id,
        ),
      get: () => read(path, filters, size, after),
      listDocuments: async () => (await read(path)).docs.map((d) => d.ref),
    };
  }
  async function transaction(work) {
    const reads = new Map(),
      writes = new Map();
    const tx = {
      get: async (ref) => {
        if (!ref.id) return ref.get();
        const row = await ref.get();
        reads.set(ref.path, row.exists ? row.data() : null);
        return row;
      },
      getAll: async (...refs) => Promise.all(refs.map((r) => tx.get(r))),
      set: (ref, value) => writes.set(ref.path, value),
      create: (ref, value) => writes.set(ref.path, value),
      update: (ref, value) => {
        if (!reads.has(ref.path)) throw new Error("Read before updating.");
        writes.set(ref.path, { ...reads.get(ref.path), ...value });
      },
      delete: (ref) => writes.set(ref.path, null),
    };
    const result = await work(tx);
    for (const path of writes.keys())
      if (!reads.has(path)) {
        const row = await document(path).get();
        reads.set(path, row.exists ? row.data() : null);
      }
    const { error } = await client.rpc("collect_records", {
      reads: [...reads].map(([path, before]) => ({ path, before })),
      writes: [...writes].map(([path, after]) => ({ path, after })),
    });
    if (error) throw error;
    return result;
  }
  const db = {
    exportPage: async (after) => {
      const { data, error } = await client.rpc("export_records", {
        after_path: after,
      });
      if (error) throw error;
      return data;
    },
    doc: document,
    collection,
    runTransaction: transaction,
    getAll: async (...refs) => Promise.all(refs.map((r) => r.get())),
    batch: () => {
      const tasks = [];
      return {
        set: (ref, value) => tasks.push((tx) => tx.set(ref, value)),
        update: (ref, value) => tasks.push((tx) => tx.update(ref, value)),
        delete: (ref) => tasks.push((tx) => tx.delete(ref)),
        commit: () =>
          transaction(async (tx) => {
            for (const task of tasks) task(tx);
          }),
      };
    },
  };
  return { db, client, project, database, apply: args.includes("--apply") };
}
