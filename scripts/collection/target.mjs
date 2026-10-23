/** Prepared race batches identify their exact database project before staging. */
export function assertCollectionTarget(batch, endpoint) {
  const prepared = batch.evidence?.sourceManifestRequired === true || batch.evidence?.inputHashes !== undefined;
  if (prepared) {
    if (batch.evidence.baselineComplete !== true) {
      throw new Error("Offline race proposals require a verified complete baseline before staging.");
    }
    const age = Date.now() - Date.parse(batch.evidence.baselineCapturedAt);
    if (!Number.isFinite(age) || age < -300_000 || age > 24 * 3600_000) {
      throw new Error("Prepared race baseline is stale; refresh and reprepare before staging.");
    }
    if (!["sources", "baseline", "mappings", "code", "parser", "relayHelper"].every(
      (key) => /^[a-f0-9]{64}$/.test(batch.evidence.inputHashes?.[key] ?? ""),
    )) {
      throw new Error("Prepared race batch is missing its input provenance hashes.");
    }
    const counts = batch.evidence.baselineCounts;
    if (!counts || !["teams", "meets", "athletes", "swims", "relay_results"].every(
      (name) => Number.isSafeInteger(counts[name]) && counts[name] >= 0,
    )) throw new Error("Prepared race batch requires verified baseline collection counts.");
    if (!/^[a-f0-9]{64}$/.test(batch.evidence.baselineRecordsSha256 ?? "")) {
      throw new Error("Prepared race batch requires its complete canonical inventory hash.");
    }
    if (batch.evidence.identityGuard?.version !== 1 || !/^\d+$/.test(batch.evidence.identityGuard?.revision ?? "")) {
      throw new Error("Prepared race batch requires the consistent private export revision.");
    }
    if (!["whole-catalog", "pilot"].includes(batch.evidence.catalogScope)) {
      throw new Error("Prepared race batch must identify whole-catalog or explicit pilot scope.");
    }
  }
  const project = batch.evidence?.project;
  if (project === undefined && !prepared) return; // Existing catalog batches keep their contract.
  if (typeof project !== "string" || !project) {
    throw new Error("Prepared collection requires an explicit project target.");
  }
  const parsed = new URL(endpoint);
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("Collection destination must be the exact database base URL.");
  }
  const hostname = parsed.hostname;
  const local = ["127.0.0.1", "localhost"].includes(hostname);
  if (local && parsed.protocol === "http:" && parsed.port === "54321" && project === "local:aboutvelocityswimming") return;
  if (!local && parsed.origin === `https://${project}.supabase.co`) return;
  throw new Error("Prepared batch project differs from the configured collection destination.");
}
