"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, useMemo } from "react";
import { browserClient, hasBackendConfiguration } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/database.types";
import { useAuth } from "@/features/workshare/contexts/auth";

import { athleteName, athleteProfiles, object, raceSummary, type ReviewWrite, type ReviewRead } from "./review-summary";

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
function Records({ writes, reads }: { writes: Json; reads: Json }) {
  const changes = writes as ReviewWrite[];
  const before = reads as ReviewRead[];
  const [current, setCurrent] = useState<Record<string, Json>>({});
  const [lookupError, setLookupError] = useState("");
  const athleteIds = useMemo(() => [...new Set([...changes.map(item => item.after), ...before.map(item => item.before)]
    .map(value => object(value).athleteId).filter((id): id is string => typeof id === "string"))], [changes, before]);
  useEffect(() => {
    let active = true;
    if (!athleteIds.length) return;
    void browserClient().from("athletes").select("id,data").in("id", athleteIds).then(({ data, error }) => {
      if (!active) return;
      setLookupError(error ? "Some athlete names could not be loaded. Batch profiles are still shown; unresolved swimmers are labeled by ID." : "");
      setCurrent(Object.fromEntries((data ?? []).map(row => [row.id, row.data])));
    });
    return () => { active = false; };
  }, [athleteIds]);
  const proposedProfiles = athleteProfiles(changes, before, current, true);
  const previousProfiles = athleteProfiles(changes, before, current, false);
  return <div className="space-y-3">
    {lookupError && <p role="alert">{lookupError}</p>}
    {changes.map(change => {
      const previous = before.find(item => item.path === change.path)?.before ?? null;
      const swim = change.path.startsWith("swims/");
      const knowledge = change.path.startsWith("knowledge_entries/");
      const action = change.after === null ? "Remove" : previous === null ? "Add" : "Update";
      const name = change.path.startsWith("athletes/") ? athleteName(change.after ?? previous) : knowledge ? object(change.after ?? previous).title : object(change.after ?? previous).name;
      return <section key={change.path} className="rounded border p-4 space-y-3" aria-label={`${action} ${swim ? "swim" : change.path}`}>
        <h3 className="font-semibold">{action} {swim ? "swim" : typeof name === "string" && name ? name : change.path}</h3>
        {swim && <RaceDetails value={change.after ?? previous} profiles={change.after === null ? previousProfiles : proposedProfiles} />}
        {knowledge && <KnowledgeDetails value={change.after ?? previous} />}
        <details>
          <summary className="cursor-pointer text-sm">Compare changes and raw fields</summary>
          <p className="text-sm break-all">{change.path}</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {[{ label: "Current at collection", value: previous, profiles: previousProfiles }, { label: "Proposed", value: change.after, profiles: proposedProfiles }].map(side => <div key={side.label}>
              <h4>{side.label}</h4>
              {side.value === null ? <p>{side.label === "Proposed" ? "Record will be removed." : "New record."}</p> : swim ? <RaceDetails value={side.value} profiles={side.profiles} /> : knowledge ? <KnowledgeDetails value={side.value} /> : null}
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(side.value, null, 2)}</pre>
            </div>)}
          </div>
        </details>
      </section>;
    })}
  </div>;
}
export default function ReviewQueue() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [status, setStatus] = useState("pending");
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [refresh, setRefresh] = useState(0);
  const load = useCallback(
    () =>
      browserClient()
        .from("collection_batches")
        .select("*")
        .eq("status", status)
        .order("received_at", { ascending: false })
        .range(offset, offset + 19),
    [status, offset],
  );
  useEffect(() => {
    let active = true;
    if (!isAdmin || !hasBackendConfiguration) return;
    void load().then((result) => {
      if (!active) return;
      setError(result.error?.message ?? "");
      if (!result.error) setBatches(result.data ?? []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [load, isAdmin, refresh]);
  async function decide(batch: Batch, decision: string) {
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
      setRefresh((value) => value + 1);
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
    <section className="space-y-6">
      <p>
        Collected changes stay private until approved. A batch is applied
        together; changed records require a fresh collection.
      </p>
      <div className="flex gap-4">
        <label>
          Status{" "}
          <select
            aria-label="Status"
            className="rounded border p-2"
            value={status}
            onChange={(event) => {
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
            setLoading(true);
            setRefresh((value) => value + 1);
          }}
          disabled={loading}
        >
          Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading proposals…</p>
      ) : batches.length === 0 ? (
        <p>No {status} proposals.</p>
      ) : (
        batches.map((batch) => (
          <article key={batch.id} className="space-y-4 rounded-xl border p-5">
            <h2 className="text-xl font-semibold">
              {divisions[batch.division]}
            </h2>
            <p>{batch.scope}</p>
            <p className="text-sm">
              Captured {new Date(batch.captured_at).toLocaleString()} ·{" "}
              {batch.coverage} coverage · {batch.status}
            </p>
            <a
              href={safeUrl(batch.source_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline break-all"
            >
              {batch.source_url}
            </a>
            <Records writes={batch.writes} reads={batch.reads} />
            <details>
              <summary className="cursor-pointer">Source evidence</summary>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">
                {JSON.stringify(batch.evidence, null, 2)}
              </pre>
            </details>
            {["pending", "held"].includes(batch.status) ? (
              <>
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
                <div className="flex flex-wrap gap-3">
                  {[
                    ["approved", "Approve all changes"],
                    ["held", "Hold"],
                    ["declined", "Decline"],
                  ].map(([decision, label]) => (
                    <button
                      className="rounded border px-4 py-2 disabled:opacity-50"
                      key={decision}
                      disabled={busy !== null}
                      onClick={() => void decide(batch, decision)}
                    >
                      {busy === batch.id ? "Saving…" : label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p>
                Decision: {batch.review_note || "No note"} ·{" "}
                {batch.reviewed_at &&
                  new Date(batch.reviewed_at).toLocaleString()}
              </p>
            )}
          </article>
        ))
      )}
      <nav className="flex gap-5" aria-label="Proposal pages">
        <button
          disabled={loading || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 20))}
        >
          Previous
        </button>
        <button
          disabled={loading || batches.length < 20}
          onClick={() => setOffset(offset + 20)}
        >
          Next
        </button>
      </nav>
    </section>
  );
}
