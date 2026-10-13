"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import { hasBackendConfiguration } from "@/lib/supabase/client";
import { formatSwimTime } from "@/features/swim-resources/lib/domain/swim-time";
import {
  ageGroups,
  timesEvents,
  hide25sForAgeGroups,
  changeResultCategory,
  changeTimesCourse,
  resultName,
  dailyBestTimes,
  eventLabel,
  initialFilters,
  rounds,
  type Filters,
  type Race,
} from "./times-data";
import s from "./TimesDatabase.module.css";
import loadingStyles from "./TimesLoading.module.css";
import AthleteBrowser from "./AthleteBrowser";
import TimeStandards from "./TimeStandards";
import TimesEventSelector from "./TimesEventSelector";
import RaceDetails from "./RaceDetails";
import { ModerationNotice } from "./ResultModeration";
import RelayLineup from "./RelayLineup";
import { timesUrl } from "./times-api";
import { useTimes, useDebouncedSearch } from "./use-times";
import MeetEventNavigation, { meetEventLabel } from "./MeetEventNavigation";
import TeamRecords, { type RecordSelection } from "./TeamRecords";

type View = "rankings" | "meets" | "athletes" | "records" | "standards";
const pageSize = 25;
const ageOptions: [string, string][] = ageGroups.map(([key, label]) => [
  key,
  label,
]);
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

