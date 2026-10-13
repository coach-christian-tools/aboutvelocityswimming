"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/features/workshare/contexts/auth";
import { formatSwimTime } from "@/features/swim-resources/lib/domain/swim-time";
import { eventLabel, type Race } from "./times-data";
import { ModerationEditor, ModerationNotice } from "./ResultModeration";
import { reasonLabel, type ModerationList } from "./result-moderation";
import s from "./ResultModeration.module.css";

function ResultHeading({ race }: { race: Race }) {
  return (
    <>
      <h2>
        {race.athleteName || race.relayName || race.teamName || "Relay result"}{" "}
        · {eventLabel(race.event)} · {race.course}
      </h2>
      <p>
        {race.status === "OK" ? formatSwimTime(race.time) : race.status} ·{" "}
        {race.meet} · {race.date.slice(0, 10)}
      </p>
      <ModerationNotice race={race} />
    </>
  );
}
export default function FlaggedResults() {
  const { isAdmin, loading, user } = useAuth();
  const [includeRestored, setIncludeRestored] = useState(false);
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data: ModerationList;
  } | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const key = `${user?.uid}:${includeRestored}:${offset}:${attempt}`;
  useEffect(() => {
    if (loading || !isAdmin) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          `/api/times/moderation?offset=${offset}&includeRestored=${includeRestored}`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load flagged results.");
        if (!controller.signal.aborted) {
          setState({ key, data });
          setError("");
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Could not load flagged results.",
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [loading, isAdmin, offset, includeRestored, key]);
  if (loading) return <p>Checking staff access…</p>;
  if (!isAdmin)
    return (
      <p>
        Staff access is required.{" "}
        <Link href="/login">Sign in with your staff account</Link>.
      </p>
    );
  const data = state?.key === key ? state.data : null;
  return (
    <div className={s.queue}>
      <div className={s.actions}>
        <Link href="/tools/review">Collection review</Link>
        <Link href="/tools/times">Browse results to flag</Link>
        <label>
          <input
            type="checkbox"
            checked={includeRestored}
            onChange={(event) => {
              setIncludeRestored(event.target.checked);
              setOffset(0);
              setSelected("");
            }}
          />{" "}
          Include restored results
        </label>
      </div>
      {error && (
        <p role="alert" className={s.error}>
          {error}{" "}
          <button
            className={s.button}
            onClick={() => {
              setError("");
              setAttempt((n) => n + 1);
            }}
          >
            Retry
          </button>
        </p>
      )}
      {!data && !error && <p role="status">Loading flagged results…</p>}
      {data && (
        <>
          <p>
            {data.total} {includeRestored ? "reviewed" : "flagged"} results
          </p>
          {!data.results.length && <p>No results on this page.</p>}
          {data.results.map((item) => {
            const id = `${item.result_type}:${item.result_id}`;
            return (
              <article key={id}>
                {item.race ? (
                  <ResultHeading race={item.race} />
                ) : (
                  <h2>Result {item.result_id} is no longer available</h2>
                )}
                <p>{item.flagged ? reasonLabel(item.reason) : "Restored"}</p>
                {item.note && <p>{item.note}</p>}
                <button
                  type="button"
                  className={s.button}
                  aria-expanded={selected === id}
                  onClick={() =>
                    setSelected((value) => (value === id ? "" : id))
                  }
                >
                  Review details and history
                </button>
                {selected === id && (
                  <ModerationEditor
                    key={id}
                    resultType={item.result_type}
                    resultId={item.result_id}
                    onChanged={() => {
                      setSelected("");
                      setAttempt((n) => n + 1);
                    }}
                  />
                )}
              </article>
            );
          })}
          <nav aria-label="Flagged results pages" className={s.actions}>
            <button
              className={s.button}
              disabled={offset === 0}
              onClick={() => {
                setOffset((n) => Math.max(0, n - 25));
                setSelected("");
              }}
            >
              Previous
            </button>
            <span>Page {Math.floor(offset / 25) + 1}</span>
            <button
              className={s.button}
              disabled={offset + 25 >= data.total}
              onClick={() => {
                setOffset((n) => n + 25);
                setSelected("");
              }}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
