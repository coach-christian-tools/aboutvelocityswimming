"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/features/workshare/contexts/auth";
import type { Race } from "./times-data";
import { clearTimesCache } from "./times-cache";
import {
  moderationReasons,
  moderationUrl,
  reasonLabel,
  type ModerationDetail,
  type ResultType,
} from "./result-moderation";
import s from "./ResultModeration.module.css";

export function ModerationNotice({ race }: { race: Race }) {
  return race.moderationStatus === "flagged" ? (
    <span className={s.notice}>
      Under review · excluded from rankings and records
    </span>
  ) : null;
}
function sourceUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function ModerationEditor({
  resultType,
  resultId,
  onChanged,
}: {
  resultType: ResultType;
  resultId: string;
  onChanged: (detail: ModerationDetail) => void;
}) {
  const [detail, setDetail] = useState<ModerationDetail | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [reason, setReason] = useState<string>(moderationReasons[0][0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(moderationUrl(resultType, resultId), {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load review details.");
        if (!controller.signal.aborted) {
          setDetail(data);
          setError("");
          setConflict(false);
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Could not load review details.",
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [resultType, resultId, attempt]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!detail || !detail.available || busy || conflict) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/times/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultType,
          resultId,
          action: detail.flagged ? "restore" : "flag",
          reason,
          note,
          expectedVersion: detail.version,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setConflict(response.status === 409);
        throw new Error(data.error || "Could not save this review.");
      }
      setDetail(data);
      setNote("");
      setMessage(
        data.flagged
          ? "Result flagged and excluded."
          : data.race?.moderationInherited
            ? "Direct flag removed. The parent relay is still under review."
            : "Result restored.",
      );
      clearTimesCache();
      onChanged(data);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save this review.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={s.panel}>
      <h3>Staff result review</h3>
      {error && (
        <div role="alert" className={s.error}>
          {error}{" "}
          <button
            type="button"
            className={s.button}
            disabled={busy}
            onClick={() => {
              setDetail(null);
              setAttempt((n) => n + 1);
            }}
          >
            Refresh review
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {!detail && !error && <p role="status">Loading review details…</p>}
      {detail && (
        <>
          {detail.race?.moderationInherited && (
            <p>
              This result is also excluded because its parent relay is under
              review. Restoring a direct flag does not restore the parent relay.
            </p>
          )}
          {!detail.available && (
            <p>
              The source result is no longer available. Its review history is
              preserved below.
            </p>
          )}
          <form onSubmit={submit} className={s.panel}>
            <p>
              {detail.flagged
                ? "Restore only after checking the original result."
                : "Flagging immediately excludes this result from records, rankings, personal bests, and performance charts. The original upload stays available."}
            </p>
            {!detail.flagged && (
              <label>
                Reason
                <select
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={busy}
                >
                  {moderationReasons.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {detail.flagged
                ? "Restoration explanation"
                : reason === "other"
                  ? "Explanation"
                  : "Staff note (optional)"}
              <textarea
                value={note}
                maxLength={4000}
                required={detail.flagged || reason === "other"}
                onChange={(event) => setNote(event.target.value)}
                disabled={busy}
              />
            </label>
            <p>Notes and reviewer details are visible only to staff.</p>
            <button
              className={s.button}
              disabled={
                busy ||
                !detail.available ||
                conflict ||
                ((detail.flagged || reason === "other") && !note.trim())
              }
            >
              {busy
                ? "Saving…"
                : detail.flagged
                  ? "Restore result"
                  : "Flag and exclude result"}
            </button>
          </form>
          <details>
            <summary>Review history ({detail.history.length})</summary>
            {detail.history.length ? (
              <ol className={s.history}>
                {detail.history.map((event) => (
                  <li key={event.version}>
                    <strong>
                      {event.action === "flag" ? "Flagged" : "Restored"} ·{" "}
                      {reasonLabel(event.reason)}
                    </strong>
                    <p>
                      {new Date(event.created_at).toLocaleString()} ·{" "}
                      {event.actor_email}
                    </p>
                    {event.note && <p>{event.note}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <p>No previous reviews.</p>
            )}
          </details>
          <details>
            <summary>Source evidence and original upload</summary>
            {detail.sources.map((source, index) => (
              <div key={index}>
                {sourceUrl(source.source_url) ? (
                  <a
                    href={sourceUrl(source.source_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open original source
                  </a>
                ) : (
                  <p>Source link unavailable</p>
                )}
                <pre>{JSON.stringify(source.evidence, null, 2)}</pre>
              </div>
            ))}
            {!detail.sources.length && (
              <p>
                No linked collection evidence is available. Recorded source
                fields are shown below.
              </p>
            )}
            <pre>{JSON.stringify(detail.sourceData, null, 2)}</pre>
            {detail.originalSnapshot != null && (
              <details>
                <summary>Upload at first review</summary>
                <pre>{JSON.stringify(detail.originalSnapshot, null, 2)}</pre>
              </details>
            )}
          </details>
        </>
      )}
    </div>
  );
}
export default function ResultModeration({
  race,
  onRace,
}: {
  race: Race;
  onRace: (race: Race) => void;
}) {
  const { isAdmin, loading } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Result review">
      <ModerationNotice race={race} />
      {!loading && isAdmin && (
        <>
          <div className={s.actions}>
            <button
              className={s.button}
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              {open
                ? "Close review"
                : race.moderationStatus === "flagged"
                  ? "Review flagged result"
                  : "Flag result"}
            </button>
            <Link href="/tools/review/results">Flagged results</Link>
          </div>
          {open && (
            <ModerationEditor
              resultType={
                race.resultType ??
                (race.relay && !race.athleteId ? "relay" : "swim")
              }
              resultId={race.id}
              onChanged={(detail) => {
                if (detail.race) onRace(detail.race);
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
