"use client";
import { clearTimesCache } from "./times-cache";
import Link from "next/link";
import { useEffect, useState, useMemo, useRef } from "react";
import { browserClient, hasBackendConfiguration } from "@/lib/supabase/client";
import { loadReviewBatches, applyReviewDecision, type QueueBatch, type ReviewQueueSnapshot } from "./load-review-batches";
import type { Database, Json } from "@/lib/supabase/database.types";
import { useAuth } from "@/features/workshare/contexts/auth";

import {
  athleteName,
  athleteProfiles,
  object,
  raceSummary,
  type ReviewWrite,
  type ReviewRead,
  reviewStats,
  reviewIssues,
} from "./review-summary";

type Batch = Database["public"]["Tables"]["collection_batches"]["Row"];
const divisions: Record<string, string> = {
  workshare: "Velocity Workshare",
  times: "Inland Empire Times",
  knowledge: "USA Swimming Knowledge Base",
};
function safeUrl(value: string) {
  try {
    return ["https:", "http:"].includes(new URL(value).protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}
function RaceDetails({ value, profiles }: { value: Json; profiles: Record<string, Json> }) {
  const race = raceSummary(value, profiles);
  return <>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[["Swimmer", race.swimmer], ["Event", race.event], ["Time", race.time], ["Course", race.course]].map(([label, text]) => <div key={label}><dt className="text-sm text-text-secondary">{label}</dt><dd className="font-semibold">{text}</dd></div>)}
    </dl>
    <p className="text-sm">{race.meet}{race.date ? ` · ${race.date}` : ""}</p>
  </>;
}
function KnowledgeDetails({ value }: { value: Json }) {
  const entry = object(value);
  const text = (key: string) => typeof entry[key] === "string" ? entry[key] as string : "";
  const relationships = Array.isArray(entry.relationships) ? entry.relationships : [];
  const contacts = Array.isArray(entry.contacts) ? entry.contacts : [];
  const sources = Array.isArray(entry.sources) ? entry.sources : [];
  const gaps = Array.isArray(entry.gaps) ? entry.gaps : [];
  const website = safeUrl(text("website"));
  return <div className="space-y-3 break-words">
    <p className="text-sm">{text("organizationType") || text("kind")}{text("abbreviation") ? ` · ${text("abbreviation")}` : ""}</p>
    {website && <a className="underline break-all" href={website} target="_blank" rel="noopener noreferrer">{website}</a>}
    {text("summary") && <p>{text("summary")}</p>}
    {text("geographicCoverage") && <p><strong>Geographic coverage:</strong> {text("geographicCoverage")}</p>}
    {text("coverageNote") && <p><strong>Collection coverage:</strong> {text("coverageNote")}</p>}
    {relationships.length > 0 && <div><h4 className="font-semibold">Relationships</h4><ul className="list-disc pl-5">{relationships.map((value, index) => {
      const relation = object(value);
      return <li key={index}>{String(relation.label ?? relation.type ?? "Related organization")}: {String(relation.name ?? relation.targetId ?? "Unresolved")}{typeof relation.note === "string" ? ` — ${relation.note}` : ""}</li>;
    })}</ul></div>}
    {contacts.length > 0 && <div><h4 className="font-semibold">Public organizational contacts</h4><ul className="list-disc pl-5">{contacts.map((value, index) => {
      const contact = object(value);
      return <li key={index}>{[contact.role, contact.name, contact.email, contact.phone, contact.address].filter(item => typeof item === "string" && item).join(" · ")}{typeof contact.url === "string" && safeUrl(contact.url) && <> · <a className="underline" href={safeUrl(contact.url)} target="_blank" rel="noopener noreferrer">Contact page</a></>}</li>;
    })}</ul></div>}
    {gaps.length > 0 && <div className="rounded border border-amber-500 p-3"><h4 className="font-semibold">Gaps and source conflicts</h4><ul className="list-disc pl-5">{gaps.map((gap, index) => <li key={index}>{typeof gap === "string" ? gap : "See source evidence"}</li>)}</ul></div>}
    {sources.length > 0 && <div><h4 className="font-semibold">Sources checked</h4><ul className="list-disc pl-5">{sources.map((value, index) => {
      const source = object(value);
      const url = typeof source.url === "string" ? safeUrl(source.url) : undefined;
      return <li key={index}>{url ? <a className="underline" href={url} target="_blank" rel="noopener noreferrer">{String(source.title ?? source.url)}</a> : String(source.title ?? "Source")}{typeof source.checkedAt === "string" ? ` · ${source.checkedAt.slice(0, 10)}` : ""}{typeof source.note === "string" ? ` — ${source.note}` : ""}</li>;
    })}</ul></div>}
  </div>;
}
function PageButtons({ page, pages, disabled = false, label, onChange }: {
  page: number;
  pages: number;
  disabled?: boolean;
  label: string;
  onChange: (page: number) => void;
}) {
  return <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label={label}>
    <button className="rounded border px-3 py-2 disabled:opacity-50" disabled={disabled || page === 0} onClick={() => onChange(page - 1)}>Previous</button>
    {Array.from({ length: pages }, (_, index) => <button
      key={index}
      aria-label={`Go to page ${index + 1}`}
      aria-current={index === page ? "page" : undefined}
      disabled={disabled}
      className={`min-w-9 rounded border px-3 py-2 disabled:opacity-50 ${index === page ? "border-primary-blue bg-primary-blue font-semibold text-primary-ink" : ""}`}
      onClick={() => onChange(index)}
    >{index + 1}</button>)}
    <button className="rounded border px-3 py-2 disabled:opacity-50" disabled={disabled || page + 1 >= pages} onClick={() => onChange(page + 1)}>Next</button>
  </nav>;
}
function Records({ writes, reads }: { writes: Json; reads: Json }) {
  const changes = writes as ReviewWrite[];
  const before = reads as ReviewRead[];
  const [current, setCurrent] = useState<Record<string, Json>>({});
  const [lookupError, setLookupError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const athleteIds = useMemo(
    () => [
      ...new Set(
        [
          ...changes.map((item) => item.after),
          ...before.map((item) => item.before),
        ]
          .map((value) => object(value).athleteId)
          .filter((id): id is string => typeof id === "string"),
      ),
    ],
    [changes, before],
  );
  useEffect(() => {
    let active = true;
    if (!athleteIds.length) return;
    void browserClient()
      .from("athletes")
      .select("id,data")
      .in("id", athleteIds)
      .then(({ data, error }) => {
        if (!active) return;
        setLookupError(
          error
            ? "Some athlete names could not be loaded. Batch profiles are still shown; unresolved swimmers are labeled by ID."
            : "",
        );
        setCurrent(
          Object.fromEntries((data ?? []).map((row) => [row.id, row.data])),
        );
      });
    return () => {
      active = false;
    };
  }, [athleteIds]);
  const proposedProfiles = athleteProfiles(changes, before, current, true);
  const previousProfiles = athleteProfiles(changes, before, current, false);
  const previousByPath = new Map(
    before.map((item) => [item.path, item.before]),
  );
  const rows = changes.map((change) => {
    const previous = previousByPath.get(change.path) ?? null;
    const value = change.after ?? previous;
    const swim = change.path.startsWith("swims/");
    const knowledge = change.path.startsWith("knowledge_entries/");
    const action =
      change.after === null ? "Remove" : previous === null ? "Add" : "Update";
    const name = change.path.startsWith("athletes/")
      ? athleteName(value)
      : knowledge
        ? object(value).title
        : object(value).name;
    const race = swim
      ? raceSummary(
          value,
          change.after === null ? previousProfiles : proposedProfiles,
        )
      : null;
    const label = race
      ? `${race.swimmer} · ${race.event} · ${race.time} · ${race.course}`
      : typeof name === "string" && name
        ? name
        : change.path;
    const issues = reviewIssues(value);
    return { change, previous, swim, knowledge, action, label, issues };
  });
  const filtered = rows.filter(
    (row) =>
      (filter === "all" ||
        (filter === "attention"
          ? row.issues.length > 0 || row.action === "Remove"
          : row.action.toLowerCase() === filter)) &&
      `${row.label} ${row.change.path} ${row.issues.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 25) - 1),
  );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Search records"
          placeholder="Search records or conflicts…"
          className="min-w-0 flex-1 rounded border p-2 text-sm"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Filter records"
          className="rounded border p-2 text-sm"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setPage(0);
          }}
        >
          <option value="all">All records ({rows.length})</option>
          <option value="attention">
            Needs attention (
            {
              rows.filter((row) => row.issues.length || row.action === "Remove")
                .length
            }
            )
          </option>
          <option value="add">Additions</option>
          <option value="update">Updates</option>
          <option value="remove">Removals</option>
        </select>
      </div>
      <p className="text-xs text-text-secondary">
        {filtered.length
          ? `${currentPage * 25 + 1}–${Math.min((currentPage + 1) * 25, filtered.length)} of ${filtered.length} records`
          : "No records match."}{" "}
        · Expand a record to inspect its fields.
      </p>
      {filtered.length > 25 && <PageButtons page={currentPage} pages={Math.ceil(filtered.length / 25)} label="Record pages" onChange={setPage} />}
      {lookupError && <p role="alert">{lookupError}</p>}
      {filtered
        .slice(currentPage * 25, (currentPage + 1) * 25)
        .map(({ change, previous, swim, knowledge, action, label, issues }) => {
          return (
            <details
              key={change.path}
              className="rounded border px-3 py-2"
              aria-label={`${action} ${label}`}
            >
              <summary className="cursor-pointer text-sm break-words">
                <span
                  className={`mr-2 inline-block rounded px-2 py-0.5 text-xs font-semibold ${action === "Remove" ? "bg-red-100 text-red-800" : action === "Update" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"}`}
                >
                  {action}
                </span>
                <span className="font-medium">{label}</span>
                {issues.length > 0 && (
                  <span className="ml-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                    {issues.length} gaps / source conflicts
                  </span>
                )}
              </summary>
              {issues.length > 0 && (
                <ul className="my-2 list-disc pl-5 text-sm text-amber-900">
                  {issues.map((issue, index) => (
                    <li key={index}>{issue}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 space-y-3">
                {swim && (
                  <RaceDetails
                    value={change.after ?? previous}
                    profiles={
                      change.after === null
                        ? previousProfiles
                        : proposedProfiles
                    }
                  />
                )}
                {knowledge && (
                  <KnowledgeDetails value={change.after ?? previous} />
                )}
                <details>
                  <summary className="cursor-pointer text-sm">
                    Compare changes and raw fields
                  </summary>
                  <p className="text-sm break-all">{change.path}</p>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    {[
                      {
                        label: "Current at collection",
                        value: previous,
                        profiles: previousProfiles,
                      },
                      {
                        label: "Proposed",
                        value: change.after,
                        profiles: proposedProfiles,
                      },
                    ].map((side) => (
                      <div key={side.label}>
                        <h4>{side.label}</h4>
                        {side.value === null ? (
                          <p>
                            {side.label === "Proposed"
                              ? "Record will be removed."
                              : "New record."}
                          </p>
                        ) : swim ? (
                          <RaceDetails
                            value={side.value}
                            profiles={side.profiles}
                          />
                        ) : knowledge ? (
                          <KnowledgeDetails value={side.value} />
                        ) : null}
                        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
                          {JSON.stringify(side.value, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            </details>
          );
        })}
      {filtered.length > 25 && (
        <PageButtons page={currentPage} pages={Math.ceil(filtered.length / 25)} label="Record pages" onChange={setPage} />
      )}
    </div>
  );
}
function BatchDetails({ id }: { id: string }) {
  const [expanded, setExpanded] = useState(false);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    void browserClient().from("collection_batches").select("*").eq("id", id).abortSignal(controller.signal).single()
      .then(({ data, error }) => {
        if (controller.signal.aborted) return;
        setError(error?.message ?? "");
        setBatch(error ? null : data);
      });
    return () => controller.abort();
  }, [id, expanded, revision]);
  return <details onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary className="cursor-pointer py-1 text-sm font-semibold">Review records, conflicts and source evidence</summary>
    {error ? <div role="alert"><p>{error}</p><button onClick={() => { setError(""); setRevision(value => value + 1); }}>Retry loading records</button></div> : !batch ? <p role="status">Loading batch records…</p> : <div className="mt-2 space-y-3">
      <a href={safeUrl(batch.source_url)} target="_blank" rel="noopener noreferrer" className="underline break-all">{batch.source_url}</a>
      <Records writes={batch.writes} reads={batch.reads} />
      <details><summary className="cursor-pointer">Source evidence</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(batch.evidence, null, 2)}</pre></details>
    </div>}
  </details>;
}
export default function ReviewQueue() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [snapshot, setSnapshot] = useState<ReviewQueueSnapshot | null>(null);
  const blockers = snapshot?.blockers ?? {};
  const loadController = useRef<AbortController | null>(null);
  const [status, setStatus] = useState("pending");
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (!isAdmin || !hasBackendConfiguration) return;
    loadController.current = controller;
    void loadReviewBatches(status, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setSnapshot(result);
      setError("");
      setLoading(false);
      setRefreshing(false);
    }).catch(cause => {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : typeof cause?.message === "string" ? cause.message : "Unable to load review batches.");

      setLoading(false);
      setRefreshing(false);
    });
    return () => controller.abort();
  }, [status, isAdmin, refresh]);
  useEffect(() => {
    const refreshOnReturn = () => { setRefreshing(true); setRefresh(value => value + 1); };
    window.addEventListener("focus", refreshOnReturn);
    return () => window.removeEventListener("focus", refreshOnReturn);
  }, []);
  const searchableBatches = useMemo(() => (snapshot?.batches ?? []).map(batch => ({
    batch,
    text: `${divisions[batch.division]} ${batch.scope} ${batch.source_url} ${JSON.stringify(batch.writes)}`.toLowerCase(),
  })), [snapshot]);
  const filteredBatches = useMemo(() => {
    const search = query.trim().toLowerCase();
    return searchableBatches.filter(item => !search || item.text.includes(search)).map(item => item.batch);
  }, [searchableBatches, query]);
  const total = filteredBatches.length;
  const currentOffset = Math.min(offset, Math.max(0, Math.ceil(total / 20) - 1) * 20);
  const pageControls = <PageButtons
    page={currentOffset / 20}
    pages={Math.max(1, Math.ceil(total / 20))}
    disabled={loading}
    label="Proposal pages"
    onChange={page => setOffset(page * 20)}
  />;
  async function decide(batch: QueueBatch, decision: string) {
    setBusy(batch.id);
    setError("");
    try {
      const response = await fetch("/api/collection/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: batch.id,
          decision,
          note: notes[batch.id] ?? "",
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to save decision.");
      clearTimesCache();
      // Cancel a background read that began before this successful decision.
      // Its stale response must not put the batch back into the queue.
      loadController.current?.abort();
      setRefreshing(false);
      setSnapshot(current => current ? applyReviewDecision(current, batch.id, decision, status, notes[batch.id] ?? "") : current);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save decision.",
      );
    } finally {
      setBusy(null);
    }
  }
  if (authLoading) return <p>Checking your account…</p>;
  if (!isAdmin)
    return (
      <p>
        Staff access is required. <Link href="/login">Sign in</Link>
      </p>
    );
  return (
    <section className="space-y-3">
      <p>
        Collected changes stay private until approved. A batch is applied
        together; changed records require a fresh collection.
        {status === "pending" || status === "held" ? " Teams, venues, and meets appear first, then swimmer profiles, then results. Within each group, oldest batches appear first." : ""}
      </p>
      <label className="block text-sm font-medium">
        Search batches
        <input type="search" className="mt-1 block w-full rounded border p-2" placeholder="Search batch, meet, swimmer, source or record…" value={query} onChange={event => { setQuery(event.target.value); setOffset(0); }} />
      </label>
      <div className="flex flex-wrap gap-4">
        <label>
          Status{" "}
          <select
            disabled={busy !== null}
            aria-label="Status"
            className="rounded border p-2"
            value={status}
            onChange={(event) => {
              setSnapshot(null);
              setStatus(event.target.value);
              setOffset(0);
              setLoading(true);
            }}
          >
            {["pending", "held", "approved", "declined"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            setRefreshing(true);
            setRefresh((value) => value + 1);
          }}
          disabled={loading || refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <p className="text-sm text-text-secondary">{total} matching batches · {status === "pending" || status === "held" ? "Prerequisites first; oldest ready batches first." : "Oldest batches first."}</p>
      {pageControls}
      {refreshing && !loading && <p role="status" className="text-sm text-text-secondary">Checking for changes…</p>}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading proposals…</p>
      ) : total === 0 ? (
        <p>{query.trim() ? "No batches match your search." : `No ${status} proposals.`}</p>
      ) : (
        filteredBatches.slice(currentOffset, currentOffset + 20).map((batch) => {
          const stats = reviewStats(
            batch.writes as ReviewWrite[],
            batch.reads as ReviewRead[],
          );
          return (
            <article
              key={batch.id}
              className="min-w-0 space-y-2 rounded-xl border p-3"
            >
              <h2 className="text-base font-semibold">
                {divisions[batch.division]}
              </h2>
              <p className="break-words text-sm font-medium">{batch.scope}</p>
              <p className="text-sm">
                Captured {new Date(batch.captured_at).toLocaleString()} ·{" "}
                {batch.coverage} coverage · {batch.status}
              </p>
              {(blockers[batch.id]?.length ?? 0) > 0 && <details className="rounded bg-amber-100 p-2 text-sm text-amber-900">
                <summary className="cursor-pointer font-medium">Waiting for {blockers[batch.id].length} prerequisite {blockers[batch.id].length === 1 ? "record" : "records"} · expand for approval order</summary>
                <ul className="mt-1 list-disc pl-5 break-words">{blockers[batch.id].map(message => <li key={message}>{message}</li>)}</ul>
              </details>}
              {["pending", "held"].includes(batch.status) ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ["approved", "Approve all changes"],
                      ["held", "Hold"],
                      ["declined", "Decline"],
                    ].map(([decision, label]) => (
                      <button
                        className={`rounded border px-3 py-2 text-sm disabled:opacity-50 ${decision === "approved" ? "border-primary-blue bg-primary-blue font-semibold text-primary-ink" : ""}`}
                        key={decision}
                        disabled={busy !== null || (decision === "approved" && (loading || (blockers[batch.id]?.length ?? 0) > 0))}
                        onClick={() => void decide(batch, decision)}
                      >
                        {busy === batch.id ? "Saving…" : label}
                      </button>
                    ))}
                  </div>
                  <details>
                    <summary className="cursor-pointer text-sm">
                      Review note{notes[batch.id] ? " · added" : " (optional)"}
                    </summary>
                    <label className="block">
                      Review note
                      <textarea
                        maxLength={4000}
                        className="mt-1 block w-full rounded border p-2"
                        value={notes[batch.id] ?? ""}
                        onChange={(event) =>
                          setNotes({ ...notes, [batch.id]: event.target.value })
                        }
                      />
                    </label>
                  </details>
                </>
              ) : (
                <p>
                  Decision: {batch.review_note || "No note"} ·{" "}
                  {batch.reviewed_at &&
                    new Date(batch.reviewed_at).toLocaleString()}
                </p>
              )}
              <p className="text-sm font-medium">
                {stats.total} records · {stats.added} additions ·{" "}
                {stats.updated} updates · {stats.removed} removals
              </p>
              {stats.attention > 0 && (
                <p className="rounded bg-amber-100 px-2 py-1 text-sm text-amber-900">
                  Needs attention: {stats.issues} {stats.issues === 1 ? "record" : "records"} with gaps / source
                  conflicts · {stats.removed} {stats.removed === 1 ? "removal" : "removals"}
                </p>
              )}
              <BatchDetails id={batch.id} />
            </article>
          );
        })
      )}
      {pageControls}
    </section>
  );
}
