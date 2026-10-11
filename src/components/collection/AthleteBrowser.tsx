"use client";

import { useMemo, useState } from "react";
import {
  athleteRankings,
  type AthleteRankingOptions,
  type RankedAthlete,
} from "./athlete-rankings";
import { ageGroups, eventLabel, type Race } from "./times-data";
import type { StandardSet } from "@/features/swim-resources/types/schema";
import { formatSwimTime } from "@/features/swim-resources/lib/domain/swim-time";
import s from "./TimesDatabase.module.css";

function RankingList({
  title,
  athletes,
  onAthlete,
}: {
  title: string;
  athletes: RankedAthlete[];
  onAthlete: (id: string) => void;
}) {
  const [limit, setLimit] = useState(25);
  if (!athletes.length) return null;
  return (
    <div className={s.athleteList}>
      <h4>
        {title} <span className={s.muted}>({athletes.length})</span>
      </h4>
      {athletes.slice(0, limit).map((a) => (
        <button
          key={a.id}
          className={s.athleteRow}
          onClick={() => onAthlete(a.id)}
        >
          <span className={s.athleteRank}>{a.rank ?? "—"}</span>
          <span className={s.athleteSummary}>
            <strong>{a.name}</strong>
            {a.events.map((e) => (
              <span key={e.race.event}>
                {eventLabel(e.race.event)} · {formatSwimTime(e.race.time)}{" "}
                <small>
                  (A: {formatSwimTime(e.standardTime)} · score{" "}
                  {e.score.toFixed(1)})
                </small>
              </span>
            ))}
            {a.reasons.length > 0 && <small>{a.reasons.join(" ")}</small>}
            <small>Latest recorded result: {a.latestDate.slice(0, 10)}</small>
          </span>
          <span className={s.athleteScore}>
            {a.score?.toFixed(1) ?? "Unscored"}
            <small>
              {a.status === "provisional"
                ? `${a.events.length} event${a.events.length === 1 ? "" : "s"}`
                : a.score != null
                  ? "3-event score"
                  : ""}
            </small>
          </span>
        </button>
      ))}
      {athletes.length > limit && (
        <button className={s.button} onClick={() => setLimit((n) => n + 25)}>
          Show more {title.toLowerCase()} ({athletes.length - limit} remaining)
        </button>
      )}
    </div>
  );
}
export default function AthleteBrowser({
  races,
  names,
  teams,
  standard,
  standardsLoading,
  standardsError,
  onRetry,
  onAthlete,
}: {
  races: Race[];
  names: Map<string, string>;
  teams: [string, string][];
  standard: StandardSet | null;
  standardsLoading: boolean;
  standardsError: string;
  onRetry: () => void;
  onAthlete: (id: string) => void;
}) {
  const [options, setOptions] = useState<Omit<AthleteRankingOptions, "today">>({
    team: "",
    course: "SCY",
    period: "recent",
  });
  const [ages, setAges] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
  const groups = useMemo(
    () => athleteRankings(races, names, standard, { ...options, today }),
    [races, names, standard, options, today],
  );
  const visible = groups
    .filter((g) => !ages.length || ages.includes(g.ageGroup))
    .map((g) => ({
      ...g,
      athletes: g.athletes.filter((a) =>
        a.name.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    }))
    .filter((g) => g.athletes.length);
  const sections = [...new Set(visible.map((g) => g.ageGroup))];
  const resetKey = JSON.stringify([options, ages]);
  return (
    <div className={s.athleteBrowser}>
      <div className={s.filters}>
        <label className={s.field}>
          Athlete team
          <select
            aria-label="Athlete team"
            value={options.team}
            onChange={(e) =>
              setOptions((o) => ({ ...o, team: e.target.value }))
            }
          >
            <option value="">Select a team…</option>
            {teams.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className={s.field}>
          Athlete course
          <select
            aria-label="Athlete course"
            value={options.course}
            onChange={(e) =>
              setOptions((o) => ({ ...o, course: e.target.value }))
            }
          >
            {["SCY", "LCM", "SCM"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className={s.field}>
          Athlete period
          <select
            aria-label="Athlete period"
            value={options.period}
            onChange={(e) =>
              setOptions((o) => ({
                ...o,
                period: e.target.value as AthleteRankingOptions["period"],
              }))
            }
          >
            <option value="recent">Past 12 months</option>
            <option value="all">All time</option>
          </select>
        </label>
        <label className={s.field}>
          Search team athletes
          <input
            type="search"
            placeholder="Search athlete name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <fieldset className={s.courseField}>
        <legend>Recorded age groups</legend>
        <div className={s.chips}>
          {ageGroups.map(([id, label]) => (
            <button
              key={id}
              aria-pressed={ages.includes(id)}
              onClick={() =>
                setAges((current) =>
                  current.includes(id)
                    ? current.filter((a) => a !== id)
                    : [...current, id],
                )
              }
            >
              {label}
            </button>
          ))}
          <button onClick={() => setAges([])} aria-pressed={!ages.length}>
            All ages
          </button>
        </div>
      </fieldset>
      <details className={s.scoreExplanation}>
        <summary>How this score works</summary>
        <p>
          Event score = 100 × A-standard time ÷ swim time. We average your three
          strongest distinct events in the selected course. Scores of 110, 105,
          and 100 give a 3-event score of 105. Higher scores mean faster
          relative to the benchmark; 100 matches the A time.
        </p>
        <p>
          This is a site-defined score using{" "}
          <a
            href="https://www.usaswimming.org/Times/time-standards"
            target="_blank"
            rel="noreferrer"
          >
            USA Swimming motivational standards
          </a>
          {standard ? ` (${standard.name})` : ""}. Both younger groups use the
          10-and-under benchmark. Only confirmed official individual results
          count. Provisional averages use fewer than three events and have no
          main-list rank.
        </p>
        <p>
          Ordering reflects available imported results. Recent lists use the
          latest recorded team and age across courses, rather than a verified
          current roster or current age; only results in that age group and team
          count. All-time lists use team and age at each swim, so swimmers may
          appear in multiple age groups. Both views use the same current
          benchmark.
        </p>
      </details>
      {standardsLoading && <p role="status">Loading scoring standards…</p>}
      {standardsError && (
        <p className={s.notice} role="alert">
          {standardsError}{" "}
          <button className={s.link} onClick={onRetry}>
            Retry standards
          </button>
        </p>
      )}
      {!standardsLoading && !standard && (
        <p className={s.notice}>
          Current verified motivational standards unavailable. Athletes are
          listed alphabetically without scores.
        </p>
      )}
      {!options.team ? (
        <p className={s.empty}>
          Select a team to explore athletes by recorded age group.
        </p>
      ) : (
        <>
          <p className={s.muted}>
            {options.period === "recent"
              ? "Latest recorded affiliation and age · past 12 months"
              : "Historical affiliation and age at the swim"}{" "}
            · {options.course}
          </p>
          {!visible.length && (
            <p className={s.empty}>
              No matching athletes. Try another name, age group, team, or
              period.
            </p>
          )}
          <div key={resetKey}>
            {sections.map((age) => (
              <section
                key={age}
                className={s.athleteAgeSection}
                aria-label={visible.find((g) => g.ageGroup === age)!.label}
              >
                <h3>{visible.find((g) => g.ageGroup === age)!.label}</h3>
                <div className={s.athleteColumns}>
                  {visible
                    .filter((g) => g.ageGroup === age)
                    .map((g) => (
                      <div key={g.gender}>
                        <h3 className={s.athleteGender}>
                          {g.gender === "F"
                            ? "Female"
                            : g.gender === "M"
                              ? "Male"
                              : "Other / gender unavailable"}
                        </h3>
                        <RankingList
                          title="Ranked athletes"
                          athletes={g.athletes.filter(
                            (a) => a.status === "ranked",
                          )}
                          onAthlete={onAthlete}
                        />
                        <RankingList
                          title="Provisional — fewer than three events"
                          athletes={g.athletes.filter(
                            (a) => a.status === "provisional",
                          )}
                          onAthlete={onAthlete}
                        />
                        <RankingList
                          title="Not scored"
                          athletes={g.athletes.filter(
                            (a) => a.status === "unscored",
                          )}
                          onAthlete={onAthlete}
                        />
                      </div>
                    ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
