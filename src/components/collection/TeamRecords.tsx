"use client";

import { useId, useMemo, type ReactNode } from "react";
import { formatSwimTime } from "@/features/swim-resources/lib/domain/swim-time";
import {
  recordAgeGroups,
  resultName,
  recordCourses,
  recordEvents,
  recordKey,
  teamRecords,
  type Race,
} from "./times-data";
import s from "./TeamRecords.module.css";
import RelayLineup from "./RelayLineup";

export interface RecordSelection {
  course: string;
  ageGroup: string;
  event: string;
  gender: string;
  relay?: boolean;
}
function recordDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString(
    "en-US",
    { month: "short", year: "numeric", timeZone: "UTC" },
  );
}
function RecordCells({
  holders,
  names,
  selection,
  ageLabel,
  onRecord,
  reverse = false,
}: {
  holders: Race[];
  names: Map<string, string>;
  selection: RecordSelection;
  ageLabel: string;
  onRecord: (selection: RecordSelection) => void;
  reverse?: boolean;
}) {
  const race = holders[0];
  const gender =
    selection.gender === "F"
      ? "girls"
      : selection.gender === "M"
        ? "boys"
        : "mixed";
  const label = `View ${gender} ${ageLabel} ${selection.course} ${selection.event.replace("_", " ")} rankings`;
  const holderNames = holders.map((r) => resultName(r, names)).join(" / ");
  const nameCell = (
    <td key="name" className={s.holder}>
      {race ? (
        race.relay ? (
          holders.map((holder) => <RelayLineup race={holder} key={holder.id} />)
        ) : (
          <button
            onClick={() => onRecord(selection)}
            aria-label={label}
            title={holderNames}
          >
            {holderNames}
          </button>
        )
      ) : (
        <span className={s.missing}>—</span>
      )}
      {holders.some((holder) => holder.resultOrigin === "relay_leadoff") && (
        <small className={s.lineup}>Verified relay lead-off</small>
      )}
    </td>
  );
  const dateCell = (
    <td key="date" className={s.recordDate}>
      {race ? recordDate(race.date) : "—"}
    </td>
  );
  const timeCell = (
    <td key="time" className={s.time}>
      {race || selection.relay ? (
        <button onClick={() => onRecord(selection)} aria-label={label}>
          {race ? formatSwimTime(race.time) : "—"}
        </button>
      ) : (
        <span className={s.missing}>—</span>
      )}
    </td>
  );
  return (
    <>
      {reverse
        ? [timeCell, dateCell, nameCell]
        : [nameCell, dateCell, timeCell]}
    </>
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
}: {
  races: Race[];
  team: string;
  teamName: string;
  names: Map<string, string>;
  selector: ReactNode;
  onRecord: (selection: RecordSelection) => void;
  ready?: boolean;
}) {
  const prefix = useId().replaceAll(":", "");
  const visibleRaces = useMemo(
    () => races.filter((race) => !race.relay || race.gender !== "X"),
    [races],
  );
  const records = useMemo(
    () => teamRecords(visibleRaces, team),
    [visibleRaces, team],
  );
  const groups = useMemo(() => recordAgeGroups(visibleRaces), [visibleRaces]);
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
    <section className={s.records} aria-label="Team records">
      <div id={`${prefix}-top`} className={s.controls}>
        <div className={s.selector}>{selector}</div>
        <div>
          <h2>{teamName || "Team records"}</h2>
          <p>
            Individual and relay records from available IES results · select a
            record for ranked performances
          </p>
        </div>
      </div>
      {ready && (
        <>
          <nav className={s.jumpLinks} aria-label="Record sections">
            {recordCourses.map(([course, label]) => (
              <div key={course}>
                <a
                  className={s.courseLink}
                  href={`#${anchor(course)}`}
                  title={label}
                >
                  {course}
                </a>
                {groups.map(([key, text]) => (
                  <a key={key} href={`#${anchor(course, key)}`}>
                    {text}
                  </a>
                ))}
              </div>
            ))}
          </nav>
          {!records.size && (
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
              {groups.map(([group, ageLabel]) => (
                <section
                  key={group}
                  id={anchor(course, group)}
                  className={s.ageSection}
                  aria-label={`${course} ${ageLabel} records`}
                >
                  <h3>{ageLabel}</h3>
                  <div
                    className={s.tableWrap}
                    tabIndex={0}
                    role="region"
                    aria-label={`${course} ${ageLabel} record table`}
                  >
                    <table className={s.table}>
                      <caption className="sr-only">
                        {teamName} · {course} · {ageLabel} · girls and boys
                        records
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Girls</th>
                          <th scope="col">Date</th>
                          <th scope="col">Record</th>
                          <th scope="col">Event</th>
                          <th scope="col">Record</th>
                          <th scope="col">Date</th>
                          <th scope="col">Boys</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(events.get(course) ?? []).map((event) => (
                          <tr
                            key={event}
                            className={
                              event.endsWith("-R") ? s.relayRow : undefined
                            }
                          >
                            <RecordCells
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
                            <th scope="row" className={s.event}>
                              {event.replace("_", " ")}
                            </th>
                            <RecordCells
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
                              reverse
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
