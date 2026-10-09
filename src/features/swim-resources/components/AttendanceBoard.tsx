"use client";
import { useEffect, useState } from "react";
import { collection, db, onSnapshot, runTransaction, doc } from "@/lib/data";
import { teamDate } from "@/lib/dates";
import { Button } from "@/components/shared/Button";
import { Input } from "@/components/shared/Input";
import { useAuth } from "@/features/workshare/contexts/auth";
interface Swimmer {
  id: string;
  name: { first: string; last: string };
  currentGroup?: { id: string; name: string };
  status: string;
}
interface Practice {
  id: string;
  date: string;
  trainingGroup: string;
}
interface Mark {
  id: string;
  athleteId: string;
  sessionId: string;
  status: string;
}
export default function AttendanceBoard() {
  const { isAdmin, loading } = useAuth();
  const [swimmers, setSwimmers] = useState<Swimmer[]>([]),
    [practices, setPractices] = useState<Practice[]>([]),
    [marks, setMarks] = useState<Mark[]>([]);
  const [date, setDate] = useState(teamDate()),
    [group, setGroup] = useState(""),
    [draft, setDraft] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!isAdmin) return;
    const fail = (e: Error) => setError(e.message);
    const stops = [
      onSnapshot(
        collection(db, "athletes"),
        (s) =>
          setSwimmers(
            s.docs.map((d) => ({ ...d.data(), id: d.id }) as Swimmer),
          ),
        fail,
      ),
      onSnapshot(
        collection(db, "practice_sessions"),
        (s) =>
          setPractices(
            s.docs.map((d) => ({ ...d.data(), id: d.id }) as Practice),
          ),
        fail,
      ),
      onSnapshot(
        collection(db, "attendance"),
        (s) => setMarks(s.docs.map((d) => ({ ...d.data(), id: d.id }) as Mark)),
        fail,
      ),
    ];
    return () => stops.forEach((stop) => stop());
  }, [isAdmin]);
  const groups = [
    ...new Set(swimmers.map((s) => s.currentGroup?.name ?? "Unassigned")),
  ].sort();
  const selected = group || groups[0] || "";
  const practice = practices.find(
    (p) => p.date === date && p.trainingGroup === selected,
  );
  const roster = swimmers
    .filter(
      (s) =>
        s.status === "active" &&
        (s.currentGroup?.name ?? "Unassigned") === selected,
    )
    .sort(
      (a, b) =>
        a.name.last.localeCompare(b.name.last) ||
        a.name.first.localeCompare(b.name.first),
    );
  const status = (id: string) =>
    draft[id] ??
    marks.find((m) => m.athleteId === id && m.sessionId === practice?.id)
      ?.status ??
    "unmarked";
  async function save() {
    setBusy(true);
    setError("");
    try {
      const sessionId = practice?.id ?? crypto.randomUUID();
      await runTransaction(db, async (tx) => {
        const session = doc(db, "practice_sessions", sessionId);
        const existing = await tx.get(session);
        if (!existing.exists())
          tx.set(session, { id: sessionId, date, trainingGroup: selected });
        for (const swimmer of roster) {
          if (!draft[swimmer.id]) continue;
          const old = marks.find(
            (m) => m.athleteId === swimmer.id && m.sessionId === sessionId,
          );
          const ref = doc(
            db,
            "attendance",
            old?.id ?? sessionId + "_" + swimmer.id,
          );
          const before = await tx.get(ref);
          tx.set(ref, {
            ...before.data(),
            id: ref.id,
            athleteId: swimmer.id,
            sessionId,
            date,
            status: draft[swimmer.id],
          });
        }
      });
      setDraft({});
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save attendance.");
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <p role="status">Checking your account…</p>;
  if (!isAdmin)
    return <p role="alert">Staff access is required to record attendance.</p>;
  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-3xl mb-2">Practice attendance</h1>
      <p className="text-text-secondary mb-6">
        Swimmers and groups come from the shared team roster.
      </p>
      <div className="flex flex-wrap gap-4 mb-6">
        <label>
          Date
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setDraft({});
              setSaved(false);
            }}
          />
        </label>
        <label>
          Training group
          <select
            className="block rounded-lg border border-border p-3 bg-surface"
            value={selected}
            onChange={(e) => {
              setGroup(e.target.value);
              setDraft({});
              setSaved(false);
            }}
          >
            {groups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="mb-4 text-red-600">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="mb-4">
          Attendance saved.
        </p>
      )}
      {roster.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="p-3">Swimmer</th>
                <th className="p-3">Attendance</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => (
                <tr className="border-t border-border" key={s.id}>
                  <td className="p-3">
                    {s.name.first} {s.name.last}
                  </td>
                  <td className="p-3">
                    <select
                      aria-label={
                        "Attendance for " + s.name.first + " " + s.name.last
                      }
                      className="border border-border rounded-lg bg-surface p-2"
                      value={status(s.id)}
                      onChange={(e) => {
                        setDraft({ ...draft, [s.id]: e.target.value });
                        setSaved(false);
                      }}
                    >
                      <option value="unmarked">Unmarked</option>
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                      <option value="late">Late</option>
                      <option value="excused">Excused</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No active swimmers in this group.</p>
      )}
      <Button
        className="mt-6"
        disabled={busy || !Object.keys(draft).length}
        onClick={() => void save()}
      >
        {busy ? "Saving…" : "Save attendance"}
      </Button>
    </main>
  );
}
