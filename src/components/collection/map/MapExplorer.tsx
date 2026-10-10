"use client";
import { useEffect, useState } from "react";
import { ExternalLink, ChevronRight, MapPin } from "lucide-react";
import { browserClient, hasBackendConfiguration } from "@/lib/supabase/client";
import { field, originalSource, reviewedDate, type WikiEntry } from "../wiki";
import {
  boundarySource,
  inView,
  projectLocation,
  teamLocations,
  type DetailMap,
  type NationalMap,
} from "./geometry";
import styles from "./MapExplorer.module.css";
const colors: Record<string, string> = {
  western: "#a1c4c2",
  central: "#c3cbdc",
  southern: "#dbcaaf",
  eastern: "#c9c4d8",
};
const zoneViews: Record<string, string> = {
  western: "10 55 335 540",
  central: "270 85 350 325",
  southern: "225 245 480 285",
  eastern: "560 80 225 275",
};
function color(id: string) {
  return colors[id.replace("usa-zone-", "")] ?? "#b5c9c7";
}
async function asset<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("The map could not be loaded.");
  return response.json();
}
export default function MapExplorer({ facets }: { facets: WikiEntry[] }) {
  const [national, setNational] = useState<NationalMap | null>(null);
  const [zoneId, setZoneId] = useState("");
  const [lscId, setLscId] = useState("");
  const [detail, setDetail] = useState<DetailMap | null>(null);
  const [teams, setTeams] = useState<WikiEntry[]>([]);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    asset<NationalMap>("/maps/swimming/national.json", controller.signal)
      .then(setNational)
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    if (!lscId) return;
    const controller = new AbortController();
    async function load() {
      try {
        const code = lscId.replace("usa-lsc-", "");
        if (!/^[a-z]{2}$/.test(code))
          throw new Error("A boundary map is not available for this LSC yet.");
        const mapPromise = asset<DetailMap>(
          `/maps/swimming/lsc/${code}.json`,
          controller.signal,
        );
        const teamsPromise = async () => {
          if (!hasBackendConfiguration)
            throw new Error("The team database is being connected.");
          const all: WikiEntry[] = [];
          for (let start = 0; ; start += 500) {
            const { data, error } = await browserClient()
              .from("knowledge_entries")
              .select("*")
              .eq("kind", "team")
              .eq("data->>lscId", lscId)
              .order("title")
              .order("id")
              .range(start, start + 499)
              .abortSignal(controller.signal);
            if (error)
              throw new Error("Teams could not be loaded. Please try again.");
            all.push(...(data ?? []));
            if (!data || data.length < 500) break;
          }
          return all;
        };
        const [map, rows] = await Promise.all([mapPromise, teamsPromise()]);
        if (!controller.signal.aborted) {
          setDetail(map);
          setTeams(rows);
          setLoading(false);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setDetailError(
            err instanceof Error ? err.message : "Could not load this LSC.",
          );
          setLoading(false);
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [lscId, revision]);
  const zone = facets.find((entry) => entry.id === zoneId);
  const lsc = facets.find((entry) => entry.id === lscId);
  const lscs = facets.filter(
    (entry) => entry.kind === "lsc" && field(entry.data, "zoneId") === zoneId,
  );
  const activeTeam = teams.find((team) => team.id === selected);
  const visibleTeams = teams.filter((team) =>
    `${team.title} ${field(team.data, "geographicCoverage")}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  function chooseZone(id: string) {
    setZoneId(id);
    setLscId("");
    setSelected("");
    setDetail(null);
    setTeams([]);
    setSearch("");
    setDetailError("");
  }
  function chooseLsc(id: string) {
    setLscId(id);
    setSelected("");
    setDetail(null);
    setTeams([]);
    setSearch("");
    setDetailError("");
    setLoading(true);
  }
  const points = visibleTeams.flatMap((team) =>
    teamLocations(team).flatMap((location) => {
      const point = projectLocation(lscId, location);
      return point && detail && inView(point, detail.viewBox)
        ? [{ team, location, x: point[0], y: point[1] }]
        : [];
    }),
  );
  const groups: (typeof points)[] = [];
  for (const point of points) {
    const nearby = groups.find(
      (group) => Math.hypot(group[0].x - point.x, group[0].y - point.y) < 22,
    );
    if (nearby) nearby.push(point);
    else groups.push([point]);
  }
  const locatedCount = new Set(points.map((point) => point.team.id)).size;
  function mapSvg(regional: boolean) {
    if (!national) return null;
    return (
      <svg
        viewBox={
          regional
            ? (zoneViews[zoneId.replace("usa-zone-", "")] ?? "10 55 775 540")
            : "10 55 775 540"
        }
        className={regional ? styles.regionMap : styles.nationalMap}
        role="group"
        aria-label={
          regional
            ? `${zone?.title ?? "Zone"} LSC map`
            : "USA Swimming zones map"
        }
      >
        {national.zones.map((item) => (
          <g
            key={item.id}
            role={regional ? undefined : "button"}
            tabIndex={regional ? undefined : 0}
            aria-label={regional ? undefined : `Explore ${item.name}`}
            aria-pressed={regional ? undefined : zoneId === item.id}
            onClick={regional ? undefined : () => chooseZone(item.id)}
            onKeyDown={
              regional
                ? undefined
                : (event) => {
                    if (["Enter", " "].includes(event.key)) {
                      event.preventDefault();
                      chooseZone(item.id);
                    }
                  }
            }
            className={regional ? undefined : styles.zone}
            opacity={regional && item.id !== zoneId ? 0.12 : 1}
          >
            {item.paths.map((path, index) => (
              <path
                key={index}
                d={path}
                fill={color(item.id)}
                stroke="var(--surface)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <title>{item.name}</title>
          </g>
        ))}
        {regional && (
          <g className={styles.boundaries}>
            {national.lines.map((path, index) => (
              <path key={index} d={path} />
            ))}
          </g>
        )}
        {regional &&
          national.lscs
            .filter((label) => lscs.some((entry) => entry.id === label.id))
            .map((label) => {
              const name =
                lscs.find((entry) => entry.id === label.id)?.title ??
                label.code;
              return (
                <g
                  key={label.id}
                  className={styles.lscLabel}
                  role="button"
                  tabIndex={0}
                  aria-label={`Explore ${name}`}
                  aria-pressed={lscId === label.id}
                  onClick={() => chooseLsc(label.id)}
                  onKeyDown={(event) => {
                    if (["Enter", " "].includes(event.key)) {
                      event.preventDefault();
                      chooseLsc(label.id);
                    }
                  }}
                >
                  <title>{name}</title>
                  <rect
                    x={label.x - 9}
                    y={label.y - 8}
                    width="18"
                    height="15"
                    rx="4"
                  />
                  <text x={label.x} y={label.y + 2} textAnchor="middle">
                    {label.code}
                  </text>
                </g>
              );
            })}
        {!regional &&
          [
            ["Western", 160, 230],
            ["Central", 440, 230],
            ["Southern", 510, 385],
            ["Eastern", 675, 195],
          ].map(([name, x, y]) => (
            <text
              key={name}
              className={styles.zoneName}
              x={x}
              y={y}
              textAnchor="middle"
            >
              {name}
            </text>
          ))}
      </svg>
    );
  }
  return (
    <div className={styles.explorer}>
      <nav className={styles.breadcrumb} aria-label="Map location">
        <button onClick={() => chooseZone("")}>USA</button>
        {zoneId && (
          <>
            <ChevronRight size={14} aria-hidden="true" />
            <button onClick={() => chooseZone(zoneId)}>
              {zone?.title ?? zoneId.replace("usa-zone-", "")}
            </button>
          </>
        )}
        {lsc && (
          <>
            <ChevronRight size={14} aria-hidden="true" />
            <span aria-current="location">{lsc.title}</span>
          </>
        )}
      </nav>
      <section className={styles.stage} aria-labelledby="national-heading">
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Explore the swimming community</p>
            <h2 id="national-heading">A place for every team.</h2>
            <p>Start with a zone, find your LSC, and explore its teams.</p>
          </div>
          <span className={styles.step}>01 / USA</span>
        </div>
        {error ? (
          <p role="alert">
            {error}{" "}
            <button
              onClick={() => {
                setError("");
                setRevision((value) => value + 1);
              }}
            >
              Retry map
            </button>
          </p>
        ) : !national ? (
          <p role="status">Loading map…</p>
        ) : (
          <div className={zoneId ? styles.compact : ""}>{mapSvg(false)}</div>
        )}
        <div className={styles.zoneButtons}>
          {(national?.zones ?? []).map((item) => (
            <button
              key={item.id}
              aria-pressed={zoneId === item.id}
              onClick={() => chooseZone(item.id)}
            >
              <span style={{ background: color(item.id) }} />
              {item.name}
            </button>
          ))}
        </div>
      </section>
      {zoneId && (
        <section className={styles.stage} aria-labelledby="zone-heading">
          <div className={styles.heading}>
            <div>
              <p className={styles.eyebrow}>Local Swimming Committees</p>
              <h2 id="zone-heading">{zone?.title ?? "Select an LSC"}</h2>
              <p>Choose an abbreviation on the map or an LSC below.</p>
            </div>
            <span className={styles.step}>02 / ZONE</span>
          </div>
          <div className={styles.regionLayout}>
            {mapSvg(true)}
            <div className={styles.lscButtons}>
              {lscs.map((entry) => (
                <button
                  key={entry.id}
                  aria-pressed={lscId === entry.id}
                  onClick={() => chooseLsc(entry.id)}
                >
                  {entry.title}
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              ))}
              {!lscs.length && (
                <p>No approved LSC records are available for this zone yet.</p>
              )}
            </div>
          </div>
        </section>
      )}
      {lscId && (
        <section className={styles.stage} aria-labelledby="lsc-heading">
          <div className={styles.heading}>
            <div>
              <p className={styles.eyebrow}>Teams & places</p>
              <h2 id="lsc-heading">{lsc?.title ?? "LSC teams"}</h2>
              <p>
                {loading ? "Loading teams…" : `${teams.length} approved teams`}
              </p>
            </div>
            <span className={styles.step}>03 / LSC</span>
          </div>
          {detailError ? (
            <p role="alert">
              {detailError}{" "}
              <button
                onClick={() => {
                  setDetailError("");
                  setLoading(true);
                  setRevision((value) => value + 1);
                }}
              >
                Try again
              </button>
            </p>
          ) : loading ? (
            <p role="status">Loading the LSC map and teams…</p>
          ) : (
            detail && (
              <>
                <div className={styles.localLayout}>
                  <div className={styles.localCanvas}>
                    <svg
                      viewBox={detail.viewBox.join(" ")}
                      role="group"
                      aria-label={`${lsc?.title ?? "LSC"} team locations`}
                    >
                      {detail.paths.map((path, index) => (
                        <path
                          key={index}
                          d={path}
                          fill={color(zoneId)}
                          fillOpacity=".38"
                          stroke="var(--text-muted)"
                          strokeWidth="1.5"
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}
                      {groups.map((group, key) => {
                        const members = group.filter(
                          (point, index) =>
                            group.findIndex(
                              (other) => other.team.id === point.team.id,
                            ) === index,
                        );
                        const x =
                            group.reduce((sum, p) => sum + p.x, 0) /
                            group.length,
                          y =
                            group.reduce((sum, p) => sum + p.y, 0) /
                            group.length;
                        const active = group.some(
                            (p) => p.team.id === selected,
                          ),
                          index = members.findIndex(
                            (p) => p.team.id === selected,
                          );
                        const name = group
                          .map((p) => p.team.title)
                          .filter((name, i, all) => all.indexOf(name) === i)
                          .join(", ");
                        const radius =
                          Math.max(detail.viewBox[2], detail.viewBox[3]) / 48;
                        return (
                          <g
                            key={key}
                            className={styles.marker}
                            data-active={active}
                            data-estimate={group.some(
                              (p) => p.location.precision === "city",
                            )}
                            role="button"
                            tabIndex={0}
                            aria-label={`${name}${members.length > 1 ? ". Select to cycle teams at this location" : ""}`}
                            onClick={() =>
                              setSelected(
                                members[(index + 1) % members.length].team.id,
                              )
                            }
                            onKeyDown={(event) => {
                              if (["Enter", " "].includes(event.key)) {
                                event.preventDefault();
                                setSelected(
                                  members[(index + 1) % members.length].team.id,
                                );
                              }
                            }}
                          >
                            <title>{name}</title>
                            <circle cx={x} cy={y} r={radius} />
                            {members.length > 1 && (
                              <text
                                x={x}
                                y={y}
                                dy=".35em"
                                textAnchor="middle"
                                fontSize={radius * 1.15}
                              >
                                {members.length}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                    <p className={styles.legend}>
                      <span className={styles.solidDot} /> Reviewed pool{" "}
                      <span className={styles.hollowDot} /> City estimate
                    </p>
                    <p className={styles.note}>
                      Illustrative locations. Hollow dots use the team’s listed
                      city, not a confirmed home pool. Shared dots cycle through
                      teams.
                    </p>
                  </div>
                  <aside
                    className={styles.teamPanel}
                    aria-label="Teams in selected LSC"
                  >
                    <label className={styles.search}>
                      Find a team
                      <input
                        type="search"
                        value={search}
                        onChange={(event) => {
                          setSearch(event.target.value);
                          setSelected("");
                        }}
                        placeholder="Team or city…"
                      />
                    </label>
                    <p className={styles.note} role="status">
                      {locatedCount} of {visibleTeams.length} teams shown on the
                      map
                      {visibleTeams.length > locatedCount
                        ? " · Remaining locations not mapped yet"
                        : ""}
                    </p>
                    <div className={styles.teamList}>
                      {visibleTeams.map((team) => (
                        <button
                          key={team.id}
                          aria-pressed={selected === team.id}
                          onClick={() => setSelected(team.id)}
                        >
                          <span>
                            {team.title}
                            <small>
                              {field(team.data, "geographicCoverage") ||
                                "Location not reviewed yet"}
                            </small>
                          </span>
                          <MapPin size={15} aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                    {!visibleTeams.length && (
                      <p className={styles.note}>
                        {teams.length
                          ? "No teams match your search."
                          : "Teams will appear here after their records are collected and approved."}
                      </p>
                    )}
                  </aside>
                </div>
                {activeTeam && (
                  <article className={styles.teamDetail} aria-live="polite">
                    <div className={styles.heading}>
                      <h3>
                        {activeTeam.title}
                        {originalSource(activeTeam) && (
                          <a
                            href={originalSource(activeTeam)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Website for ${activeTeam.title}`}
                          >
                            <ExternalLink size={18} />
                          </a>
                        )}
                      </h3>
                      <time dateTime={activeTeam.updated_at}>
                        Reviewed {reviewedDate(activeTeam.updated_at)}
                      </time>
                    </div>
                    <p>{field(activeTeam.data, "summary")}</p>
                    <ul>
                      {teamLocations(activeTeam).map((location, index) => (
                        <li key={index}>
                          {location.label} ·{" "}
                          {location.precision === "pool"
                            ? "Reviewed pool"
                            : "Approximate city location"}{" "}
                          <a
                            href={location.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Location source ↗
                          </a>
                        </li>
                      ))}
                    </ul>
                  </article>
                )}
              </>
            )
          )}
        </section>
      )}
      <p className={styles.attribution}>
        Boundaries adapted from{" "}
        <a href={boundarySource} target="_blank" rel="noopener noreferrer">
          USA Swimming’s LSC & Zone map ↗
        </a>
        . Alaska and Hawaii shown as insets. Team information comes from
        approved Wiki records.
      </p>
    </div>
  );
}
