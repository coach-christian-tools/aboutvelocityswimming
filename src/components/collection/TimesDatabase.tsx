"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search,
  Timer,
  Users,
} from "lucide-react";
import { browserClient, hasBackendConfiguration } from "@/lib/supabase/client";
import { formatSwimTime } from "@/features/swim-resources/lib/domain/swim-time";
import {
  athleteName,
  bestTimes,
  eventLabel,
  initialFilters,
  matches,
  normalizeRace,
  percentile,
  rankedTimes,
  rounds,
  validTime,
  type Athlete,
  type Filters,
  type Race,
} from "./times-data";
import s from "./TimesDatabase.module.css";

type View = "rankings" | "meets" | "athletes";
const pageSize = 25;
const number = (n: number) => n.toLocaleString("en-US");
function date(value: string) {
  return value
    ? new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Date unavailable";
}

function startingFilters(races: Race[]): Filters {
  const eligible = races.filter(validTime);
  const preferred =
    eligible.find((r) => r.course === "SCY" && r.event === "100_FR") ??
    eligible.find((r) => r.course === "SCY" && r.event === "50_FR") ??
    eligible[0];
  return preferred
    ? { ...initialFilters, event: preferred.event, course: preferred.course }
    : initialFilters;
}
function Select({
  label,
  value,
  onChange,
  options,
  all,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  all?: string;
}) {
  const id = useId();
  return (
    <div className={s.field}>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {all && <option value="">{all}</option>}
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
function Pager({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <nav className={s.pager} aria-label="Result pages">
      <button
        className={s.button}
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={14} />
        Previous
      </button>
      <span>
        {total ? page * pageSize + 1 : 0}–
        {Math.min((page + 1) * pageSize, total)} of {number(total)}
      </span>
      <button
        className={s.button}
        disabled={(page + 1) * pageSize >= total}
        onClick={() => onChange(page + 1)}
      >
        Next
        <ChevronRight size={14} />
      </button>
    </nav>
  );
}
function ProgressChart({ races }: { races: Race[] }) {
  const points = races
    .filter(validTime)
    .toSorted((a, b) => a.date.localeCompare(b.date));
  if (points.length < 2)
    return (
      <p className={s.empty}>
        Two timed swims are needed to show progress. Every available result is
        listed below.
      </p>
    );
  const times = points.map((r) => r.time),
    min = times.reduce((a, b) => Math.min(a, b), Infinity),
    max = times.reduce((a, b) => Math.max(a, b), -Infinity);
  const start = Date.parse(points[0].date),
    end = Date.parse(points.at(-1)!.date);
  const coords = points.map((r) => [
    65 + ((Date.parse(r.date) - start) / (end - start || 1)) * 520,
    25 + ((r.time - min) / (max - min || 1)) * 120,
  ]);
  return (
    <div className={s.chart}>
      <p className={s.muted}>Time by meet date · lower time appears higher</p>
      <svg
        viewBox="0 0 620 190"
        role="img"
        aria-label={`${points.length} swims, from ${formatSwimTime(points[0].time)} to ${formatSwimTime(points.at(-1)!.time)}. Full results in the table below.`}
      >
        <path d="M65 25H590 M65 145H590" stroke="var(--border)" />
        <text x="0" y="29">
          {formatSwimTime(min)}
        </text>
        <text x="0" y="149">
          {formatSwimTime(max)}
        </text>
        <polyline
          points={coords.map((p) => p.join(",")).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        {points.map((r, i) => (
          <circle
            key={r.id}
            cx={coords[i][0]}
            cy={coords[i][1]}
            r="4"
            fill="currentColor"
          >
            <title>
              {date(r.date)} · {formatSwimTime(r.time)} · {r.meet}
            </title>
          </circle>
        ))}
        <text x="65" y="180">
          {date(points[0].date)}
        </text>
        <text x="590" y="180" textAnchor="end">
          {date(points.at(-1)!.date)}
        </text>
      </svg>
    </div>
  );
}
function Performance({
  race,
  races,
  names,
  filters,
  onAthlete,
  onClose,
}: {
  race: Race | null;
  races: Race[];
  names: Map<string, string>;
  filters: Filters;
  onAthlete: (id: string) => void;
  onClose: () => void;
}) {
  const [basis, setBasis] = useState("bests");
  const cohort = useMemo(() => {
    if (!race) return [];
    const eligible = races.filter(
      (r) =>
        matches(r, { ...filters, course: race.course, event: race.event }) &&
        validTime(r),
    );
    return basis === "bests" ? bestTimes(eligible) : eligible;
  }, [races, filters, race, basis]);
  const stats = race && validTime(race) ? percentile(race.time, cohort) : null;
  return (
    <aside className={s.side} aria-label="Performance analysis">
      <div className={s.panel}>
        <div className={s.detail}>
          <div className={s.badge}>
            <Timer size={14} />
            Performance analysis
          </div>
          {!race ? (
            <>
              <h2>Every swim tells a story.</h2>
              <p className={s.note}>
                Select any result time to see how it compares with the approved
                IES dataset.
              </p>
              <div className={s.percentile}>
                <BarChart3 size={36} />
                <p className={s.muted}>
                  Percentile · comparison size · faster and slower swims
                </p>
              </div>
              <p className={s.note}>
                Explore an athlete’s personal bests, follow their progress, or
                find a result from a particular meet.
              </p>
            </>
          ) : (
            <>
              <h2>{eventLabel(race.event)}</h2>
              <p className={s.muted}>
                {race.course} · {rounds[race.round] ?? race.round}
              </p>
              <div className={s.bigTime}>
                {race.status === "OK" ? formatSwimTime(race.time) : race.status}
              </div>
              <button
                className={s.link}
                onClick={() => onAthlete(race.athleteId)}
              >
                {names.get(race.athleteId) ?? race.athleteId}
                <ArrowUpRight size={14} />
              </button>
              <p className={s.muted}>
                {race.meet}
                <br />
                {date(race.date)}
              </p>
              <div className={s.percentile}>
                <Select
                  label="Compare against"
                  value={basis}
                  onChange={setBasis}
                  options={[
                    ["bests", "One best time per athlete"],
                    ["swims", "Every eligible swim"],
                  ]}
                />
                {stats ? (
                  <>
                    <strong>
                      {stats.value.toFixed(1)}
                      <span style={{ fontSize: 18 }}>%</span>
                    </strong>
                    <p className={s.muted}>Performance percentile</p>
                    <div className={s.meter}>
                      <span style={{ width: `${stats.value}%` }} />
                    </div>
                    <p className={s.muted}>
                      Higher percentile means a faster performance.
                    </p>
                  </>
                ) : (
                  <p className={s.note}>
                    No percentile available. A valid individual time and an
                    eligible comparison group are required.
                  </p>
                )}
              </div>
              {stats && (
                <dl className={s.facts}>
                  <div>
                    <dt>Comparison size</dt>
                    <dd>
                      {number(stats.count)}{" "}
                      {basis === "bests" ? "athletes" : "swims"}
                    </dd>
                  </div>
                  <div>
                    <dt>Faster</dt>
                    <dd>{number(stats.faster)}</dd>
                  </div>
                  <div>
                    <dt>Equal time</dt>
                    <dd>{number(stats.tied)}</dd>
                  </div>
                  <div>
                    <dt>Slower</dt>
                    <dd>{number(stats.slower)}</dd>
                  </div>
                </dl>
              )}
              <details className={s.note} open>
                <summary>Understand this comparison</summary>
                <p>
                  Same event and course, using the selected team, year, round,
                  and official-status filters across all meets.{" "}
                  {basis === "bests"
                    ? "Each athlete contributes only their fastest eligible swim."
                    : "Athletes may contribute multiple swims."}{" "}
                  The selected swim is included when eligible.
                </p>
                <p>
                  Percentile = (slower times + half of equal times) ÷ comparison
                  size × 100. Age and gender are not available in this public
                  dataset, so all ages and genders are combined. This is dataset
                  coverage, not an official IES ranking.
                </p>
                {stats && stats.count < 10 && (
                  <p>
                    Small sample: fewer than 10 comparisons. Interpret this
                    percentile with care.
                  </p>
                )}
              </details>
              <button className={s.button} onClick={onClose}>
                Clear selection
              </button>
            </>
          )}
        </div>
      </div>
      <div className={s.detail}>
        <div className={s.badge}>Built for the next personal best</div>
        <p className={s.note}>Inland Empire athletes. Wherever they compete.</p>
      </div>
    </aside>
  );
}

export default function TimesDatabase() {
  const [data, setData] = useState<{
    athletes: Athlete[];
    races: Race[];
  } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<View>("rankings");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [listPage, setListPage] = useState(0);
  const [meetId, setMeetId] = useState("");
  const [athleteId, setAthleteId] = useState("");
  const [athleteEvent, setAthleteEvent] = useState("");
  const [selected, setSelected] = useState<Race | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!hasBackendConfiguration) return;
    const controller = new AbortController();
    async function load() {
      // Read only the approved public projections. Fetch every page before computing statistics.
      const client = browserClient();
      async function athletes() {
        const rows: Athlete[] = [];
        for (;;) {
          const { data, error } = await client
            .from("public_athletes")
            .select("*")
            .order("id")
            .range(rows.length, rows.length + 499)
            .abortSignal(controller.signal);
          if (error) throw error;
          rows.push(...data);
          if (data.length < 500) return rows;
        }
      }
      async function races() {
        const rows: Race[] = [];
        for (;;) {
          const { data, error } = await client
            .from("public_swims")
            .select("*")
            .order("id")
            .range(rows.length, rows.length + 499)
            .abortSignal(controller.signal);
          if (error) throw error;
          rows.push(...data.map(normalizeRace));
          if (data.length < 500) return rows;
        }
      }
      try {
        const [a, r] = await Promise.all([athletes(), races()]);
        if (!controller.signal.aborted) {
          setData({ athletes: a, races: r });
          setFilters((current) =>
            current === initialFilters ? startingFilters(r) : current,
          );
        }
      } catch {
        if (!controller.signal.aborted)
          setError(
            "We couldn’t load the complete times dataset. Please try again.",
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);
  const athletes = useMemo(() => data?.athletes ?? [], [data]);
  const races = useMemo(() => data?.races ?? [], [data]);
  const names = useMemo(
    () => new Map(athletes.map((a) => [a.id, athleteName(a)])),
    [athletes],
  );
  const events = useMemo(
    () =>
      [
        ...new Set([
          ...(races.length ? [] : ["100_FR"]),
          ...races.filter((r) => !r.relay).map((r) => r.event),
        ]),
      ]
        .filter(Boolean)
        .sort(
          (a, b) =>
            Number(a.split("_")[0]) - Number(b.split("_")[0]) ||
            a.localeCompare(b),
        ),
    [races],
  );
  const teams = useMemo(
    () => [...new Set(races.map((r) => r.team).filter(Boolean))].sort(),
    [races],
  );
  const years = useMemo(
    () => [...new Set(races.map((r) => r.date.slice(0, 4)))].sort().reverse(),
    [races],
  );
  const meets = useMemo(() => {
    const all = new Map<
      string,
      {
        id: string;
        name: string;
        date: string;
        count: number;
        courses: Set<string>;
      }
    >();
    for (const r of races) {
      const m = all.get(r.meetId);
      if (m) {
        m.count++;
        m.courses.add(r.course);
        if (r.date > m.date) m.date = r.date;
      } else
        all.set(r.meetId, {
          id: r.meetId,
          name: r.meet,
          date: r.date,
          count: 1,
          courses: new Set([r.course]),
        });
    }
    return [...all.values()].sort(
      (a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name),
    );
  }, [races]);
  const filtered = useMemo(
    () => races.filter((r) => matches(r, filters)),
    [races, filters],
  );
  const rankings = useMemo(() => rankedTimes(filtered), [filtered]);
  const searchTerm = search.trim().toLowerCase();
  const foundMeets = meets.filter((m) =>
    m.name.toLowerCase().includes(searchTerm),
  );
  const foundAthletes = athletes.filter((a) =>
    `${athleteName(a)} ${JSON.stringify(a.data)}`
      .toLowerCase()
      .includes(searchTerm),
  );
  const athleteRaces = useMemo(
    () => races.filter((r) => r.athleteId === athleteId && !r.relay),
    [races, athleteId],
  );
  const pbs = useMemo(
    () =>
      bestTimes(athleteRaces).sort(
        (a, b) =>
          a.course.localeCompare(b.course) ||
          a.event.localeCompare(b.event, undefined, { numeric: true }),
      ),
    [athleteRaces],
  );
  const activeEvent =
    athleteEvent || (pbs[0] ? `${pbs[0].event}_${pbs[0].course}` : "");
  const history = athleteRaces
    .filter((r) => `${r.event}_${r.course}` === activeEvent)
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const displayed =
    view === "rankings"
      ? rankings.filter(({ race }) =>
          (names.get(race.athleteId) ?? race.athleteId)
            .toLowerCase()
            .includes(searchTerm),
        )
      : (view === "meets"
          ? filtered
              .filter((r) => r.meetId === meetId)
              .sort(
                (a, b) =>
                  a.event.localeCompare(b.event, undefined, {
                    numeric: true,
                  }) || a.time - b.time,
              )
          : history
        ).map((race) => ({ race, rank: undefined }));
  const chosenMeet = meets.find((m) => m.id === meetId);
  const loading = hasBackendConfiguration && !data && !error;
  function updateFilter(key: keyof Filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
    setSelected(null);
  }
  function changeView(next: View) {
    setView(next);
    setListPage(0);
    setSearch("");
    setPage(0);
    setSelected(null);
    setFilters(
      next === "rankings"
        ? startingFilters(races)
        : { ...initialFilters, course: "", event: "" },
    );
  }
  function openAthlete(id: string) {
    changeView("athletes");
    setAthleteId(id);
    setAthleteEvent("");
    showProfile();
  }
  function showProfile() {
    requestAnimationFrame(() => {
      profileRef.current?.focus({ preventScroll: true });
      profileRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }
  function selectRace(race: Race) {
    setSelected(race);
    requestAnimationFrame(() => {
      detailRef.current?.focus({ preventScroll: true });
      detailRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }
  const table = (
    <>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <caption className="sr-only">
            {view === "rankings"
              ? "Event rankings, one best swim per athlete"
              : "Individual swim results"}
          </caption>
          <thead>
            <tr>
              {view === "rankings" && <th scope="col">Rank</th>}
              <th scope="col">
                {view === "athletes" ? "Date / meet" : "Athlete / team"}
              </th>
              <th scope="col">Event</th>
              <th scope="col">Time</th>
              <th scope="col">
                {view === "rankings" ? "Meet / date" : "Round"}
              </th>
            </tr>
          </thead>
          <tbody>
            {displayed
              .slice(page * pageSize, (page + 1) * pageSize)
              .map(({ race, rank }) => (
                <tr
                  key={race.id}
                  className={selected?.id === race.id ? s.selected : undefined}
                >
                  {view === "rankings" && <td className={s.rank}>{rank}</td>}
                  <td>
                    {view === "athletes" ? (
                      <>
                        {date(race.date)}
                        <small>{race.meet}</small>
                      </>
                    ) : (
                      <>
                        <button
                          className={s.link}
                          onClick={() => openAthlete(race.athleteId)}
                        >
                          {names.get(race.athleteId) ?? race.athleteId}
                        </button>
                        <small>{race.team || "Team unavailable"}</small>
                      </>
                    )}
                  </td>
                  <td>
                    {eventLabel(race.event)}
                    <small>{race.course}</small>
                  </td>
                  <td>
                    <button
                      className={s.time}
                      aria-label={`Analyze ${race.status === "OK" ? formatSwimTime(race.time) : race.status} by ${names.get(race.athleteId) ?? race.athleteId}`}
                      onClick={() => selectRace(race)}
                    >
                      {race.status === "OK"
                        ? formatSwimTime(race.time)
                        : race.status || "—"}
                    </button>
                    <small>
                      {race.official === true
                        ? "Official"
                        : race.official === false
                          ? "Unofficial"
                          : "Status unreported"}
                    </small>
                  </td>
                  <td>
                    {view === "rankings" ? (
                      <>
                        <button
                          className={s.link}
                          onClick={() => {
                            changeView("meets");
                            setMeetId(race.meetId);
                            showProfile();
                          }}
                        >
                          {race.meet}
                        </button>
                        <small>{date(race.date)}</small>
                      </>
                    ) : (
                      (rounds[race.round] ?? race.round)
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!displayed.length && (
        <div className={s.empty}>
          <Search size={24} style={{ margin: "auto" }} />
          <h3>No matching results</h3>
          <p>Try another event or broaden your filters.</p>
        </div>
      )}
      <Pager page={page} total={displayed.length} onChange={setPage} />
    </>
  );
  return (
    <main className={s.page}>
      <header className={s.hero}>
        <div>
          <div className={s.eyebrow}>Velocity Swimming / Athlete tools</div>
          <h1>
            IES Times<span style={{ color: "var(--accent)" }}>.</span>
          </h1>
          <p>
            Find your race. Know your progress. Explore results and personal
            bests from Inland Empire athletes, wherever they compete.
          </p>
        </div>
        <Link href="/tools/swim-resources/standards/usa">
          Explore time standards ↗
        </Link>
      </header>
      <div className={s.stats}>
        {[
          [data ? number(races.length) : "—", "Approved results"],
          [data ? number(athletes.length) : "—", "Athlete profiles"],
          [data ? number(meets.length) : "—", "Meets in the dataset"],
        ].map(([value, label]) => (
          <div className={s.stat} key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <nav className={s.tabs} aria-label="Explore times">
        {(
          [
            ["rankings", "Event rankings", BarChart3],
            ["meets", "Meet results", CalendarDays],
            ["athletes", "Athletes", Users],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            aria-pressed={view === key}
            onClick={() => changeView(key)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>
      {!hasBackendConfiguration && (
        <div className={s.notice} role="status">
          The times database is not connected yet. Approved results will appear
          here once it is available.
        </div>
      )}
      {error && (
        <div className={s.notice} role="alert">
          {error}{" "}
          <button
            className={s.link}
            onClick={() => {
              setError("");
              setData(null);
              setAttempt((a) => a + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}
      {loading && (
        <div className={s.notice} role="status">
          Loading approved results and complete comparison groups…
        </div>
      )}
      <div className={s.workspace}>
        <div className={s.main}>
          <section
            className={s.panel}
            aria-label={
              view === "rankings"
                ? "Event rankings"
                : view === "meets"
                  ? "Meet browser"
                  : "Athlete browser"
            }
          >
            <div className={s.panelHead}>
              <div>
                <h2>
                  {view === "rankings"
                    ? "The field, at a glance"
                    : view === "meets"
                      ? "Find a meet"
                      : "Find an athlete"}
                </h2>
                <p>
                  {view === "rankings"
                    ? "One best time per athlete in your selected comparison group."
                    : view === "meets"
                      ? "Browse approved results, then select a meet to explore each swim."
                      : "Personal bests and a closer look at every event."}
                </p>
              </div>
            </div>
            {view === "rankings" && (
              <div className={s.filters}>
                <Select
                  label="Course"
                  value={filters.course}
                  onChange={(v) => updateFilter("course", v)}
                  options={[
                    ["SCY", "Short course yards"],
                    ["LCM", "Long course meters"],
                    ["SCM", "Short course meters"],
                  ]}
                />
                <Select
                  label="Event"
                  value={filters.event}
                  onChange={(v) => updateFilter("event", v)}
                  options={events.map((e) => [e, eventLabel(e)])}
                />
                <Select
                  label="Team"
                  value={filters.team}
                  onChange={(v) => updateFilter("team", v)}
                  all="All teams"
                  options={teams.map((t) => [t, t])}
                />
                <Select
                  label="Year"
                  value={filters.year}
                  onChange={(v) => updateFilter("year", v)}
                  all="All years"
                  options={years.map((y) => [y, y])}
                />
                <Select
                  label="Round"
                  value={filters.round}
                  onChange={(v) => updateFilter("round", v)}
                  all="All rounds"
                  options={Object.entries(rounds)}
                />
                <Select
                  label="Result status"
                  value={filters.official}
                  onChange={(v) => updateFilter("official", v)}
                  all="All statuses"
                  options={[
                    ["official", "Official only"],
                    ["unofficial", "Unofficial only"],
                  ]}
                />
              </div>
            )}
            <div className={s.toolbar}>
              <label className={s.field}>
                <span className="sr-only">
                  {view === "meets" ? "Search meets" : "Search athletes"}
                </span>
                <input
                  type="search"
                  placeholder={
                    view === "meets"
                      ? "Search meet name…"
                      : "Search athlete name…"
                  }
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setListPage(0);
                    setPage(0);
                  }}
                />
              </label>
              {view === "rankings" && (
                <button
                  className={s.link}
                  onClick={() => {
                    setFilters(startingFilters(races));
                    setSearch("");
                    setPage(0);
                    setSelected(null);
                  }}
                >
                  Reset filters
                </button>
              )}
            </div>
            {view === "rankings" ? (
              data && table
            ) : (
              <>
                {data && (
                  <>
                    <div className={s.cards}>
                      {view === "meets"
                        ? foundMeets
                            .slice(
                              listPage * pageSize,
                              (listPage + 1) * pageSize,
                            )
                            .map((m) => (
                              <button
                                key={m.id}
                                className={s.card}
                                aria-pressed={meetId === m.id}
                                onClick={() => {
                                  setMeetId(m.id);
                                  showProfile();
                                  setPage(0);
                                  setSelected(null);
                                }}
                              >
                                <span>
                                  {date(m.date)} · {[...m.courses].join(" / ")}
                                </span>
                                <strong>{m.name}</strong>
                                <span>
                                  {number(m.count)} approved results ↗
                                </span>
                              </button>
                            ))
                        : foundAthletes
                            .slice(
                              listPage * pageSize,
                              (listPage + 1) * pageSize,
                            )
                            .map((a) => (
                              <button
                                key={a.id}
                                className={s.card}
                                aria-pressed={athleteId === a.id}
                                onClick={() => openAthlete(a.id)}
                              >
                                <Users size={18} />
                                <strong>{athleteName(a)}</strong>
                                <span>Personal bests & race history ↗</span>
                              </button>
                            ))}
                    </div>
                    {!(view === "meets" ? foundMeets : foundAthletes)
                      .length && (
                      <p className={s.empty}>
                        No matching {view === "meets" ? "meets" : "athletes"}.
                        Try a different name.
                      </p>
                    )}
                    <Pager
                      page={listPage}
                      total={
                        view === "meets"
                          ? foundMeets.length
                          : foundAthletes.length
                      }
                      onChange={setListPage}
                    />
                  </>
                )}
              </>
            )}
          </section>
          {view === "meets" && chosenMeet && data && (
            <section className={s.panel} ref={profileRef} tabIndex={-1}>
              <div className={s.panelHead}>
                <div>
                  <span className={s.badge}>Meet results</span>
                  <h2>{chosenMeet.name}</h2>
                  <p>
                    {date(chosenMeet.date)} · {number(chosenMeet.count)}{" "}
                    approved results · individual swims below
                  </p>
                </div>
              </div>
              <div className={s.filters}>
                <Select
                  label="Meet event"
                  value={filters.event}
                  onChange={(v) => updateFilter("event", v)}
                  all="All events"
                  options={events.map((e) => [e, eventLabel(e)])}
                />
                <Select
                  label="Meet course"
                  value={filters.course}
                  onChange={(v) => updateFilter("course", v)}
                  all="All courses"
                  options={["SCY", "LCM", "SCM"].map((c) => [c, c])}
                />
                <Select
                  label="Meet team"
                  value={filters.team}
                  onChange={(v) => updateFilter("team", v)}
                  all="All teams"
                  options={teams.map((t) => [t, t])}
                />
                <Select
                  label="Meet round"
                  value={filters.round}
                  onChange={(v) => updateFilter("round", v)}
                  all="All rounds"
                  options={Object.entries(rounds)}
                />
              </div>
              {table}
            </section>
          )}
          {view === "athletes" && athleteId && data && (
            <section className={s.panel} ref={profileRef} tabIndex={-1}>
              <div className={s.panelHead}>
                <div>
                  <span className={s.badge}>Athlete profile</span>
                  <h2>{names.get(athleteId) ?? athleteId}</h2>
                  <p>
                    {pbs.length} personal bests · {number(athleteRaces.length)}{" "}
                    individual results
                  </p>
                </div>
              </div>
              <div className={s.toolbar}>
                <h3>Personal bests</h3>
                <span className={s.muted}>
                  All available dates · courses kept separate
                </span>
              </div>
              <div className={s.pbs}>
                {pbs.map((r) => (
                  <button
                    key={r.id}
                    className={s.pb}
                    aria-pressed={activeEvent === `${r.event}_${r.course}`}
                    onClick={() => {
                      setAthleteEvent(`${r.event}_${r.course}`);
                      setPage(0);
                      setSelected(null);
                    }}
                  >
                    <span>{eventLabel(r.event)}</span>
                    <strong>{formatSwimTime(r.time)}</strong>
                    <span>
                      {r.course} · {date(r.date)}
                    </span>
                  </button>
                ))}
              </div>
              {!pbs.length && (
                <p className={s.empty}>
                  No valid individual personal bests are available.
                </p>
              )}
              <div className={s.toolbar}>
                <Select
                  label="Event history"
                  value={activeEvent}
                  onChange={(v) => {
                    setAthleteEvent(v);
                    setPage(0);
                    setSelected(null);
                  }}
                  options={[
                    ...new Set(
                      athleteRaces.map((r) => `${r.event}_${r.course}`),
                    ),
                  ]
                    .sort()
                    .map((e) => [
                      e,
                      `${eventLabel(e)} · ${e.split("_").at(-1)}`,
                    ])}
                />
              </div>
              <ProgressChart races={history} />
              {table}
            </section>
          )}
          <p className={s.footer}>
            Approved IES dataset only; coverage may be incomplete. Rankings and
            personal bests exclude relays, disqualifications, scratches, and
            missing times. Equal times share a rank. Age and gender filters are
            unavailable in the public data.
          </p>
        </div>
        <div ref={detailRef} tabIndex={-1}>
          <Performance
            race={selected}
            races={races}
            names={names}
            filters={filters}
            onAthlete={openAthlete}
            onClose={() => setSelected(null)}
          />
        </div>
      </div>
    </main>
  );
}
