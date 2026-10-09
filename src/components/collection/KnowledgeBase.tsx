"use client";
import { useEffect, useState } from "react";
import { browserClient, hasBackendConfiguration } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
type Entry = Database["public"]["Tables"]["knowledge_entries"]["Row"];
export default function KnowledgeBase() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [kind, setKind] = useState("meet");
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    if (!hasBackendConfiguration) return;
    browserClient()
      .from("knowledge_entries")
      .select("*")
      .eq("kind", kind)
      .order("title")
      .order("id")
      .range(offset, offset + 24)
      .then(({ data, error }) => {
        if (active) {
          setEntries(data ?? []);
          setError(error?.message ?? "");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [kind, offset]);
  return (
    <section className="space-y-6">
      <p>
        Meet, region, LSC, team, and venue information with links to the
        original sources. Entries are published after review.
      </p>
      <label>
        Show{" "}
        <select
          className="rounded border p-2"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value);
            setOffset(0);
            setLoading(true);
          }}
        >
          {["meet", "region", "zone", "lsc", "team", "venue", "document"].map(
            (value) => (
              <option key={value}>{value}</option>
            ),
          )}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {!hasBackendConfiguration ? (
        <p>The database is being connected.</p>
      ) : loading ? (
        <p>Loading…</p>
      ) : entries.length === 0 ? (
        <p>No approved entries yet.</p>
      ) : (
        entries.map((entry) => (
          <article className="rounded-xl border p-5" key={entry.id}>
            <h2 className="text-xl font-semibold">{entry.title}</h2>
            {entry.starts_on && (
              <p>
                {entry.starts_on}
                {entry.ends_on && entry.ends_on !== entry.starts_on
                  ? ` – ${entry.ends_on}`
                  : ""}
              </p>
            )}
            {entry.data &&
              typeof entry.data === "object" &&
              "summary" in entry.data &&
              typeof entry.data.summary === "string" && (
                <p className="my-3">{entry.data.summary}</p>
              )}
            <a
              className="underline"
              href={entry.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              View original source
            </a>
            <p className="mt-2 text-sm">
              Reviewed {new Date(entry.updated_at).toLocaleDateString()}
            </p>
          </article>
        ))
      )}
      <nav aria-label="Knowledge pages" className="flex gap-5">
        <button
          disabled={offset === 0 || loading}
          onClick={() => {
            setOffset(offset - 25);
            setLoading(true);
          }}
        >
          Previous
        </button>
        <button
          disabled={entries.length < 25 || loading}
          onClick={() => {
            setOffset(offset + 25);
            setLoading(true);
          }}
        >
          Next
        </button>
      </nav>
    </section>
  );
}
