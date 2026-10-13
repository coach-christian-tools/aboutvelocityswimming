"use client";

import { useId, useMemo, type ReactNode } from "react";
import { formatSwimTime } from "@/features/swim-resources/lib/domain/swim-time";
import {
  ageGroups,
  eventLabel,
  resultName,
  recordCourses,
  recordEvents,
  recordKey,
  teamRecords,
  type Race,
} from "./times-data";
import s from "./TeamRecords.module.css";
import loadingStyles from "./TimesLoading.module.css";
import RelayLineup from "./RelayLineup";

export interface RecordSelection {
  course: string;
  ageGroup: string;
  event: string;
  gender: string;
  relay?: boolean;
}
function RecordCell({
  holders,
  names,
  selection,
  ageLabel,
  onRecord,
  loading = false,
}: {
  loading?: boolean;
  holders: Race[];
  names: Map<string, string>;
  selection: RecordSelection;
  ageLabel: string;
  onRecord: (selection: RecordSelection) => void;
}) {
  const gender = selection.gender === "F" ? "girls" : "boys";
  const label = `View ${gender} ${ageLabel} ${selection.course} ${selection.event.replace("_", " ")} rankings`;
  return (
    <td className={s.recordCell}>
      <div>
        {loading ? (
          <div className={s.recordBoard} aria-hidden="true">
            <div>
              <span className={loadingStyles.bar} />
              {selection.relay && <span className={loadingStyles.bar} />}
            </div>
            <span className={loadingStyles.bar} />
            <span className={loadingStyles.bar} />
          </div>
        ) : holders.length ? (
          holders.map((race) => {
            const year = race.date.slice(0, 4) || "—";
            const name = resultName(race, names);
            const time = formatSwimTime(race.time);
            const contents = (
              <>
                <span className={s.recordName}>
                  {name}
                  {race.resultOrigin === "relay_leadoff" && (
                    <small className={s.lineup}>Verified relay lead-off</small>
                  )}
                </span>
                <span className={s.time}>{time}</span>
                <span className={s.recordYear}>{year}</span>
              </>
            );
            return race.relay ? (
              <div key={race.id} className={s.recordBoard}>
                <div className={s.recordName}>
                  <RelayLineup race={race} />
                </div>
                <button
                  className={s.time}
                  onClick={() => onRecord(selection)}
                  aria-label={label}
                >
                  {time}
                </button>
                <span className={s.recordYear}>{year}</span>
              </div>
            ) : (
              <button
                key={race.id}
                className={s.recordBoard}
                onClick={() => onRecord(selection)}
                aria-label={label}
                title={`${name} · ${time} · ${year}`}
              >
                {contents}
              </button>
            );
          })
        ) : selection.relay ? (
          <button
            className={`${s.recordBoard} ${s.missing}`}
            onClick={() => onRecord(selection)}
            aria-label={label}
          />
        ) : (
          <div
            className={`${s.recordBoard} ${s.missing}`}
            aria-label="No available record"
          />
        )}
      </div>
    </td>
  );
}
export default function TeamRecords({
  races,
  team,
  teamName,
  names,
  selector,
  onRecord,
  ready = true,
  loading = false,
}: {
  races: Race[];
  team: string;
  teamName: string;
  names: Map<string, string>;
  selector: ReactNode;
  onRecord: (selection: RecordSelection) => void;
  ready?: boolean;
  loading?: boolean;
}) {
  const prefix = useId().replaceAll(":", "");
  const now = new Date();
  const currentDate = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });
  const dateValue = now.toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
  const visibleRaces = useMemo(
    () => races.filter((race) => !race.relay || race.gender !== "X"),
    [races],
  );
  const records = useMemo(
    () => teamRecords(visibleRaces, team),
    [visibleRaces, team],
  );
  const groups = ageGroups.map(
    ([key, label, minAge]) => [key, label, minAge] as const,
  );
  const events = useMemo(
    () =>
      new Map(
        recordCourses.map(([course]) => [
          course,
          recordEvents(course, visibleRaces),
        ]),
      ),
    [visibleRaces],
  );
  const anchor = (course: string, group?: string) =>
    `${prefix}-${course}${group ? `-${group.replace(/[^a-z0-9]/gi, "")}` : ""}`;
  return (
    <section
      className={s.records}
      aria-label="Team records"
      aria-busy={loading}
    >
      <div id={`${prefix}-top`} className={s.controls}>
        <h2 className="sr-only">{teamName || "Team"} records</h2>
        <div className={s.selector}>{selector}</div>
        <nav className={s.jumpLinks} aria-label="Record sections">
          {recordCourses.map(([course, label]) => (
            <div
              className={s.jumpRow}
              key={course}
              role="group"
              aria-label={`${label} navigation`}
            >
              <a
                className={s.courseLink}
                href={`#${anchor(course)}`}
                title={label}
              >
                {course}
              </a>
              {groups.map(([key, text]) => (
                <a
                  key={key}
                  href={`#${anchor(course, key)}`}
                  aria-label={`${course} ${text} records`}
                >
                  {text}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </div>
      {(ready || loading) && (
        <>
          {!loading && ready && !records.size && (
            <p className={s.empty}>
              No eligible records for this team in the available results.
            </p>
          )}
          {recordCourses.map(([course, courseName]) => (
            <section
              key={course}
              id={anchor(course)}
              className={s.course}
              aria-label={`${course} records`}
            >
              <div className={s.courseHeading}>
                <h2>
                  {courseName} <span>{course}</span>
                </h2>
                <a href={`#${prefix}-top`}>Back to navigation ↑</a>
              </div>
              {groups.map(([group, ageLabel, minAge]) => (
                <section
                  key={group}
                  id={anchor(course, group)}
                  className={s.ageSection}
                  aria-label={`${course} ${ageLabel} records`}
                >
                  <div
                    className={s.tableWrap}
                    tabIndex={0}
                    role="region"
                    aria-label={`${course} ${ageLabel} record table`}
                  >
                    <table className={s.table}>
                      <caption>
                        <div className={s.tableHeading}>
                          <span className={s.genderLabel} aria-hidden="true">
                            Girls
                          </span>
                          <div className={s.tableTitle}>
                            <time dateTime={dateValue}>{currentDate}</time>
                            <h3>
                              {teamName || "Team records"} · {ageLabel} ·{" "}
                              {course}
                            </h3>
                          </div>
                          <span className={s.genderLabel} aria-hidden="true">
                            Boys
                          </span>
                        </div>
                      </caption>
                      <colgroup>
                        <col className={s.recordColumn} />
                        <col />
                        <col className={s.recordColumn} />
                      </colgroup>
                      <thead className="sr-only">
                        <tr>
                          <th scope="col">Girls</th>
                          <th scope="col" className={s.eventHeading}>
                            Event
                          </th>
                          <th scope="col">Boys</th>
                        </tr>
                      </thead>
                      <tbody
                        className={loading ? loadingStyles.pulse : undefined}
                      >
                        {(events.get(course) ?? [])
                          .filter(
                            (event) =>
                              !(
                                (course === "SCY" || course === "SCM") &&
                                minAge >= 11 &&
                                event.startsWith("25_")
                              ),
                          )
                          .map((event) => (
                            <tr key={event}>
                              <RecordCell
                                loading={loading}
                                holders={
                                  records.get(
                                    recordKey(course, group, event, "F"),
                                  ) ?? []
                                }
                                names={names}
                                selection={{
                                  course,
                                  ageGroup: group,
                                  event,
                                  gender: "F",
                                  relay: event.endsWith("-R"),
                                }}
                                ageLabel={ageLabel}
                                onRecord={onRecord}
                              />
                              <th
                                scope="row"
                                className={`${s.event} ${event.endsWith("-R") ? s.relayEvent : ""}`}
                              >
                                <span>{eventLabel(event)}</span>
                              </th>
                              <RecordCell
                                loading={loading}
                                holders={
                                  records.get(
                                    recordKey(course, group, event, "M"),
                                  ) ?? []
                                }
                                names={names}
                                selection={{
                                  course,
                                  ageGroup: group,
                                  event,
                                  gender: "M",
                                  relay: event.endsWith("-R"),
                                }}
                                ageLabel={ageLabel}
                                onRecord={onRecord}
                              />
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </section>
          ))}
        </>
      )}
    </section>
  );
}
