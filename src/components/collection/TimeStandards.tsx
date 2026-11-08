"use client";

import { ArrowUpRight } from "lucide-react";
import { hasBackendConfiguration } from "@/lib/supabase/client";
import type { StandardSet } from "@/features/swim-resources/types/schema";
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
import { eventLabel } from "./times-data";
import { FilterChips, FilterSummary, PopupPicker } from "./TimesFilters";
import s from "./TimeStandards.module.css";
import timesStyles from "./TimesDatabase.module.css";

const genderLabels: Record<string, string> = {
  F: "Female",
  M: "Male",
  Mixed: "Mixed",
};

export function useTimeStandardsSelection(
  sets: StandardSet[],
  active: boolean,
) {
  const [selected, setSelected] = useTimesSelection("standard", "");
  const [selection, setSelection] = useTimesSelection<StandardSelection>(
    "standardFilters",
    { course: "", gender: "", age: "", tier: "" },
  );
  const day = active
    ? new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Los_Angeles",
      })
    : "";
  const set = active
    ? (sets.find((set) => set.id === selected) ?? defaultStandard(sets, day))
    : undefined;
  const filters = set ? standardFilters(set, selection) : null;
  return { day, set, filters, setSelected, setSelection };
}

type TimeStandardsSelection = ReturnType<typeof useTimeStandardsSelection>;

export function TimeStandardsSummary({
  state,
}: {
  state: TimeStandardsSelection;
}) {
  if (!state.set || !state.filters) return null;
  const { course, age, gender, tier } = state.filters.selection;
  return (
    <FilterSummary
      label="Selected time standards filters"
      compact
      items={[
        ["Standard", state.set.name],
        ["Course", course],
        ["Age group", age],
        ["Gender", genderLabels[gender] ?? gender],
        ["Tier", tier],
      ]}
    />
  );
}

export default function TimeStandards({
  query,
  state,
}: {
  query: ReturnType<typeof useStandards>;
  state: TimeStandardsSelection;
}) {
  const { sets, loading, error, retry } = query;
  const { day, set, filters, setSelected, setSelection } = state;
  const sourceUrl =
    set?.sourceUrl && /^https?:\/\//.test(set.sourceUrl) ? set.sourceUrl : null;
  function updateFilter(key: keyof StandardSelection, value: string) {
    if (filters) setSelection({ ...filters.selection, [key]: value });
  }
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
          <div className={`${timesStyles.filters} ${s.filters}`}>
            <PopupPicker
              label="Standard"
              value={set.id}
              onChange={(value) => {
                setSelected(value);
                setSelection(filters.selection);
              }}
              options={sets.map((item) => [
                item.id,
                `${item.name} · ${standardStatus(item, day)}`,
              ])}
            />
            <FilterChips
              label="Course"
              value={filters.selection.course}
              onChange={(value) => updateFilter("course", value)}
              options={filters.courses.map((course) => [course, course])}
            />
            <FilterChips
              label="Gender"
              value={filters.selection.gender}
              onChange={(value) => updateFilter("gender", value)}
              options={filters.genders.map((gender) => [
                gender,
                genderLabels[gender] ?? gender,
              ])}
            />
            <PopupPicker
              label="Age group"
              value={filters.selection.age}
              onChange={(value) => updateFilter("age", value)}
              options={filters.ages.map((age) => [age, age])}
            />
            <PopupPicker
              label="Tier"
              value={filters.selection.tier}
              onChange={(value) => updateFilter("tier", value)}
              options={filters.tiers.map((tier) => [tier, tier])}
            />
          </div>
          <div className={s.grid}>
            {strokeColumns.map(([stroke, heading, title]) => (
              <section key={stroke} className={s.column} aria-label={title}>
                <h3 title={title}>{heading}</h3>
                {standardEventKeys(set, filters.selection.course)
                  .filter((key) => eventColumn(key) === stroke)
                  .map((key) => {
                    const [distance, code] = key.split("_");
                    const relayLabel =
                      code === "MED-R"
                        ? "IM Relay"
                        : code === "FR-R"
                          ? "Free Relay"
                          : null;
                    const eventName = relayLabel
                      ? eventLabel(key)
                      : `${distance} ${title}`;
                    const cut = filters.events[key]?.cutsByTier.find(
                      (cut) => cut.tierName === filters.selection.tier,
                    );
                    const time = cut ? formatSwimTime(cut.timeMs) : null;
                    return (
                      <div
                        key={key}
                        className={s.chip}
                        aria-label={`${eventName}: ${time ?? "No published cut"}`}
                      >
                        <span>
                          {distance}
                          {relayLabel && (
                            <>
                              {" "}
                              <span className="whitespace-nowrap">
                                {relayLabel}
                              </span>
                            </>
                          )}
                        </span>
                        <strong>{time ?? "—"}</strong>
                      </div>
                    );
                  })}
              </section>
            ))}
          </div>
          {Object.keys(filters.events).length === 0 && (
            <p>No cuts are available for this selection.</p>
          )}
          {sourceUrl && (
            <a
              className={s.sourceButton}
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Official source
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          )}
        </>
      )}
    </section>
  );
}
