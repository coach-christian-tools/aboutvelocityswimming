"use client";
import { useEffect, useState } from "react";
import { browserClient, hasBackendConfiguration } from "@/lib/supabase/client";
import { useAuth } from "@/features/workshare/contexts/auth";
interface TimeRow {
  athleteId: string;
  athleteName: { first: string; last: string };
  eventCode: string;
  bestTimeDisplay?: string;
  timeDisplay?: string;
  swimDate?: string;
  meet?: { date: string; name: string };
  meetName?: string;
  status?: string;
}
export default function SwimResultsBrowser() {
  const { isAdmin } = useAuth();
  const [mode, setMode] = useState("bests"),
    [course, setCourse] = useState(""),
    [event, setEvent] = useState(""),
    [offset, setOffset] = useState(0),
    [result, setResult] = useState<{ rows: TimeRow[]; total: number } | null>(
      null,
    ),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!hasBackendConfiguration) return;
    browserClient()
      .rpc("times_page", {
        mode,
        event_filter: event || undefined,
        course_filter: course || undefined,
        page_from: offset,
        page_size: 50,
      })
      .then(({ data, error }) => {
        if (!active) return;
        setError(error ? "We couldn’t load times. Please try again." : "");
        setResult(
          error
            ? null
            : (data as unknown as { rows: TimeRow[]; total: number }),
        );
      });
    return () => {
      active = false;
    };
  }, [mode, course, event, offset]);
  const changeMode = (next: string) => {
    setMode(next);
    setOffset(0);
    setResult(null);
  };
  return (
    <section>
      <h1 className="text-3xl mb-6">Swimming times</h1>
      <div
        className="flex flex-wrap gap-3 mb-6"
        role="group"
        aria-label="Result views"
      >
        {[
          ["bests", "Best times"],
          ["records", "Team records"],
          ...(isAdmin ? [["swims", "All swims"]] : []),
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={mode === key}
            className={`rounded-lg px-4 py-2 ${mode === key ? "bg-primary-blue text-primary-ink" : "border border-border bg-surface"}`}
            onClick={() => changeMode(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 mb-6">
        <label>
          Course{" "}
          <select
            className="border border-border rounded-md p-2 ml-2"
            value={course}
            onChange={(e) => {
              setCourse(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All courses</option>
            {["SCY", "SCM", "LCM"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Event{" "}
          <input
            className="border border-border rounded-md p-2 ml-2"
            placeholder="100_FR_SCY"
            value={event}
            onChange={(e) => {
              setEvent(e.target.value);
              setOffset(0);
            }}
          />
        </label>
      </div>
      {!hasBackendConfiguration ? (
        <p>Times are temporarily unavailable.</p>
      ) : error ? (
        <p role="alert">
          {error}
          <button
            className="underline ml-3"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </p>
      ) : !result ? (
        <p role="status">Loading times…</p>
      ) : (
        <>
          <div className="overflow-auto rounded-xl border border-border">
            <table className="w-full text-left">
              <caption className="sr-only">
                {mode === "records" ? "Team records" : "Swimming results"}
              </caption>
              <thead className="bg-hover-bg">
                <tr>
                  {["Swimmer", "Event", "Time", "Date", "Meet"].map((h) => (
                    <th key={h} className="p-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r, i) => (
                  <tr
                    key={r.athleteId + r.eventCode + i}
                    className="border-t border-border"
                  >
                    <td className="p-3">
                      {r.athleteName.first} {r.athleteName.last}
                    </td>
                    <td className="p-3">{r.eventCode}</td>
                    <td className="p-3 font-semibold tabular-nums">
                      {r.timeDisplay ?? r.bestTimeDisplay}
                      {r.status && r.status !== "OK" ? " · " + r.status : ""}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {r.meet?.date ?? r.swimDate}
                    </td>
                    <td className="p-3">{r.meet?.name ?? r.meetName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!result.rows.length && (
              <p className="p-8 text-text-secondary">
                No results match these filters.
              </p>
            )}
          </div>
          <div className="flex justify-between mt-4">
            <button
              disabled={!offset}
              className="disabled:opacity-40 underline"
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Previous
            </button>
            <span>
              {result.rows.length ? offset + 1 : 0}–
              {offset + result.rows.length}
            </span>
            <button
              disabled={result.rows.length < 50}
              className="disabled:opacity-40 underline"
              onClick={() => setOffset(offset + 50)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