function QueryNotice({ query }: { query: ReturnType<typeof useTimes> }) {
  return query.loading ? (
    <p className="sr-only" role="status">
      Loading results…
    </p>
  ) : query.error ? (
    <p className={s.notice} role="alert">
      {query.error}{" "}
      <button className={s.link} onClick={query.retry}>
        Try again
      </button>
    </p>
  ) : null;
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
function PopupPicker({
  label,
  value,
  onChange,
  options,
  all,
  course,
  onCourseChange,
  hideLabel = false,
  showChevron = true,
}: {
  label: string;
  hideLabel?: boolean;
  showChevron?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  all?: string;
  course?: string;
  onCourseChange?: (course: string) => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const isEvent = label.toLowerCase().includes("event");
  return (
    <div className={`${s.field} ${isEvent ? s.eventField : ""}`}>
      <label
        id={`${id}-label`}
        htmlFor={id}
        className={isEvent || hideLabel ? "sr-only" : undefined}
      >
        {label}
      </label>
      {isEvent && (
        <div
          className={s.inlineEventSelector}
          role="group"
          aria-labelledby={`${id}-label`}
        >
          <TimesEventSelector
            value={value}
            options={options}
            onChange={onChange}
            all={all}
            course={course}
            onCourseChange={onCourseChange}
          />
        </div>
      )}
      <button
        id={id}
        className={s.eventTrigger}
        aria-haspopup="dialog"
        onClick={() => {
          dialog.current?.showModal();
          dialog.current
            ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
            ?.focus();
        }}
      >
        <span>
          {options.find(([key]) => key === value)?.[1] ??
            all ??
            `Select ${label.toLowerCase()}`}
        </span>
        {showChevron && <ChevronDown size={16} />}
      </button>
      <dialog
        ref={dialog}
        className={s.eventDialog}
        aria-labelledby={`${id}-title`}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const bounds = e.currentTarget.getBoundingClientRect();
            if (
              e.clientX < bounds.left ||
              e.clientX > bounds.right ||
              e.clientY < bounds.top ||
              e.clientY > bounds.bottom
            )
              dialog.current?.close();
          }
        }}
      >
        <div className={s.popupHead}>
          <h2 id={`${id}-title`}>{label}</h2>
          <button
            className={s.button}
            aria-label={`Close ${label.toLowerCase()} picker`}
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        {isEvent ? (
          <TimesEventSelector
            value={value}
            options={options}
            all={all}
            course={course}
            onCourseChange={onCourseChange}
            onChange={(next) => {
              onChange(next);
              dialog.current?.close();
            }}
          />
        ) : (
          <div className={s.eventGrid}>
            {[...(all ? [["", all]] : []), ...options].map(([key, text]) => (
              <button
                key={key}
                aria-pressed={value === key}
                onClick={() => {
                  onChange(key);
                  dialog.current?.close();
                }}
              >
                {text}
              </button>
            ))}
          </div>
        )}
      </dialog>
    </div>
  );
}
function FilterChips({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <fieldset className={s.courseField}>
      <legend>{label}</legend>
      <div className={s.chips}>
        {options.map(([key, text]) => (
          <button
            key={key}
            aria-pressed={value === key}
            onClick={() => onChange(key)}
          >
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
function AgeGroupPicker({
  value,
  onChange,
  options = ageOptions,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options?: [string, string][];
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <div className={s.field}>
      <label htmlFor={id}>Age group</label>
      <button
        id={id}
        className={s.eventTrigger}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <span>
          {value.length
            ? options
                .filter(([key]) => value.includes(key))
                .map(([, text]) => text)
                .join(", ")
            : "All ages"}
        </span>
        <ChevronDown size={16} />
      </button>
      <dialog
        ref={dialog}
        className={s.eventDialog}
        aria-labelledby={`${id}-title`}
      >
        <div className={s.popupHead}>
          <h2 id={`${id}-title`}>Age group</h2>
          <button
            className={s.button}
            aria-label="Close age group picker"
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        <p className={s.muted}>Select one or more recorded age groups.</p>
        <div className={s.eventGrid}>
          <button aria-pressed={!value.length} onClick={() => onChange([])}>
            All ages
          </button>
          {options.map(([key, text]) => (
            <button
              key={key}
              aria-pressed={value.includes(key)}
              onClick={() =>
                onChange(
                  value.includes(key)
                    ? value.filter((age) => age !== key)
                    : [...value, key],
                )
              }
            >
              {text}
            </button>
          ))}
        </div>
        <button className={s.button} onClick={() => dialog.current?.close()}>
          Done
        </button>
      </dialog>
    </div>
  );
}
function Pager({
  page,
  total,
  onChange,
  label = "Result pages",
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
  label?: string;
}) {
  return (
    <nav className={s.pager} aria-label={label}>
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
  const points = dailyBestTimes(races);
  if (points.length < 2)
    return (
      <p className={s.empty}>
        Timed swims on two different days are needed to show progress. Every
        available result is listed below.
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
      <p className={s.muted}>
        Fastest swim per day · lower time appears higher
      </p>
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
  race: selectedRace,
  names,
  filters,
  onAthlete,
  onRace,
  onClose,
}: {
  race: Race | null;
  names: Map<string, string>;
  filters: Filters;
  onAthlete: (id: string) => void;
  onRace: (race: Race) => void;
  onClose: () => void;
}) {
  const [basis, setBasis] = useState("bests");
  const selectedQuery = useTimes(
    selectedRace ? timesUrl("race", { raceId: selectedRace.id }) : null,
  );
  const race = selectedQuery.data?.rows?.[0]?.race ?? selectedRace;
  const analysis = useTimes(
    race
      ? timesUrl("analysis", {
          ...filters,
          genders: filters.genders.length ? filters.genders : undefined,
          raceId: race.id,
          basis,
        })
      : null,
  );
  const stats =
    race?.moderationStatus === "flagged" ? null : analysis.data?.stats;
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
              {race.relay ? (
                <p>
                  {resultName(race, names)} ·{" "}
                  {race.relayAgeGroup || "Age group unreported"}
                </p>
              ) : (
                <button
                  className={s.link}
                  onClick={() => onAthlete(race.athleteId)}
                >
                  {names.get(race.athleteId) ?? race.athleteId}
                  <ArrowUpRight size={14} />
                </button>
              )}
              <p className={s.muted}>
                {race.meet}
                <br />
                {date(race.date)}
                <br />
                {race.teamName || "Team name unavailable"} ·{" "}
                {race.official === true
                  ? "Official"
                  : race.official === false
                    ? "Unofficial"
                    : "Status unreported"}
              </p>
              <RaceDetails race={race} onAthlete={onAthlete} onRace={onRace} />
              <QueryNotice query={analysis} />
              <div className={s.percentile}>
                {!race.relay && (
                  <Select
                    label="Compare against"
                    value={basis}
                    onChange={setBasis}
                    options={[
                      ["bests", "One best time per athlete"],
                      ["swims", "Every eligible swim"],
                    ]}
                  />
                )}
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
                ) : analysis.data ? (
                  <p className={s.note}>
                    {race.relay
                      ? `${analysis.data?.count ?? 0} eligible relay performances in this comparison group. Relay times are ranked in the table.`
                      : "No percentile available. A valid individual time and an eligible comparison group are required."}
                  </p>
                ) : null}
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
                  Same event and course, using the selected team, year, gender,
                  and age groups across all meets. Only valid times matching the
                  selected round and official-result filters qualify.{" "}
                  {race.relay
                    ? "Every eligible complete relay contributes one team performance."
                    : basis === "bests"
                      ? "Each athlete contributes only their fastest eligible swim."
                      : "Athletes may contribute multiple swims."}{" "}
                  The selected swim is included when eligible.
                </p>
                <p>
                  {!race.relay &&
                    "Percentile = (slower times + half of equal times) ÷ comparison size × 100. "}{" "}
                  Individual age groups use age at the swim; relay groups use
                  the reported event age group. Results without a reported age
                  are included only when no age group is selected. Gender
                  filters include only the selected reported genders. This is
                  dataset coverage, not an official IES ranking.
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
  const athleteScroll = useRef<number | null>(null);
  const [view, setView] = useState<View>("rankings");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [recordTeam, setRecordTeam] = useState("");
  const [fromRecords, setFromRecords] = useState(false);
  const [search, setSearch] = useState("");
  const searchTerm = useDebouncedSearch(search);
  const [page, setPage] = useState(0);
  const [listPage, setListPage] = useState(0);
  const [relayPage, setRelayPage] = useState(0);
  const [meetId, setMeetId] = useState("");
  const [meetEventKey, setMeetEventKey] = useState("");
  const [meetTeam, setMeetTeam] = useState("");
  const [meetSearchOpen, setMeetSearchOpen] = useState(true);
  const [meetCourse, setMeetCourse] = useState("");
  const [meetYear, setMeetYear] = useState("");
  const [athleteId, setAthleteId] = useState("");
  const [profileName, setProfileName] = useState("");
  const [athleteSearchOpen, setAthleteSearchOpen] = useState(true);
  const [athleteEvent, setAthleteEvent] = useState("");
  const [selected, setSelected] = useState<Race | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLElement>(null);
  const enabled = hasBackendConfiguration;
  const facets = useTimes(enabled ? timesUrl("facets") : null);
  const teams = facets.data?.teams ?? [];
  const recordTeams = teams.filter(
    ([id, name]) =>
      !/unattached/i.test(`${id} ${name}`) &&
      !/^UN(?:AT|SC)(?:$|[-_\s])/i.test(id),
  );
  const years = facets.data?.years ?? [];
  const activeRecordTeam =
    recordTeams.find(([id]) => id === recordTeam)?.[0] ||
    recordTeams.find(([id]) => id === "velocity-swimming")?.[0] ||
    recordTeams[0]?.[0] ||
    "";
  const recordTeamName =
    teams.find(([id]) => id === activeRecordTeam)?.[1] ?? "";
  const queryFilters = {
    ...filters,
    genders: filters.genders.length ? filters.genders : undefined,
  };
  const rankingsQuery = useTimes(
    enabled && view === "rankings"
      ? timesUrl("rankings", {
          ...queryFilters,
          search: searchTerm,
          offset: page * pageSize,
        })
      : null,
  );
  const meetsQuery = useTimes(
    enabled && view === "meets"
      ? timesUrl("meets", {
          search: searchTerm,
          course: meetCourse,
          year: meetYear,
          offset: listPage * pageSize,
        })
      : null,
  );
  const meetEventsQuery = useTimes(
    enabled && view === "meets" && meetId
      ? timesUrl("meet_events", { meetId })
      : null,
  );
  const meetEvents = meetEventsQuery.data?.meetEvents ?? [];
  const activeMeetEvent =
    meetEvents.find((event) => event.key === meetEventKey) ?? meetEvents[0];
  const meetQuery = useTimes(
    enabled && view === "meets" && meetId && activeMeetEvent
      ? timesUrl("meet_results", {
          meetId,
          meetEventKey: activeMeetEvent.key,
          team: meetTeam,
          offset: page * pageSize,
        })
      : null,
  );
  const profileQuery = useTimes(
    enabled && view === "athletes" && athleteId && !athleteSearchOpen
      ? timesUrl("profile", { athleteId })
      : null,
  );
  const pbs = profileQuery.data?.pbs ?? [];
  const activeEvent =
    athleteEvent ||
    (pbs[0]
      ? `${pbs[0].event}_${pbs[0].course}`
      : (profileQuery.data?.events?.[0] ?? ""));
  const historyQuery = useTimes(
    enabled &&
      view === "athletes" &&
      athleteId &&
      !athleteSearchOpen &&
      activeEvent
      ? timesUrl("athlete_history", {
          athleteId,
          historyEvent: activeEvent,
          offset: page * pageSize,
        })
      : null,
  );
  const athleteRelaysQuery = useTimes(
    enabled && view === "athletes" && athleteId && !athleteSearchOpen
      ? timesUrl("athlete_relays", { athleteId, offset: relayPage * pageSize })
      : null,
  );
  const recordsQuery = useTimes(
    enabled && view === "records" && activeRecordTeam
      ? timesUrl("records", { team: activeRecordTeam })
      : null,
  );
  const races = recordsQuery.data?.races ?? [];
  const history = historyQuery.data?.points ?? [];
  const foundMeets = meetsQuery.data?.meets ?? [];
  const chosenMeet =
    meetEventsQuery.data?.meet ??
    meetQuery.data?.meet ??
    foundMeets.find((m) => m.id === meetId);
  const rowsQuery =
    view === "rankings"
      ? rankingsQuery
      : view === "meets"
        ? meetQuery
        : historyQuery;
  const displayed = rowsQuery.data?.rows ?? [];
  const names = new Map(
    [
      ...displayed.map(({ race }) => race),
      ...(selected ? [selected] : []),
      ...pbs,
      ...races,
      ...history,
    ].map((r) => [r.athleteId, r.athleteName || r.athleteId]),
  );
  if (athleteId && profileQuery.data?.name)
    names.set(athleteId, profileQuery.data.name);
  const hide25s =
    (view === "rankings" || view === "meets") &&
    hide25sForAgeGroups(filters.course, filters.ageGroups);
  const rankingEvents = [
    ...timesEvents(filters.course),
    ...timesEvents(filters.course, true),
  ].filter((event) => !hide25s || !event.startsWith("25_"));
  const summaryCourse =
    view === "meets"
      ? activeMeetEvent?.course || "All courses"
      : view === "athletes" && !athleteSearchOpen
        ? activeEvent.split("_").at(-1) || "All courses"
        : filters.course || "All courses";
  const summaryEvent =
    view === "meets"
      ? activeMeetEvent?.event || ""
      : view === "athletes" && !athleteSearchOpen
        ? activeEvent.split("_").slice(0, 2).join("_")
        : filters.event;
  const summaryTeam =
    view === "records"
      ? recordTeamName
      : teams.find(
          ([id]) => id === (view === "meets" ? meetTeam : filters.team),
        )?.[1];
  const selectedAgeLabels =
    view === "meets"
      ? activeMeetEvent?.ageGroup || "Event age group unreported"
      : ageOptions
          .filter(([key]) => filters.ageGroups.includes(key))
          .map(([, label]) => label)
          .join(", ") || "All ages";
  const selectedGenderLabels =
    (view === "meets"
      ? [activeMeetEvent?.gender || ""]
      : view === "records"
        ? ["F", "M"]
        : filters.genders
    )
      .map((gender) => ({ F: "Female", M: "Male", X: "Mixed" })[gender])
      .join(" / ") || "All genders";
  function returnToAthletes() {
    setAthleteSearchOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("athlete-search")?.focus({ preventScroll: true });
      if (athleteScroll.current != null)
        window.scrollTo({ top: athleteScroll.current, behavior: "instant" });
    });
  }
  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => {
      const next =
        key === "course"
          ? changeTimesCourse(f, String(value))
          : { ...f, [key]: value };
      if (
        (view === "rankings" || view === "meets") &&
        hide25sForAgeGroups(next.course, next.ageGroups) &&
        next.event.startsWith("25_")
      ) {
        const sameStroke50 = next.event.replace(/^25_/, "50_");
        const available = timesEvents(next.course, next.relay);
        next.event = available.includes(sameStroke50)
          ? sameStroke50
          : available.find((event) => !event.startsWith("25_")) || "";
      }
      return next;
    });
    setPage(0);
    setSelected(null);
  }
  function updateResultCategory(relay: boolean) {
    if (Boolean(filters.relay) === relay) return;
    setFilters((current) => {
      const next = changeResultCategory(current, relay, view === "meets");
      return view === "rankings" && !next.genders.length
        ? { ...next, genders: ["F"] }
        : next;
    });
    setPage(0);
    setSelected(null);
    if (view === "rankings") setSearch("");
  }
  function changeView(next: View) {
    setView(next);
    setMeetSearchOpen(true);
    setFromRecords(false);
    setAthleteSearchOpen(!athleteId);
    setListPage(0);
    setSearch("");
    setPage(0);
    setSelected(null);
    setFilters(
      next === "rankings"
        ? { ...initialFilters }
        : { ...initialFilters, course: "", event: "", genders: [] },
    );
  }
  function openRecord(selection: RecordSelection) {
    changeView("rankings");
    setFilters({
      ...initialFilters,
      team: activeRecordTeam,
      course: selection.course,
      event: selection.event,
      genders: [selection.gender],
      ageGroups: [selection.ageGroup],
      mode: "performances",
      relay: selection.relay ?? false,
    });
    setFromRecords(true);
    requestAnimationFrame(() =>
      document
        .getElementById("times-rankings")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }
  function openAthlete(id: string) {
    if (!id) return;
    setRelayPage(0);
    if (view === "athletes") athleteScroll.current = window.scrollY;
    else changeView("athletes");
    setAthleteId(id);
    setProfileName(names.get(id) ?? "");
    setPage(0);
    setSelected(null);
    setAthleteSearchOpen(false);
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
  const tableRelay =
    view === "meets" ? Boolean(activeMeetEvent?.relay) : Boolean(filters.relay);
  const table = (
    <>
      <div className={s.tableWrap}>
        <table
          aria-busy={rowsQuery.loading}
          className={`${s.table} ${view === "rankings" ? s.rankingTable : ""}`}
        >
          <caption className="sr-only">
            {view === "rankings"
              ? filters.mode === "bests"
                ? "Event Rankings, one best swim per athlete in the selected age groups"
                : "Event Rankings, every matching performance"
              : tableRelay
                ? "Relay team results"
                : "Individual swim results"}
          </caption>
          <thead>
            <tr>
              {view === "rankings" && (
                <th scope="col" className={s.rank}>
                  <span className="sr-only">Rank</span>
                </th>
              )}
              <th scope="col">
                {view === "athletes"
                  ? "Meet"
                  : tableRelay
                    ? "Relay team"
                    : "Athlete"}
              </th>
              {view !== "rankings" && <th scope="col">Event</th>}
              <th scope="col">Time</th>
              <th scope="col">{view === "rankings" ? "Date" : "Round"}</th>
              {view === "rankings" && (
                <>
                  <th scope="col" className={s.rankingTeam}>
                    Team
                  </th>
                  <th scope="col" className={s.rankingMeet}>
                    Meet
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody
            className={rowsQuery.loading ? loadingStyles.pulse : undefined}
          >
            {rowsQuery.loading &&
              Array.from(
                { length: rowsQuery.placeholderRowCount || pageSize },
                (_, index) => (
                  <tr key={`loading-${index}`} aria-hidden="true">
                    {view === "rankings" && (
                      <td className={s.rank}>
                        <span
                          className={loadingStyles.bar}
                          style={{ width: 16 }}
                        />
                      </td>
                    )}
                    <td>
                      <span
                        className={loadingStyles.bar}
                        style={{ width: 150 }}
                      />
                    </td>
                    {view !== "rankings" && (
                      <td>
                        <span
                          className={loadingStyles.bar}
                          style={{ width: 100 }}
                        />
                      </td>
                    )}
                    <td>
                      <span
                        className={loadingStyles.bar}
                        style={{ width: 60, height: 24 }}
                      />
                    </td>
                    <td>
                      <span
                        className={loadingStyles.bar}
                        style={{ width: 85 }}
                      />
                    </td>
                    {view === "rankings" && (
                      <>
                        <td className={s.rankingTeam}>
                          <span
                            className={loadingStyles.bar}
                            style={{ width: 120 }}
                          />
                        </td>
                        <td className={s.rankingMeet}>
                          <span
                            className={loadingStyles.bar}
                            style={{ width: "70%" }}
                          />
                        </td>
                      </>
                    )}
                  </tr>
                ),
              )}
            {displayed.map(({ race, rank }) => (
              <tr
                key={race.id}
                className={selected?.id === race.id ? s.selected : undefined}
                onClick={() => selectRace(race)}
              >
                {view === "rankings" && <td className={s.rank}>{rank}</td>}
                <td>
                  {view === "athletes" ? (
                    race.meet
                  ) : race.relay ? (
                    <RelayLineup race={race} />
                  ) : (
                    <>
                      <button
                        className={s.link}
                        onClick={(e) => {
                          e.stopPropagation();
                          openAthlete(race.athleteId);
                        }}
                      >
                        {names.get(race.athleteId) ?? race.athleteId}
                      </button>
                    </>
                  )}
                  {view === "rankings" &&
                    race.resultOrigin === "relay_leadoff" && (
                      <span className={s.resultTag}>Verified lead-off</span>
                    )}
                </td>
                {view !== "rankings" && (
                  <td>
                    {race.course} {race.event.split("_").slice(0, 2).join(" ")}
                    {race.resultOrigin === "relay_leadoff" && (
                      <span className={s.resultTag}>Verified lead-off</span>
                    )}
                  </td>
                )}
                <td>
                  <button
                    className={s.time}
                    aria-label={`Analyze ${race.status === "OK" ? formatSwimTime(race.time) : race.status} by ${resultName(race, names)}`}
                    onClick={() => selectRace(race)}
                  >
                    {race.status === "OK"
                      ? formatSwimTime(race.time)
                      : race.status || "—"}
                  </button>
                  <ModerationNotice race={race} />
                </td>
                <td>
                  {view === "rankings" ? (
                    <button
                      className={s.link}
                      title={race.meet}
                      aria-label={`View ${race.meet} results from ${date(race.date)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        changeView("meets");
                        setMeetId(race.meetId);
                        setMeetEventKey("");
                        setMeetTeam("");
                        setMeetSearchOpen(false);
                        showProfile();
                      }}
                    >
                      {date(race.date)}
                    </button>
                  ) : (
                    (rounds[race.round] ?? race.round)
                  )}
                </td>
                {view === "rankings" && (
                  <>
                    <td className={`${s.teamCell} ${s.rankingTeam}`}>
                      {race.teamName ||
                        teams.find(([id]) => id === race.team)?.[1] ||
                        "Team unavailable"}
                    </td>
                    <td className={s.rankingMeet}>
                      <button
                        className={s.link}
                        onClick={(e) => {
                          e.stopPropagation();
                          changeView("meets");
                          setMeetId(race.meetId);
                          setMeetEventKey("");
                          setMeetTeam("");
                          setMeetSearchOpen(false);
                          showProfile();
                        }}
                      >
                        {race.meet || "Meet unavailable"}
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rowsQuery.loading && !displayed.length && (
        <div className={s.empty}>
          <Search size={24} style={{ margin: "auto" }} />
          <h3>No matching results</h3>
          <p>Try another event or broaden your filters.</p>
        </div>
      )}
      {rowsQuery.loading ? (
        <div className={s.pager} aria-hidden="true">
          <span
            className={loadingStyles.bar}
            style={{ width: 90, height: 36 }}
          />
          <span className={loadingStyles.bar} style={{ width: 100 }} />
          <span
            className={loadingStyles.bar}
            style={{ width: 90, height: 36 }}
          />
        </div>
      ) : (
        <Pager
          page={page}
          total={rowsQuery.data?.total ?? 0}
          onChange={setPage}
        />
      )}
    </>
  );
  return (
    <main className={s.page} data-times-page="">
      <header className={s.toolHeader}>
        <nav className={s.tabs} aria-label="Explore times">
          <Link href="/tools">
            <ChevronLeft size={17} />
            Tools Page
          </Link>
          {(
            [
              ["rankings", "Event Rankings", BarChart3],
              ["records", "Team Records", Trophy],
              ["standards", "Time Standards", Timer],
              ["meets", "Meet Results", CalendarDays],
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
        {view !== "records" && view !== "standards" && (
          <dl className={s.filterSummary} aria-label="Selected times filters">
            <div>
              <dt className={view === "rankings" ? "sr-only" : undefined}>
                Course
              </dt>
              <dd>{summaryCourse}</dd>
            </div>
            <div>
              <dt className={view === "rankings" ? "sr-only" : undefined}>
                Event
              </dt>
              <dd>{summaryEvent ? eventLabel(summaryEvent) : "All events"}</dd>
            </div>
            <div>
              <dt className={view === "rankings" ? "sr-only" : undefined}>
                Age group
              </dt>
              <dd>{selectedAgeLabels}</dd>
            </div>
            <div>
              <dt className={view === "rankings" ? "sr-only" : undefined}>
                Gender
              </dt>
              <dd>{selectedGenderLabels}</dd>
            </div>
            {summaryTeam && (
              <div>
                <dt className={view === "rankings" ? "sr-only" : undefined}>
                  Team
                </dt>
                <dd>{summaryTeam}</dd>
              </div>
            )}
          </dl>
        )}
      </header>
      <div className={s.content}>
        {!hasBackendConfiguration && (
          <div className={s.notice} role="status">
            The times database is not connected yet. Approved results will
            appear here once it is available.
          </div>
        )}
        <QueryNotice query={facets} />
        {view === "meets" && meetId && !chosenMeet && (
          <QueryNotice query={meetEventsQuery} />
        )}
        <div
          className={`${s.workspace} ${view === "standards" || view === "records" || (view === "athletes" && athleteSearchOpen) || ((view === "rankings" || view === "meets") && !selected) ? s.recordsWorkspace : ""}`}
        >
          <div className={s.main}>
            {view === "standards" ? (
              <TimeStandards />
            ) : view === "records" ? (
              <>
                <QueryNotice query={recordsQuery} />
                <TeamRecords
                  races={races}
                  team={activeRecordTeam}
                  teamName={recordTeamName}
                  ready={Boolean(recordsQuery.data)}
                  loading={recordsQuery.loading || facets.loading}
                  names={names}
                  onRecord={openRecord}
                  selector={
                    <PopupPicker
                      label="Record team"
                      hideLabel
                      showChevron={false}
                      value={activeRecordTeam}
                      onChange={setRecordTeam}
                      options={recordTeams}
                    />
                  }
                />
              </>
            ) : (
              <>
                <section
                  hidden={view === "meets" && !meetSearchOpen}
                  id="times-rankings"
                  className={s.panel}
                  aria-label={
                    view === "rankings"
                      ? "Event Rankings"
                      : view === "meets"
                        ? "Meet browser"
                        : "Athlete browser"
                  }
                >
                  {view !== "rankings" && (
                    <div className={s.panelHead}>
                      <div>
                        <h2>
                          {view === "meets" ? "Find a meet" : "Team athletes"}
                        </h2>
                        <p>
                          {view === "meets"
                            ? "Browse approved results, then select a meet to explore each swim."
                            : "Choose a team to compare athletes across their strongest events."}
                        </p>
                      </div>
                      {view === "athletes" && athleteId && (
                        <button
                          className={s.button}
                          aria-expanded={athleteSearchOpen}
                          aria-controls="athlete-search"
                          onClick={() =>
                            athleteSearchOpen
                              ? setAthleteSearchOpen(false)
                              : returnToAthletes()
                          }
                        >
                          {athleteSearchOpen
                            ? "Hide team list"
                            : "← Back to team athletes"}
                        </button>
                      )}
                    </div>
                  )}
                  <div
                    id={view === "athletes" ? "athlete-search" : undefined}
                    tabIndex={view === "athletes" ? -1 : undefined}
                    hidden={view === "athletes" && !athleteSearchOpen}
                  >
                    {view === "rankings" && fromRecords && (
                      <div className={s.recordBreadcrumb}>
                        <button
                          className={s.link}
                          onClick={() => changeView("records")}
                        >
                          ← Team records
                        </button>
                        <span>
                          {teams.find(([id]) => id === filters.team)?.[1]} ·{" "}
                          {filters.course} {filters.event.replace("_", " ")} ·{" "}
                          {filters.genders[0] === "F"
                            ? "Girls"
                            : filters.genders[0] === "M"
                              ? "Boys"
                              : "Mixed"}{" "}
                          ·{" "}
                          {ageOptions
                            .filter(([key]) => filters.ageGroups.includes(key))
                            .map(([, label]) => label)
                            .join(", ") || "All ages"}
                        </span>
                      </div>
                    )}
                    {view === "rankings" && (
                      <div className={s.filters}>
                        <PopupPicker
                          label="Event"
                          course={filters.course}
                          onCourseChange={(course) =>
                            updateFilter("course", course)
                          }
                          value={filters.event}
                          onChange={(event) => {
                            updateResultCategory(event.endsWith("-R"));
                            updateFilter("event", event);
                          }}
                          options={rankingEvents.map((e) => [e, eventLabel(e)])}
                        />
                        <div className={s.secondaryFilters}>
                          <fieldset className={s.courseField}>
                            <legend>Gender</legend>
                            <div className={s.chips}>
                              {[
                                ["F", "Female"],
                                ["M", "Male"],
                                ...(filters.relay ? [["X", "Mixed"]] : []),
                              ].map(([id, label]) => (
                                <button
                                  key={id}
                                  aria-pressed={filters.genders.includes(id)}
                                  onClick={() => {
                                    const current = filters.genders;
                                    const next = current.includes(id)
                                      ? current.filter((g) => g !== id)
                                      : [...current, id];
                                    if (next.length)
                                      updateFilter("genders", next);
                                  }}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </fieldset>
                          <AgeGroupPicker
                            options={ageOptions}
                            value={filters.ageGroups}
                            onChange={(v) => updateFilter("ageGroups", v)}
                          />
                          {!filters.relay && (
                            <FilterChips
                              label="Results"
                              value={filters.mode}
                              onChange={(v) =>
                                updateFilter("mode", v as Filters["mode"])
                              }
                              options={[
                                ["bests", "Bests"],
                                ["performances", "Performances"],
                              ]}
                            />
                          )}
                          <PopupPicker
                            label="Team"
                            value={filters.team}
                            onChange={(v) => updateFilter("team", v)}
                            all="All IES Teams"
                            options={teams}
                          />
                          <PopupPicker
                            label="Year"
                            value={filters.year}
                            onChange={(v) => updateFilter("year", v)}
                            all="All years"
                            options={years.map((y) => [y, y])}
                          />
                        </div>
                      </div>
                    )}
                    {view === "meets" && (
                      <div className={s.filters}>
                        <Select
                          label="Meet search course"
                          value={meetCourse}
                          onChange={(value) => {
                            setMeetCourse(value);
                            setListPage(0);
                          }}
                          all="All courses"
                          options={["SCY", "LCM", "SCM"].map((course) => [
                            course,
                            course,
                          ])}
                        />
                        <Select
                          label="Meet search year"
                          value={meetYear}
                          onChange={(value) => {
                            setMeetYear(value);
                            setListPage(0);
                          }}
                          all="All years"
                          options={years.map((year) => [year, year])}
                        />
                      </div>
                    )}
                    {view !== "athletes" && (
                      <div className={s.toolbar}>
                        <label className={s.field}>
                          <span className="sr-only">
                            {view === "meets"
                              ? "Search meets"
                              : filters.relay
                                ? "Search relay teams"
                                : "Search athletes"}
                          </span>
                          <input
                            type="search"
                            placeholder={
                              view === "meets"
                                ? "Search meet name…"
                                : filters.relay
                                  ? "Search relay team…"
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
                              setFilters({ ...initialFilters });
                              setSearch("");
                              setPage(0);
                              setSelected(null);
                            }}
                          >
                            Reset filters
                          </button>
                        )}
                      </div>
                    )}
                    {view === "athletes" ? (
                      <AthleteBrowser
                        teams={teams}
                        onAthlete={openAthlete}
                        enabled={athleteSearchOpen}
                      />
                    ) : view === "rankings" ? (
                      <>
                        <QueryNotice query={rankingsQuery} />
                        {(rankingsQuery.data || rankingsQuery.loading) && table}
                      </>
                    ) : (
                      <>
                        <div className={s.meetNotice}>
                          <QueryNotice query={meetsQuery} />
                        </div>
                        {meetsQuery.loading && (
                          <div
                            className={`${s.cards} ${loadingStyles.pulse}`}
                            aria-hidden="true"
                            data-loading-meets=""
                          >
                            {Array.from({ length: 6 }, (_, index) => (
                              <div key={index} className={s.card}>
                                <span
                                  className={loadingStyles.bar}
                                  style={{ width: "40%" }}
                                />
                                <span
                                  className={loadingStyles.bar}
                                  style={{ width: "80%", height: 22 }}
                                />
                                <span
                                  className={loadingStyles.bar}
                                  style={{ width: "55%" }}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        {meetsQuery.data && (
                          <>
                            <div className={s.cards}>
                              {view === "meets"
                                ? foundMeets.map((m) => (
                                    <button
                                      key={m.id}
                                      className={s.card}
                                      aria-pressed={meetId === m.id}
                                      onClick={() => {
                                        setMeetId(m.id);
                                        setMeetEventKey("");
                                        setMeetTeam("");
                                        setMeetSearchOpen(false);
                                        showProfile();
                                        setPage(0);
                                        setSelected(null);
                                      }}
                                    >
                                      <span>
                                        {date(m.date)} ·{" "}
                                        {[...m.courses].join(" / ")}
                                      </span>
                                      <strong>{m.name}</strong>
                                      <span>
                                        {number(m.count)} approved results ↗
                                      </span>
                                    </button>
                                  ))
                                : null}
                            </div>
                            {!foundMeets.length && (
                              <p className={s.empty}>
                                No matching{" "}
                                {view === "meets" ? "meets" : "athletes"}. Try a
                                different name or broaden the filters.
                              </p>
                            )}
                            <Pager
                              page={listPage}
                              total={meetsQuery.data?.total ?? 0}
                              onChange={setListPage}
                            />
                          </>
                        )}
                      </>
                    )}
                  </div>
                </section>
                {view === "meets" && chosenMeet && (
                  <section className={s.panel} ref={profileRef} tabIndex={-1}>
                    <div className={s.panelHead}>
                      <div>
                        <span className={s.badge}>Meet results</span>
                        <h2>{chosenMeet.name}</h2>
                        <p>
                          {date(chosenMeet.date)} · {number(chosenMeet.count)}{" "}
                          approved results
                        </p>
                      </div>
                      <button
                        className={s.button}
                        aria-expanded={meetSearchOpen}
                        aria-controls="times-rankings"
                        onClick={() => {
                          setMeetSearchOpen((open) => !open);
                          if (!meetSearchOpen)
                            requestAnimationFrame(() => {
                              document
                                .getElementById("times-rankings")
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                });
                              document
                                .querySelector<HTMLInputElement>(
                                  'input[placeholder="Search meet name…"]',
                                )
                                ?.focus({ preventScroll: true });
                            });
                        }}
                      >
                        {meetSearchOpen
                          ? "Hide meet finder"
                          : "Find another meet"}
                      </button>
                    </div>
                    <QueryNotice query={meetEventsQuery} />
                    {meetEventsQuery.loading && (
                      <p className={s.note}>Loading meet events…</p>
                    )}
                    {meetEventsQuery.data && !meetEvents.length && (
                      <p className={s.empty}>
                        No events with available results for this meet.
                      </p>
                    )}
                    {activeMeetEvent && (
                      <div className={s.meetEventLayout}>
                        <MeetEventNavigation
                          events={meetEvents}
                          selectedKey={activeMeetEvent.key}
                          onSelect={(key) => {
                            setMeetEventKey(key);
                            setPage(0);
                            setSelected(null);
                          }}
                        />
                        <section
                          id="meet-event-results"
                          className={s.meetEventResults}
                          aria-label="Selected event results"
                        >
                          <h3>{meetEventLabel(activeMeetEvent)}</h3>
                          <p className={s.note}>
                            {activeMeetEvent.ordering === "official"
                              ? "Official event order"
                              : "Event order unavailable — grouped by event"}
                          </p>
                          <div className={s.filters}>
                            <PopupPicker
                              label="Meet team"
                              value={meetTeam}
                              onChange={(team) => {
                                setMeetTeam(team);
                                setPage(0);
                                setSelected(null);
                              }}
                              all="All IES Teams"
                              options={teams}
                            />
                          </div>
                          <QueryNotice query={rowsQuery} />
                          {(rowsQuery.data || rowsQuery.loading) && table}
                        </section>
                      </div>
                    )}
                  </section>
                )}
                {view === "athletes" && athleteId && (
                  <section
                    className={s.panel}
                    ref={profileRef}
                    tabIndex={-1}
                    hidden={athleteSearchOpen}
                  >
                    <div className={s.panelHead}>
                      <div>
                        <span className={s.badge}>Athlete profile</span>
                        <h2>
                          {profileQuery.data?.name ||
                            profileName ||
                            "Athlete profile"}
                        </h2>
                        {profileQuery.data && (
                          <p>
                            {pbs.length} personal bests ·{" "}
                            {number(profileQuery.data?.count ?? 0)} individual
                            results ·{" "}
                            {number(
                              profileQuery.data?.relayCount ??
                                athleteRelaysQuery.data?.total ??
                                0,
                            )}{" "}
                            relay appearances
                          </p>
                        )}
                      </div>
                    </div>
                    <QueryNotice query={profileQuery} />
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
                          aria-pressed={
                            activeEvent === `${r.event}_${r.course}`
                          }
                          onClick={() => {
                            setAthleteEvent(`${r.event}_${r.course}`);
                            setPage(0);
                            setSelected(null);
                          }}
                        >
                          <span>{eventLabel(r.event)}</span>
                          {r.resultOrigin === "relay_leadoff" && (
                            <span className={s.resultTag}>
                              Verified lead-off
                            </span>
                          )}
                          <strong>{formatSwimTime(r.time)}</strong>
                          <span>
                            {r.course} · {date(r.date)}
                          </span>
                        </button>
                      ))}
                    </div>
                    {profileQuery.data && !pbs.length && (
                      <p className={s.empty}>
                        No valid individual personal bests are available.
                      </p>
                    )}
                    <div className={s.toolbar}>
                      <PopupPicker
                        label="Event history"
                        value={activeEvent}
                        onChange={(v) => {
                          setAthleteEvent(v);
                          setPage(0);
                          setSelected(null);
                        }}
                        options={(profileQuery.data?.events ?? []).map((e) => [
                          e,
                          `${eventLabel(e)} · ${e.split("_").at(-1)}`,
                        ])}
                      />
                    </div>
                    {historyQuery.data && <ProgressChart races={history} />}
                    <QueryNotice query={rowsQuery} />
                    {(rowsQuery.data || rowsQuery.loading) && table}
                    <section aria-label="Athlete relay participation">
                      <div className={s.toolbar}>
                        <h3>Relay participation</h3>
                        <span className={s.muted}>
                          Complete team results · your recorded leg
                        </span>
                      </div>
                      <QueryNotice query={athleteRelaysQuery} />
                      {(athleteRelaysQuery.data ||
                        athleteRelaysQuery.loading) && (
                        <>
                          <div className={s.tableWrap}>
                            <table
                              className={s.table}
                              aria-busy={athleteRelaysQuery.loading}
                            >
                              <caption className="sr-only">
                                Athlete relay participation
                              </caption>
                              <thead>
                                <tr>
                                  <th scope="col">Meet</th>
                                  <th scope="col">Relay</th>
                                  <th scope="col">Leg</th>
                                  <th scope="col">Team time</th>
                                </tr>
                              </thead>
                              <tbody
                                className={
                                  athleteRelaysQuery.loading
                                    ? loadingStyles.pulse
                                    : undefined
                                }
                              >
                                {athleteRelaysQuery.loading &&
                                  Array.from(
                                    {
                                      length:
                                        athleteRelaysQuery.placeholderRowCount ||
                                        pageSize,
                                    },
                                    (_, index) => (
                                      <tr
                                        key={`loading-${index}`}
                                        aria-hidden="true"
                                      >
                                        {[150, 100, 25, 65].map(
                                          (width, column) => (
                                            <td key={column}>
                                              <span
                                                className={loadingStyles.bar}
                                                style={{ width }}
                                              />
                                            </td>
                                          ),
                                        )}
                                      </tr>
                                    ),
                                  )}
                                {(athleteRelaysQuery.data?.rows ?? []).map(
                                  ({ race }) => {
                                    const member = race.members?.find(
                                      (member) =>
                                        member.athleteId === athleteId,
                                    );
                                    return (
                                      <tr key={race.id}>
                                        <td>
                                          {race.meet}
                                          <span className={s.resultTag}>
                                            {date(race.date)}
                                          </span>
                                        </td>
                                        <td>
                                          {eventLabel(race.event)} ·{" "}
                                          {race.course}
                                        </td>
                                        <td>{member?.leg ?? "—"}</td>
                                        <td>
                                          <button
                                            className={s.time}
                                            aria-label={`View relay ${eventLabel(race.event)} at ${race.meet}`}
                                            onClick={() => selectRace(race)}
                                          >
                                            {race.status === "OK"
                                              ? formatSwimTime(race.time)
                                              : race.status || "—"}
                                          </button>
                                          <ModerationNotice race={race} />
                                        </td>
                                      </tr>
                                    );
                                  },
                                )}
                              </tbody>
                            </table>
                          </div>
                          {!athleteRelaysQuery.loading &&
                            !athleteRelaysQuery.data?.rows?.length && (
                              <p className={s.empty}>
                                No recorded relay participation is available.
                              </p>
                            )}
                          <Pager
                            page={relayPage}
                            total={athleteRelaysQuery.data?.total ?? 0}
                            onChange={setRelayPage}
                            label="Relay participation pages"
                          />
                        </>
                      )}
                    </section>
                  </section>
                )}
                <p className={s.footer}>
                  Approved IES dataset only; coverage may be incomplete.
                  Rankings exclude disqualifications, scratches, and missing
                  times. Verified flat-start relay lead-offs can count toward
                  individual personal bests; flying-start splits remain relay
                  details. Relay rankings use complete team results. Equal times
                  share a rank. Individual age groups use age at the swim; relay
                  groups use the reported event age group. All IES Teams
                  includes unattached IES entries. Gender filters include only
                  the selected reported genders. Unreported ages are included
                  when no age group is selected.
                </p>
              </>
            )}
          </div>
          <div
            ref={detailRef}
            tabIndex={-1}
            hidden={
              view === "standards" ||
              view === "records" ||
              (view === "athletes" && athleteSearchOpen) ||
              ((view === "rankings" || view === "meets") && !selected)
            }
          >
            <Performance
              race={selected}
              names={names}
              filters={filters}
              onAthlete={openAthlete}
              onRace={selectRace}
              onClose={() => setSelected(null)}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
