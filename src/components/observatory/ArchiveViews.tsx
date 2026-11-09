"use client";

import { useState } from "react";
import {
  archiveColor,
  archiveMonths,
  archiveTreemap,
  type ArchiveData,
  type ArchiveFilters,
} from "@/lib/observatory";
import type { OverviewView } from "@/lib/tool-directory";
import styles from "./DataObservatory.module.css";

const number = (value: number) => value.toLocaleString("en-US");
type Props = {
  data: ArchiveData;
  filters: ArchiveFilters;
  view: OverviewView;
  zoom: number;
  select: (key: "year" | "meet" | "athlete" | "race", id: string) => void;
};

export default function ArchiveViews(props: Props) {
  const { view } = props;
  if (view === "fingerprints") return <Fingerprints {...props} />;
  if (view === "growth") return <Growth {...props} />;
  if (view === "universe") return <Universe {...props} />;
  if (view === "skyline") return <Skyline {...props} />;
  if (view === "pixels") return <Pixels {...props} />;
  return <Treemap {...props} />;
}

function Treemap({ data, filters, zoom, select }: Props) {
  const years = !filters.year && !filters.meet && !filters.athlete;
  const items: { id: string; name: string; count: number; color: string }[] =
    years
      ? data.years.map((y) => ({
          ...y,
          name: y.id || "Unknown year",
          color: archiveColor(y.id),
        }))
      : data.meets.map((m) => ({
          ...m,
          color: archiveColor(m.date.slice(0, 4)),
        }));
  const tiles = archiveTreemap(items);
  return (
    <div className={styles.chartScroll}>
      <div
        className={styles.treemap}
        style={{ width: `${zoom * 100}%`, height: 520 * zoom }}
        aria-label={
          years
            ? "Swims by year. Select a year to explore its meets."
            : "Swims by meet. Select a meet to explore results."
        }
      >
        {tiles.map((tile) => (
          <button
            key={tile.id}
            className={styles.tile}
            style={{
              left: `${tile.x / 10}%`,
              top: `${tile.y / 5.4}%`,
              width: `${tile.w / 10}%`,
              height: `${tile.h / 5.4}%`,
              background: tile.color,
            }}
            title={`${tile.name}: ${number(tile.count)} swims`}
            aria-label={`${tile.name}: ${number(tile.count)} swims`}
            onClick={() => select(years ? "year" : "meet", tile.id)}
          >
            {tile.w * zoom > 85 && tile.h * zoom > 45 && (
              <span>
                <strong>{tile.name}</strong>
                {tile.h * zoom > 75 && (
                  <small>{number(tile.count)} swims</small>
                )}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function Pixels({ data, filters, zoom, select }: Props) {
  const [group, setGroup] = useState("year");
  const individual = !!(filters.meet || filters.athlete);
  const groups =
    group === "year"
      ? data.years.map((y) => ({
          id: y.id,
          name: y.id || "Unknown year",
          count: y.count,
          color: archiveColor(y.id),
        }))
      : data.meets.map((m) => ({
          ...m,
          color: archiveColor(m.date.slice(0, 4)),
        }));
  const unit = Math.max(1, Math.ceil(data.totals.swims / 2400));
  return (
    <>
      <div className={styles.chartNote}>
        <span>
          {individual
            ? `One square = one swim · results ${filters.resultOffset + 1}–${filters.resultOffset + data.results.length}`
            : `One square = up to ${number(unit)} swims. Select a group to zoom in.`}
        </span>
        {!individual && (
          <label>
            Group by{" "}
            <select
              value={group}
              onChange={(event) => setGroup(event.target.value)}
            >
              <option value="year">Year</option>
              <option value="meet">Meet</option>
            </select>
          </label>
        )}
      </div>
      <div
        className={styles.pixels}
        style={{ "--pixel-size": `${7 * zoom}px` } as React.CSSProperties}
      >
        {individual
          ? data.results.map((race) => (
              <button
                key={race.id}
                className={styles.pixel}
                style={{ background: archiveColor(race.date.slice(0, 4)) }}
                title={`${race.athleteName} · ${race.event} · ${race.date}`}
                aria-label={`${race.athleteName}, ${race.event}, ${race.date}`}
                onClick={() => select("race", race.id)}
              />
            ))
          : groups.map((g) => (
              <button
                key={g.id}
                className={styles.pixelGroup}
                onClick={() => select(group === "year" ? "year" : "meet", g.id)}
                aria-label={`${g.name}: ${number(g.count)} swims`}
              >
                <span className={styles.pixelLabel}>
                  {g.name} <small>{number(g.count)}</small>
                </span>
                <span className={styles.pixelField}>
                  {Array.from({ length: Math.ceil(g.count / unit) }, (_, i) => (
                    <span
                      className={styles.pixel}
                      key={i}
                      style={{
                        background: g.color,
                        opacity:
                          i === Math.ceil(g.count / unit) - 1
                            ? Math.max(0.2, (g.count - i * unit) / unit)
                            : 1,
                      }}
                    />
                  ))}
                </span>
              </button>
            ))}
      </div>
    </>
  );
}

function Skyline({ data, zoom, select }: Props) {
  const meets = data.meets
    .filter((m) => Number.isFinite(Date.parse(m.date)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = Date.parse(meets[0]?.date ?? "2000-01-01"),
    last = Date.parse(meets.at(-1)?.date ?? "2000-01-01");
  const max = Math.max(1, ...meets.map((m) => m.count));
  return (
    <>
      <div className={styles.chartNote}>
        <span>Each bar is a meet · height represents recorded swims</span>
        <span>{number(max)} swims at peak</span>
      </div>
      <div className={styles.chartScroll}>
        <svg
          className={styles.svg}
          style={{ width: `${zoom * 100}%` }}
          viewBox="0 0 1000 500"
          role="group"
          aria-label="Meets across competition dates"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line
                x1="48"
                x2="974"
                y1={440 - t * 400}
                y2={440 - t * 400}
                stroke="#ffffff13"
              />
              <text x="40" y={444 - t * 400} textAnchor="end">
                {number(Math.round(max * t))}
              </text>
            </g>
          ))}
          {meets.map((m) => (
            <rect
              key={m.id}
              x={
                55 +
                ((Date.parse(m.date) - first) /
                  Math.max(86400000, last - first)) *
                  900
              }
              y={440 - (m.count / max) * 390}
              width={Math.max(3, Math.min(18, 850 / meets.length))}
              height={(m.count / max) * 390}
              fill={archiveColor(m.date.slice(0, 4))}
              tabIndex={0}
              role="button"
              aria-label={`${m.name}, ${m.date}, ${number(m.count)} swims`}
              onClick={() => select("meet", m.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  select("meet", m.id);
                }
              }}
            >
              <title>
                {m.name} · {m.date} · {number(m.count)} swims
              </title>
            </rect>
          ))}
          <text x="55" y="478">
            {meets[0]?.date.slice(0, 10)}
          </text>
          <text x="970" y="478" textAnchor="end">
            {meets.at(-1)?.date.slice(0, 10)}
          </text>
        </svg>
      </div>
    </>
  );
}

function Fingerprints({ data, select }: Props) {
  const months = archiveMonths(data.totals.first, data.totals.last);
  const bucketSize = Math.max(1, Math.ceil(months.length / 240));
  const buckets = Array.from(
    { length: Math.ceil(months.length / bucketSize) },
    (_, i) => months.slice(i * bucketSize, (i + 1) * bucketSize),
  );
  return (
    <div className={styles.fingerprints}>
      <div className={styles.chartNote}>
        <span>
          {bucketSize === 1
            ? "Monthly activity"
            : `${bucketSize}-month activity`}{" "}
          · brighter means more swims
        </span>
        <span>
          {months[0]} — {months.at(-1)}
        </span>
      </div>
      {data.athletes.map((athlete) => {
        const counts = new Map(athlete.months.map((m) => [m.date, m.count]));
        const activity = buckets.map((bucket) =>
          bucket.reduce((sum, month) => sum + (counts.get(month) ?? 0), 0),
        );
        const max = Math.max(1, ...activity);
        return (
          <button
            className={styles.fingerprint}
            key={athlete.id}
            onClick={() => select("athlete", athlete.id)}
          >
            <span>
              <strong>{athlete.name}</strong>
              <small>
                {number(athlete.count)} swims · {athlete.first.slice(0, 4)}–
                {athlete.last.slice(0, 4)}
              </small>
            </span>
            <svg
              viewBox={`0 0 ${Math.max(buckets.length * 5, 5)} 30`}
              preserveAspectRatio="none"
              aria-label={`Activity from ${athlete.first} to ${athlete.last}`}
            >
              {buckets.map((bucket, i) => (
                <rect
                  key={bucket[0]}
                  x={i * 5}
                  y="0"
                  width="3.5"
                  height="30"
                  fill={archiveColor(athlete.teams[0]?.id ?? "")}
                  opacity={
                    activity[i] ? 0.25 + (0.75 * activity[i]) / max : 0.055
                  }
                >
                  <title>
                    {bucket[0]}
                    {bucketSize > 1 ? ` – ${bucket.at(-1)}` : ""}: {activity[i]}{" "}
                    swims
                  </title>
                </rect>
              ))}
            </svg>
          </button>
        );
      })}
    </div>
  );
}

function Universe({ data, filters, zoom, select }: Props) {
  const teams = [...new Set(data.athletes.map((a) => a.teams[0]?.id ?? ""))];
  const columns = Math.max(1, Math.ceil(Math.sqrt(teams.length * 1.6)));
  const rows = Math.max(1, Math.ceil(teams.length / columns));
  const selected = filters.athlete
    ? data.athletes.find((a) => a.id === filters.athlete)
    : undefined;
  const max = Math.max(1, ...data.athletes.map((a) => a.count));
  return (
    <>
      <div className={styles.chartNote}>
        <span>
          {selected
            ? `${selected.name} and their meets in this selection`
            : "Athletes grouped by their most represented team · size reflects swims"}
        </span>
      </div>
      <div className={styles.chartScroll}>
        <svg
          className={`${styles.svg} ${styles.universe}`}
          style={{ width: `${zoom * 100}%` }}
          viewBox="0 0 1000 560"
          role="group"
          aria-label="Athlete and meet constellation"
        >
          {selected ? (
            <>
              {data.meets.slice(0, 80).map((meet, i, list) => {
                const angle = (i / list.length) * Math.PI * 2,
                  x = 500 + Math.cos(angle) * 340,
                  y = 280 + Math.sin(angle) * 205;
                return (
                  <g key={meet.id}>
                    <line x1="500" y1="280" x2={x} y2={y} stroke="#57dac045" />
                    <circle
                      cx={x}
                      cy={y}
                      r={Math.min(16, 5 + Math.sqrt(meet.count))}
                      fill={archiveColor(meet.date.slice(0, 4))}
                      role="button"
                      tabIndex={0}
                      aria-label={`${meet.name}, ${meet.count} swims`}
                      onClick={() => select("meet", meet.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          select("meet", meet.id);
                        }
                      }}
                    >
                      <title>
                        {meet.name} · {meet.count} swims
                      </title>
                    </circle>
                  </g>
                );
              })}
              <circle cx="500" cy="280" r="35" fill="#57dac0" />
              <text x="500" y="340" textAnchor="middle">
                {selected.name}
              </text>
            </>
          ) : (
            teams.map((team, index) => {
              const athletes = data.athletes.filter(
                (a) => (a.teams[0]?.id ?? "") === team,
              );
              const cx = (((index % columns) + 0.5) * 1000) / columns,
                cy = ((Math.floor(index / columns) + 0.5) * 560) / rows;
              const radius = Math.min(1000 / columns, 560 / rows) * 0.35;
              return (
                <g key={team}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius + 20}
                    fill={archiveColor(team)}
                    opacity=".035"
                  />
                  {athletes.map((athlete, i) => {
                    const angle = i * 2.399963,
                      distance =
                        Math.sqrt((i + 0.5) / athletes.length) * radius;
                    const x = cx + Math.cos(angle) * distance,
                      y = cy + Math.sin(angle) * distance;
                    return (
                      <circle
                        key={athlete.id}
                        cx={x}
                        cy={y}
                        r={3 + Math.sqrt(athlete.count / max) * 12}
                        fill={archiveColor(team)}
                        fillOpacity=".85"
                        tabIndex={0}
                        role="button"
                        aria-label={`${athlete.name}: ${number(athlete.count)} swims`}
                        onClick={() => select("athlete", athlete.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            select("athlete", athlete.id);
                          }
                        }}
                      >
                        <title>
                          {athlete.name} · {number(athlete.count)} swims
                        </title>
                      </circle>
                    );
                  })}
                  <text x={cx} y={cy + radius + 36} textAnchor="middle">
                    {(
                      data.facets.teams.find((t) => t.id === team)?.name ||
                      team ||
                      "Team unknown"
                    ).slice(0, 30)}
                  </text>
                </g>
              );
            })
          )}
        </svg>
      </div>
      {selected && data.meets.length > 80 && (
        <p className={styles.chartNote}>
          Showing the 80 largest meet connections; all selected results are
          available below.
        </p>
      )}
    </>
  );
}

function Growth({ data }: Props) {
  const [axis, setAxis] = useState<"race" | "import">("race");
  const points = axis === "race" ? data.raceGrowth : data.importGrowth;
  const months = archiveMonths(
    points[0]?.date ?? null,
    points.at(-1)?.date ?? null,
  );
  const counts = new Map(points.map((p) => [p.date, p.count]));
  const total = points.reduce((sum, p) => sum + p.count, 0);
  const cumulative = months.reduce<number[]>(
    (all, month) => [...all, (all.at(-1) ?? 0) + (counts.get(month) ?? 0)],
    [],
  );
  const coordinates = cumulative.map(
    (count, i) =>
      `${60 + (i / Math.max(1, months.length - 1)) * 885},${435 - (count / Math.max(1, total)) * 365}`,
  );
  return (
    <>
      <div className={styles.chartNote}>
        <div
          className={styles.axisToggle}
          role="group"
          aria-label="Growth time axis"
        >
          <button
            aria-pressed={axis === "race"}
            onClick={() => setAxis("race")}
          >
            When swims happened
          </button>
          <button
            aria-pressed={axis === "import"}
            onClick={() => setAxis("import")}
          >
            Added to archive
          </button>
        </div>
      </div>
      {!points.length ? (
        <div className={styles.emptyChart}>
          No archive-entry dates are recorded for this selection yet.
        </div>
      ) : (
        <svg
          className={styles.svg}
          viewBox="0 0 1000 500"
          role="img"
          aria-label={`Cumulative ${axis === "race" ? "race history" : "archive additions"}: ${number(total)} swims from ${months[0]} to ${months.at(-1)}`}
        >
          <defs>
            <linearGradient
              id="archive-growth-fill"
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop stopColor="#57dac0" stopOpacity=".45" />
              <stop offset="1" stopColor="#57dac0" stopOpacity=".02" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line
                x1="60"
                x2="960"
                y1={435 - t * 365}
                y2={435 - t * 365}
                stroke="#ffffff13"
              />
              <text x="50" y={440 - t * 365} textAnchor="end">
                {number(Math.round(total * t))}
              </text>
            </g>
          ))}
          <path
            d={`M60,435 L${coordinates.join(" L")} L${months.length === 1 ? 60 : 945},435 Z`}
            fill="url(#archive-growth-fill)"
          />
          <polyline
            points={coordinates.join(" ")}
            fill="none"
            stroke="#57dac0"
            strokeWidth="3"
          />
          {cumulative.map((count, i) => (
            <circle
              key={months[i]}
              cx={60 + (i / Math.max(1, months.length - 1)) * 885}
              cy={435 - (count / Math.max(1, total)) * 365}
              r="5"
              fill="#57dac0"
            >
              <title>
                {months[i]}: {number(count)} total swims,{" "}
                {number(counts.get(months[i]) ?? 0)} added
              </title>
            </circle>
          ))}
          <text x="60" y="478">
            {months[0]}
          </text>
          <text x="945" y="478" textAnchor="end">
            {months.at(-1)}
          </text>
        </svg>
      )}
      <p className={styles.chartNote}>
        {axis === "race"
          ? "Cumulative coverage by competition month. Gaps describe this archive’s coverage, not whether competitions took place."
          : `First publication in this archive, grouped by UTC month. ${number(data.totals.unknownImports)} older swims have an unknown entry date and are excluded from this curve.`}
      </p>
    </>
  );
}
