"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { browserClient, hasBackendConfiguration } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
type Athlete = Database["public"]["Tables"]["public_athletes"]["Row"];
type Race = Database["public"]["Tables"]["public_swims"]["Row"];
function name(athlete: Athlete) {
  const data = athlete.data as { name?: { first?: string; last?: string } };
  return (
    [data.name?.first, data.name?.last].filter(Boolean).join(" ") || athlete.id
  );
}
export default function TimesDatabase() {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [selected, setSelected] = useState("");
  const [races, setRaces] = useState<Race[]>([]);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [athleteOffset, setAthleteOffset] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    if (!hasBackendConfiguration) return;
    // Names are public; no private athlete table or Workshare identity is queried.
    const query = browserClient()
      .from("public_athletes")
      .select("*")
      .order("id")
      .range(athleteOffset, athleteOffset + 49);
    const request = search.trim()
      ? query.ilike("data->>aliases", `%${search.trim().replace(/[%_]/g, "")}%`)
      : query;
    const timer = setTimeout(() => {
      void request.then(({ data, error }) => {
        if (active) {
          setAthletes(data ?? []);
          setError(error?.message ?? "");
        }
      });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, athleteOffset]);
  useEffect(() => {
    let active = true;
    if (!selected) return;
    browserClient()
      .from("public_swims")
      .select("*")
      .eq("athlete_id", selected)
      .order("swim_date", { ascending: false })
      .order("id")
      .range(offset, offset + 49)
      .then(({ data, error }) => {
        if (active) {
          setRaces(data ?? []);
          setError(error?.message ?? "");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [selected, offset]);
  return (
    <section className="space-y-6">
      <p>
        Approved results for Inland Empire athletes, including meets outside the
        region.
      </p>
      <Link className="underline" href="/tools/swim-resources/times">
        Best times and time standards
      </Link>
      {!hasBackendConfiguration ? (
        <p>The database is being connected.</p>
      ) : (
        <>
          <label className="block">
            Find an athlete
            <input
              className="ml-3 rounded border p-2"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setAthleteOffset(0);
              }}
              placeholder="Athlete name"
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <ul className="flex flex-wrap gap-3">
            {athletes.map((athlete) => (
              <li key={athlete.id}>
                <button
                  className="rounded border px-3 py-2"
                  aria-pressed={selected === athlete.id}
                  onClick={() => {
                    if (selected !== athlete.id || offset !== 0) {
                      setSelected(athlete.id);
                      setOffset(0);
                      setLoading(true);
                    }
                  }}
                >
                  {name(athlete)}
                </button>
              </li>
            ))}
          </ul>
          {athletes.length === 0 && <p>No matching approved profiles.</p>}
          <nav className="flex gap-5" aria-label="Athlete pages">
            <button
              disabled={athleteOffset === 0}
              onClick={() => setAthleteOffset(athleteOffset - 50)}
            >
              Previous athletes
            </button>
            <button
              disabled={athletes.length < 50}
              onClick={() => setAthleteOffset(athleteOffset + 50)}
            >
              Next athletes
            </button>
          </nav>
          {selected && (
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">Approved race history</h2>
              {loading ? (
                <p>Loading results…</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        {["Date", "Meet", "Event", "Round", "Result"].map(
                          (heading) => (
                            <th className="p-2" key={heading}>
                              {heading}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {races.map((race) => {
                        const data = race.data as {
                          meet?: { name?: string };
                          eventCode?: string;
                          round?: string;
                          timeDisplay?: string;
                        };
                        return (
                          <tr className="border-t" key={race.id}>
                            <td className="p-2">{race.swim_date}</td>
                            <td className="p-2">{data.meet?.name}</td>
                            <td className="p-2">
                              {data.eventCode?.replaceAll("_", " ")}
                            </td>
                            <td className="p-2">{data.round}</td>
                            <td className="p-2">{data.timeDisplay}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {races.length === 0 && <p>No approved results yet.</p>}
                </div>
              )}
              <nav className="flex gap-5" aria-label="Result pages">
                <button
                  disabled={offset === 0 || loading}
                  onClick={() => {
                    setOffset(offset - 50);
                    setLoading(true);
                  }}
                >
                  Previous results
                </button>
                <button
                  disabled={races.length < 50 || loading}
                  onClick={() => {
                    setOffset(offset + 50);
                    setLoading(true);
                  }}
                >
                  Next results
                </button>
              </nav>
            </div>
          )}
        </>
      )}
    </section>
  );
}
