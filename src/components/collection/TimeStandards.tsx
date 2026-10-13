"use client";
import { useId } from "react";
import { hasBackendConfiguration } from "@/lib/supabase/client";
import { useTimesSelection } from "./use-times-selection";
import type { useStandards } from "./use-standards";
import { formatSwimTime } from "@/features/swim-resources/lib/domain/swim-time";
import { strokeColumns, eventColumn } from "./event-layout";
import {
  defaultStandard,
  standardFilters,
  standardStatus,
  standardEventKeys,
  type StandardSelection,
} from "./standards-data";
import s from "./TimeStandards.module.css";
export default function TimeStandards({
  query,
}: {
  query: ReturnType<typeof useStandards>;
}) {
  const id = useId();
  const { sets, loading, error, retry } = query;
  const [selected, setSelected] = useTimesSelection("standard", "");
  const [selection, setSelection] = useTimesSelection<StandardSelection>(
    "standardFilters",
    { course: "", gender: "", age: "", tier: "" },
  );
  const day = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
  const set =
    sets.find((set) => set.id === selected) ?? defaultStandard(sets, day);
  const filters = set ? standardFilters(set, selection) : null;
  const sourceUrl =
    set?.sourceUrl && /^https?:\/\//.test(set.sourceUrl) ? set.sourceUrl : null;
  return (
    <section className={s.page} aria-label="Time Standards">
      <h1 className="text-2xl font-bold">Time Standards</h1>
      {loading && <p role="status">Loading approved standards…</p>}
      {error && (
        <p role="alert">
          {error} <button onClick={retry}>Try again</button>
        </p>
      )}
      {!hasBackendConfiguration && (
        <p>Standards are unavailable while the database is disconnected.</p>
      )}
      {!loading && !error && hasBackendConfiguration && !set && (
        <p>No approved time standards yet.</p>
      )}
      {set && filters && (
        <>
          <div className={s.filters}>
            <label className={s.field} htmlFor={`${id}-set`}>
              Standard
              <select
                aria-label="Standard"
                id={`${id}-set`}
                value={set.id}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setSelection(filters.selection);
                }}
              >
                {sets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {standardStatus(item, day)}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ["course", "Course", filters.courses],
                ["gender", "Gender", filters.genders],
                ["age", "Age group", filters.ages],
                ["tier", "Tier", filters.tiers],
              ] as const
            ).map(([key, label, options]) => (
              <label key={key} className={s.field} htmlFor={`${id}-${key}`}>
                {label}
                <select
                  aria-label={label}
                  id={`${id}-${key}`}
                  value={filters.selection[key]}
                  onChange={(e) =>
                    setSelection({
                      ...filters.selection,
                      [key]: e.target.value,
                    })
                  }
                >
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {key === "gender"
                        ? ((
                            {
                              F: "Female",
                              M: "Male",
                              Mixed: "Mixed",
                            } as Record<string, string>
                          )[option] ?? option)
                        : option}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className={s.meta}>
            <span>{set.seasonYears}</span>
            <span>
              {standardStatus(set, day)} · {set.effectiveDate} to{" "}
              {set.expirationDate}
            </span>
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                Official source
              </a>
            )}
          </div>
          <p>
            — means no published cut for this selection. Times are shown in{" "}
            {filters.selection.course}; no conversions are applied.
          </p>
          <div className={s.grid}>
            {strokeColumns.map(([stroke, heading, title]) => (
              <section key={stroke} className={s.column} aria-label={title}>
                <h3 title={title}>{heading}</h3>
                {standardEventKeys(set, filters.selection.course)
                  .filter((key) => eventColumn(key) === stroke)
                  .map((key) => {
                    const cut = filters.events[key]?.cutsByTier.find(
                      (cut) => cut.tierName === filters.selection.tier,
                    );
                    return (
                      <div
                        key={key}
                        className={s.chip}
                        aria-label={`${key.split("_")[0]} ${title}${key.includes("-R") ? " relay" : ""}: ${cut ? formatSwimTime(cut.timeMs) : "No published cut"}`}
                      >
                        <span>
                          {key.split("_")[0]}
                          {key.includes("-R") ? " Relay" : ""}
                        </span>
                        <strong>
                          {cut ? formatSwimTime(cut.timeMs) : "—"}
                        </strong>
                      </div>
                    );
                  })}
              </section>
            ))}
          </div>
          {Object.keys(filters.events).length === 0 && (
            <p>No cuts are available for this selection.</p>
          )}
        </>
      )}
    </section>
  );
}
