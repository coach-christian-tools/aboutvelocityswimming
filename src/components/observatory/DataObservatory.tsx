"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Orbit,
  X,
} from "lucide-react";
import {
  archiveColor,
  archiveFilters,
  type ArchiveData,
} from "@/lib/observatory";
import { getOverviewView, overviewViews } from "@/lib/tool-directory";
import { timesViewHref } from "@/components/collection/times-url-state";
import SearchableSelect, {
  searchableSelectThreshold,
} from "@/components/shared/SearchableSelect";
import ArchiveViews from "./ArchiveViews";
import styles from "./DataObservatory.module.css";

const number = (value: number) => value.toLocaleString("en-US");
const descriptions = {
  treemap:
    "A map of swimming history. The larger the tile, the more swims it holds.",
  pixels:
    "The scale of the archive, one square at a time. Dive in to find an individual swim.",
  skyline:
    "A city built from competition. Explore the peaks and quiet stretches of the archive.",
  fingerprints:
    "Every career has a rhythm. Explore appearances, long runs, and gaps between meets.",
  universe:
    "A constellation of swimmers. Follow an athlete to the meets that connect their career.",
  growth:
    "Watch swimming history accumulate, by competition date or arrival in the archive.",
};

export default function DataObservatory() {
  const params = useSearchParams(),
    pathname = usePathname();
  const view = getOverviewView(params.get("view"));
  const serialized = params.toString();
  let validation = "";
  let filters = archiveFilters(new URLSearchParams());
  try {
    filters = archiveFilters(new URLSearchParams(serialized));
  } catch (error) {
    validation = error instanceof Error ? error.message : "Invalid filters.";
  }
  const query = new URLSearchParams(
    Object.entries(filters).map(([key, value]) => [key, String(value)]),
  ).toString();
  const [response, setResponse] = useState<{
    query: string;
    data?: ArchiveData;
    error?: string;
  }>();
  const [retry, setRetry] = useState(0),
    [zoom, setZoom] = useState(1),
    [raceId, setRaceId] = useState("");
  const data = response?.query === query ? response.data : undefined;
  const error = validation || (response?.query === query ? response.error : "");
  const loading = !error && !data;

  useEffect(() => {
    if (validation) return;
    const controller = new AbortController();
    fetch(`/api/times/observatory?${query}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (result) => {
        const body = await result.json();
        if (!result.ok)
          throw new Error(body.error || "The archive could not be loaded.");
        if (!controller.signal.aborted) setResponse({ query, data: body });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResponse({
            query,
            error:
              error instanceof Error
                ? error.message
                : "The archive could not be loaded.",
          });
      });
    return () => controller.abort();
  }, [query, retry, validation]);

  function update(changes: Record<string, string>, resetPage = true) {
    if (changes.view) setZoom(1);
    const next = new URLSearchParams(window.location.search);
    if (resetPage) {
      next.delete("athleteOffset");
      next.delete("resultOffset");
    }
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    window.history.pushState(
      null,
      "",
      `${pathname}${next.size ? `?${next}` : ""}`,
    );
    if (!changes.view) setRaceId("");
  }
  function select(key: "year" | "meet" | "athlete" | "race", id: string) {
    if (key === "race") {
      setRaceId(id);
      document
        .getElementById("archive-details")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    update(
      key === "year" ? { year: id, meet: "", athlete: "" } : { [key]: id },
    );
    setZoom(1);
  }
  const chosenMeet = data?.meets.find((m) => m.id === filters.meet);
  const chosenAthlete = data?.athletes.find((a) => a.id === filters.athlete);
  const chosenRace = data?.results.find((r) => r.id === raceId);
  const selected = !!(filters.meet || filters.athlete);
  const athleteView = view === "fingerprints" || view === "universe";
  const teamFacets =
    response?.data?.facets.teams ??
    (filters.team ? [{ id: filters.team, name: filters.team }] : []);
  const chartAthletes =
    athleteView && !filters.athlete ? (data?.athletes ?? []) : [];
  const showAthletePicker = chartAthletes.length >= searchableSelectThreshold;
  const teamNames = showAthletePicker
    ? new Map(teamFacets.map(({ id, name }) => [id, name]))
    : undefined;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            <Orbit size={16} aria-hidden="true" /> VELOCITY / OVERVIEW
          </p>
          <h1>
            Data Observatory<span>.</span>
          </h1>
          <p className={styles.intro}>
            Every swim has a story. Explore the history behind the numbers.
          </p>
        </div>
        <span className={styles.archiveBadge}>
          <span /> THE SWIMMING ARCHIVE
        </span>
      </header>

      <section
        className={styles.stats}
        aria-label="Filtered archive totals"
        aria-busy={loading}
      >
        {(
          [
            ["SWIMS", data?.totals.swims],
            ["MEETS", data?.totals.meets],
            ["ATHLETES", data?.totals.athletes],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <strong>{value === undefined ? "—" : number(value)}</strong>
            <span>{label}</span>
          </div>
        ))}
        <div className={styles.dateStat}>
          <strong>
            {data?.totals.first
              ? `${data.totals.first.slice(0, 4)} — ${data.totals.last?.slice(0, 4)}`
              : "—"}
          </strong>
          <span>YEARS REPRESENTED</span>
        </div>
      </section>

      <section
        className={styles.filters}
        aria-label="Explore the archive filters"
      >
        <form
          className={styles.search}
          key={filters.search}
          onSubmit={(event) => {
            event.preventDefault();
            update({
              search: String(
                new FormData(event.currentTarget).get("search") ?? "",
              ).trim(),
              meet: "",
              athlete: "",
            });
          }}
        >
          <Search size={18} aria-hidden="true" />
          <input
            name="search"
            aria-label="Search meets or swimmers"
            defaultValue={filters.search}
            placeholder="Search meets or swimmers…"
            maxLength={100}
          />
          <button type="submit" aria-label="Search archive">
            <ArrowRight size={18} />
          </button>
        </form>
        <label>
          Year
          <select
            value={filters.year}
            onChange={(e) =>
              update({ year: e.target.value, meet: "", athlete: "" })
            }
          >
            <option value="">All years</option>
            {(data?.facets.years ?? (filters.year ? [filters.year] : [])).map(
              (year) => (
                <option key={year}>{year}</option>
              ),
            )}
          </select>
        </label>
        <SearchableSelect
          label="Team"
          fieldClassName={styles.teamField}
          className={styles.teamSelect}
          value={filters.team}
          onChange={(team) => update({ team, meet: "", athlete: "" })}
          options={teamFacets.map(({ id, name }) => [id, name])}
          emptyLabel="All teams"
          searchPlaceholder="Search teams"
        />
        <label>
          Course
          <select
            value={filters.course}
            onChange={(e) => update({ course: e.target.value })}
          >
            <option value="">All courses</option>
            {["SCY", "SCM", "LCM"].map((course) => (
              <option key={course}>{course}</option>
            ))}
          </select>
        </label>
        <button
          className={styles.reset}
          onClick={() => {
            window.history.pushState(null, "", `${pathname}?view=${view}`);
            setZoom(1);
            setRaceId("");
          }}
          title="Reset all filters"
        >
          <RotateCcw size={15} />
          Reset
        </button>
      </section>

      <div className={styles.viewBar}>
        <span>VIEW AS</span>
        <div role="group" aria-label="Archive visualization">
          {overviewViews.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-pressed={view === id}
              onClick={() => update({ view: id }, false)}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <section
        className={styles.explorer}
        aria-label="Archive explorer"
        aria-busy={loading}
      >
        <div className={styles.explorerHeader}>
          <nav aria-label="Archive breadcrumbs" className={styles.breadcrumbs}>
            <button onClick={() => update({ year: "", meet: "", athlete: "" })}>
              Entire archive
            </button>
            {filters.year && (
              <>
                <ChevronRight size={14} />
                <button onClick={() => update({ meet: "", athlete: "" })}>
                  {filters.year}
                </button>
              </>
            )}
            {filters.meet && (
              <>
                <ChevronRight size={14} />
                <button onClick={() => update({ athlete: "" })}>
                  {chosenMeet?.name ?? "Selected meet"}
                </button>
              </>
            )}
            {filters.athlete && (
              <>
                <ChevronRight size={14} />
                <span>{chosenAthlete?.name ?? "Selected athlete"}</span>
              </>
            )}
          </nav>
          <div
            className={styles.zoom}
            role="group"
            aria-label="Visualization zoom"
          >
            <button
              aria-label="Zoom out"
              disabled={zoom <= 1}
              onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
            >
              <Minus size={15} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              aria-label="Zoom in"
              disabled={
                zoom >= 4 || view === "fingerprints" || view === "growth"
              }
              onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
            >
              <Plus size={15} />
            </button>
          </div>
        </div>
        <div className={styles.explorerTitle}>
          <div>
            <h2>{overviewViews.find(([id]) => id === view)?.[1]}</h2>
            <p>{descriptions[view]}</p>
          </div>
          {showAthletePicker && (
            <SearchableSelect
              label="Athletes in this chart"
              fieldClassName={styles.athleteField}
              className={styles.athleteSelect}
              options={chartAthletes.map(({ id, name, teams }) => {
                const team = teams[0]?.id;
                const teamName = team ? teamNames?.get(team) : undefined;
                return [id, teamName ? `${name} · ${teamName}` : name, team];
              })}
              emptyLabel="Select an athlete"
              searchPlaceholder="Search athletes"
              onChange={(id) => {
                if (id) select("athlete", id);
              }}
            />
          )}
        </div>
        {error ? (
          <div className={styles.emptyChart} role="alert">
            <h3>Unable to open the archive</h3>
            <p>{error}</p>
            <button
              onClick={() =>
                validation
                  ? window.history.pushState(null, "", pathname)
                  : setRetry((r) => r + 1)
              }
            >
              {validation ? "Clear invalid filters" : "Try again"}
            </button>
          </div>
        ) : loading ? (
          <div className={styles.loading} role="status">
            <Orbit size={36} />
            <p>Mapping the swimming archive…</p>
          </div>
        ) : data && !data.totals.swims ? (
          <div className={styles.emptyChart}>
            <Search size={30} />
            <h3>No swims in this selection</h3>
            <p>Try another name, year, team, or course.</p>
            <button
              onClick={() =>
                window.history.pushState(null, "", `${pathname}?view=${view}`)
              }
            >
              Explore the full archive
            </button>
          </div>
        ) : (
          data && (
            <ArchiveViews
              data={data}
              filters={filters}
              view={view}
              zoom={zoom}
              select={select}
            />
          )
        )}
        <div className={styles.legend}>
          {athleteView
            ? data?.facets.teams
                .filter((team) =>
                  data.athletes.some((a) => a.teams[0]?.id === team.id),
                )
                .slice(0, 10)
                .map((team) => (
                  <button
                    key={team.id}
                    onClick={() =>
                      update({ team: team.id, athlete: "", meet: "" })
                    }
                  >
                    <i style={{ background: archiveColor(team.id) }} />
                    {team.name}
                  </button>
                ))
            : data?.years.slice(0, 12).map((year) => (
                <button key={year.id} onClick={() => select("year", year.id)}>
                  <i style={{ background: archiveColor(year.id) }} />
                  {year.id || "Unknown"}
                </button>
              ))}
          <span>
            {data
              ? `${number(data.totals.swims)} individual swims in this selection`
              : "Approved individual race results"}
          </span>
        </div>
      </section>

      {data && data.totals.swims > 0 && (
        <>
          {athleteView && (
            <div className={styles.pagination}>
              <span>
                Athletes {filters.athleteOffset + 1}–
                {filters.athleteOffset + data.athletes.length} of{" "}
                {number(data.totals.athletes)}, ordered by swim count
              </span>
              <div>
                <button
                  disabled={!filters.athleteOffset}
                  onClick={() =>
                    update(
                      {
                        athleteOffset: String(
                          Math.max(0, filters.athleteOffset - 120),
                        ),
                      },
                      false,
                    )
                  }
                >
                  Previous
                </button>
                <button
                  disabled={
                    filters.athleteOffset + data.athletes.length >=
                    data.totals.athletes
                  }
                  onClick={() =>
                    update(
                      { athleteOffset: String(filters.athleteOffset + 120) },
                      false,
                    )
                  }
                >
                  Next athletes
                </button>
              </div>
            </div>
          )}
          {data.totals.meets > data.meets.length && (
            <p className={styles.scopeNote}>
              Meet visualizations show the {number(data.meets.length)} largest
              of {number(data.totals.meets)} matching meets. Select a year or
              search to explore the rest. Totals and growth include every
              matching swim.
            </p>
          )}
          <div className={styles.lowerGrid}>
            <section
              className={styles.details}
              id="archive-details"
              aria-label="Selection details"
            >
              <div className={styles.sectionHeading}>
                <h2>
                  {chosenRace
                    ? "Selected swim"
                    : selected
                      ? "Inside this selection"
                      : "Your window into the archive"}
                </h2>
                {(selected || chosenRace) && (
                  <button
                    aria-label="Clear selection"
                    onClick={() => {
                      update({ meet: "", athlete: "" });
                      setRaceId("");
                    }}
                  >
                    <X size={17} />
                  </button>
                )}
              </div>
              {chosenRace ? (
                <>
                  <h3>{chosenRace.athleteName}</h3>
                  <p>
                    {chosenRace.event.replaceAll("_", " ")} ·{" "}
                    {chosenRace.course}
                  </p>
                  <strong className={styles.raceTime}>
                    {chosenRace.status === "OK" && chosenRace.time > 0
                      ? `${Math.floor(chosenRace.time / 60000)}:${((chosenRace.time % 60000) / 1000).toFixed(2).padStart(5, "0")}`
                      : chosenRace.status}
                  </strong>
                  <p>
                    {chosenRace.meet} · {chosenRace.date.slice(0, 10)}
                  </p>
                  <Link
                    href={timesViewHref(
                      "athletes",
                      new URLSearchParams({
                        athleteId: chosenRace.athleteId,
                      }).toString(),
                    )}
                  >
                    Open athlete history <ArrowRight size={15} />
                  </Link>
                </>
              ) : (
                <>
                  <h3>
                    {chosenAthlete?.name ||
                      chosenMeet?.name ||
                      (filters.year
                        ? `${filters.year} in the archive`
                        : "Follow your curiosity.")}
                  </h3>
                  <p>
                    {selected
                      ? `${number(data.totals.swims)} swims across ${number(data.totals.meets)} meets. Select a result below to see its details.`
                      : "Choose a year, open a meet, and find the swimmers behind it. Switch views at any point to see the same selection from a different angle."}
                  </p>
                  {chosenMeet && (
                    <Link
                      href={timesViewHref(
                        "meets",
                        new URLSearchParams({
                          meetId: chosenMeet.id,
                        }).toString(),
                      )}
                    >
                      Open meet results <ArrowRight size={15} />
                    </Link>
                  )}
                  {chosenAthlete && (
                    <Link
                      href={timesViewHref(
                        "athletes",
                        new URLSearchParams({
                          athleteId: chosenAthlete.id,
                        }).toString(),
                      )}
                    >
                      Open athlete history <ArrowRight size={15} />
                    </Link>
                  )}
                </>
              )}
              <p className={styles.scopeNote}>
                Approved individual race results. Relay legs and splits are
                excluded. Year filters use calendar years; coverage reflects the
                records collected.
              </p>
            </section>
            <section
              className={styles.meetList}
              aria-label="Meets in this selection"
            >
              <div className={styles.sectionHeading}>
                <h2>Explore a meet</h2>
                <span>{number(data.totals.meets)} meets</span>
              </div>
              {data.meets.slice(0, 6).map((meet) => (
                <button key={meet.id} onClick={() => select("meet", meet.id)}>
                  <i
                    style={{ background: archiveColor(meet.date.slice(0, 4)) }}
                  />
                  <span>
                    <strong>{meet.name}</strong>
                    <small>
                      {meet.date.slice(0, 10)} · {meet.courses.join(" / ")}
                    </small>
                  </span>
                  <b>{number(meet.count)}</b>
                  <ChevronRight size={16} />
                </button>
              ))}
            </section>
          </div>
          {selected && (
            <section
              className={styles.results}
              aria-label="Selected race results"
            >
              <div className={styles.sectionHeading}>
                <h2>Individual swims</h2>
                <span>{number(data.totals.swims)} results</span>
              </div>
              <div className={styles.tableScroll}>
                <table>
                  <thead>
                    <tr>
                      <th>Swimmer</th>
                      <th>Event</th>
                      <th>Course</th>
                      <th>Time / status</th>
                      <th>Date</th>
                      <th>Meet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((race) => (
                      <tr key={race.id} data-selected={race.id === raceId}>
                        <td>
                          <button
                            onClick={() => select("athlete", race.athleteId)}
                          >
                            {race.athleteName}
                          </button>
                        </td>
                        <td>
                          <button
                            aria-label={`View swim: ${race.athleteName}, ${race.event}, ${race.date}`}
                            onClick={() => select("race", race.id)}
                          >
                            {race.event.replaceAll("_", " ")}
                          </button>
                        </td>
                        <td>{race.course}</td>
                        <td>
                          {race.status !== "OK"
                            ? race.status
                            : `${Math.floor(race.time / 60000)}:${((race.time % 60000) / 1000).toFixed(2).padStart(5, "0")}`}
                        </td>
                        <td>{race.date.slice(0, 10)}</td>
                        <td>{race.meet}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.pagination}>
                <span>
                  {filters.resultOffset + 1}–
                  {filters.resultOffset + data.results.length} of{" "}
                  {number(data.totals.swims)}
                </span>
                <div>
                  <button
                    disabled={!filters.resultOffset}
                    onClick={() =>
                      update(
                        {
                          resultOffset: String(
                            Math.max(0, filters.resultOffset - 50),
                          ),
                        },
                        false,
                      )
                    }
                  >
                    Previous
                  </button>
                  <button
                    disabled={
                      filters.resultOffset + data.results.length >=
                      data.totals.swims
                    }
                    onClick={() =>
                      update(
                        { resultOffset: String(filters.resultOffset + 50) },
                        false,
                      )
                    }
                  >
                    Next swims
                  </button>
                </div>
              </div>
            </section>
          )}
        </>
      )}
      <footer className={styles.footer}>
        VELOCITY SWIMMING{" "}
        <span>A different perspective on every performance.</span>
      </footer>
    </main>
  );
}
