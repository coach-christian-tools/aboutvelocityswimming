import { hashBytes } from "./evidence-archive.mjs";
export function collectionCounts(entries) {
  const counts = {};
  for (const entry of entries) {
    const path = entry.path.split("/").slice(0, -1).join("/");
    counts[path] = (counts[path] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
  );
}

/** Files are verified before the completion manifest is published. */
export async function publishDatasetArchive(
  storage,
  bucket,
  prefix,
  manifest,
  readBytes,
) {
  verifyArchive(manifest);
  const uploaded = new Set();
  for (const file of manifest.files ?? []) {
    if (uploaded.has(file.hash)) continue;
    const bytes = await readBytes(file.hash);
    if (hashBytes(bytes) !== file.hash || bytes.length !== file.size)
      throw new Error("Archived file checksum mismatch.");
    const object = storage.bucket(bucket).file(`${prefix}/${file.hash}`);
    await object.save(bytes, {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentDisposition: "attachment" },
    });
    if (hashBytes((await object.download())[0]) !== file.hash)
      throw new Error("Cloud file verification failed.");
    uploaded.add(file.hash);
  }
  const bytes = Buffer.from(JSON.stringify(manifest)),
    object = storage.bucket(bucket).file(`${prefix}/dataset.json`);
  await object.save(bytes, {
    resumable: false,
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: {
      contentType: "application/json",
      contentDisposition: "attachment",
    },
  });
  if (hashBytes((await object.download())[0]) !== hashBytes(bytes))
    throw new Error("Cloud manifest verification failed.");
}
export function encodeValue(value) {
  if (value === null) return { type: "null" };
  if (value instanceof Date)
    return { type: "date", value: value.toISOString() };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array)
    return { type: "bytes", value: Buffer.from(value).toString("base64") };
  if (Array.isArray(value))
    return { type: "array", value: value.map(encodeValue) };
  if (typeof value === "object")
    return {
      type: "map",
      value: Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((k) => [k, encodeValue(value[k])]),
      ),
    };
  if (typeof value === "number" && !Number.isFinite(value))
    return { type: "number", value: String(value) };
  return { type: typeof value, value };
}
export function decodeValue(encoded) {
  switch (encoded.type) {
    case "null":
      return null;
    case "date":
      return new Date(encoded.value);
    case "bytes":
      return Buffer.from(encoded.value, "base64");
    case "array":
      return encoded.value.map(decodeValue);
    case "map":
      return Object.fromEntries(
        Object.entries(encoded.value).map(([k, v]) => [k, decodeValue(v)]),
      );
    case "number":
      return typeof encoded.value === "string"
        ? Number(encoded.value)
        : encoded.value;
    case "timestamp":
    case "reference":
    case "geopoint":
      throw new Error("Legacy Firebase archives cannot target Supabase.");
    default:
      return encoded.value;
  }
}
export async function exportDataset(db) {
  const entries = [];
  let cursor = null;
  while (true) {
    const page = await db.exportPage(cursor);
    for (const row of page) {
      const data = encodeValue(row.data);
      entries.push({
        path: row.path,
        data,
        hash: hashBytes(JSON.stringify(data)),
      });
    }
    if (page.length < 1000) break;
    cursor = page.at(-1).path;
  }
  return {
    version: 2,
    provider: "supabase",
    entries,
    counts: collectionCounts(entries),
    fingerprint: hashBytes(
      JSON.stringify(entries.map((e) => [e.path, e.hash])),
    ),
  };
}
export function verifyArchive(archive) {
  if (
    archive.version !== 2 ||
    archive.provider !== "supabase" ||
    !Array.isArray(archive.entries) ||
    new Set(archive.entries.map((e) => e.path)).size !== archive.entries.length
  )
    throw new Error("Invalid dataset archive.");
  if (
    archive.counts &&
    JSON.stringify(archive.counts) !==
      JSON.stringify(collectionCounts(archive.entries))
  )
    throw new Error("Archive collection counts mismatch.");
  if (
    archive.filesFingerprint &&
    hashBytes(
      JSON.stringify(
        archive.files
          .map((file) => [file.bucket, file.object, file.hash, file.size])
          .sort(),
      ),
    ) !== archive.filesFingerprint
  )
    throw new Error("Archived file manifest checksum mismatch.");
  for (const entry of archive.entries)
    if (
      typeof entry.path !== "string" ||
      entry.path.split("/").length % 2 ||
      entry.path
        .split("/")
        .some((part) => !part || part === "." || part === "..")
    )
      throw new Error("Invalid archive record path.");
  for (const entry of archive.entries)
    if (hashBytes(JSON.stringify(entry.data)) !== entry.hash)
      throw new Error("Archive record checksum mismatch.");
  if (
    hashBytes(JSON.stringify(archive.entries.map((e) => [e.path, e.hash]))) !==
    archive.fingerprint
  )
    throw new Error("Archive fingerprint mismatch.");
}
export async function restoreArchive(db, archive) {
  verifyArchive(archive);
  if ((await db.exportPage(null)).length)
    throw new Error("Restore requires an empty disposable database.");
  const order = [
    "teams",
    "people",
    "athletes",
    "venues",
    "meets",
    "families",
    "standards",
    "practice_sessions",
    "postings",
    "swims",
    "attendance",
    "registrations",
    "manual_hours",
    "documents",
    "work_descriptions",
    "sources",
  ];
  const priority = (e) =>
    order.indexOf(e.path.split("/")[0]) < 0
      ? 100
      : order.indexOf(e.path.split("/")[0]);
  const entries = archive.entries
    .filter(
      (e) =>
        !e.path.startsWith("public_athletes/") &&
        !/^athletes\/[^/]+\/bests\//.test(e.path) &&
        !e.path.startsWith("admins/"),
    )
    .sort((a, b) => priority(a) - priority(b) || a.path.localeCompare(b.path));
  for (let offset = 0; offset < entries.length; offset += 100) {
    await db.runTransaction(async (tx) => {
      for (const e of entries.slice(offset, offset + 100))
        tx.create(db.doc(e.path), decodeValue(e.data));
    });
  }
  const restored = await exportDataset(db);
  if (restored.fingerprint !== archive.fingerprint)
    throw new Error("Restored fingerprint mismatch.");
  return restored.entries.length;
}
export function storageReferences(value, references = new Set()) {
  if (value && typeof value === "object") {
    if (
      typeof value.bucket === "string" &&
      typeof value.storagePath === "string"
    )
      references.add(
        JSON.stringify({ bucket: value.bucket, object: value.storagePath }),
      );
    for (const child of Object.values(value))
      storageReferences(child, references);
  }
  return references;
}
