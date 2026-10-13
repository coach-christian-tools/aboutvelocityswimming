import { useState } from "react";
import { formatSwimTime } from "@/features/swim-resources/lib/domain/swim-time";
import {
  eventLabel,
  relayLineupCoverage,
  strokes,
  type Race,
} from "./times-data";
import { timesUrl } from "./times-api";
import { useTimes } from "./use-times";
import ResultModeration from "./ResultModeration";
import s from "./TimesDatabase.module.css";

function LeadOffOrigin({
  race,
  onRace,
}: {
  race: Race;
  onRace: (race: Race) => void;
}) {
  const [open, setOpen] = useState(false);
  const parent = useTimes(
    open && race.parentRelayResultId
      ? timesUrl("race", { raceId: race.parentRelayResultId })
      : null,
  );
  const relay = parent.data?.rows?.[0]?.race;
  return (
    <div className={s.origin}>
      <strong>Verified relay lead-off</strong>
      <p>
        This flat-start time can count toward individual personal bests and
        records when it is not under review. The relay’s final status is recorded separately.
      </p>
      {race.parentRelayResultId &&
        (relay ? (
          <button className={s.link} onClick={() => onRace(relay)}>
            View parent relay · {eventLabel(relay.event)}
          </button>
        ) : (
          <button
            className={s.link}
            disabled={parent.loading}
            onClick={() => {
              setOpen(true);
              if (parent.error) parent.retry();
            }}
          >
            {parent.loading
              ? "Loading parent relay…"
              : parent.error
                ? "Retry parent relay"
                : "Load parent relay"}
          </button>
        ))}
      {open && parent.data && !relay && (
        <p>Parent relay details are unavailable.</p>
      )}
    </div>
  );
}

export default function RaceDetails({
  race,
  onAthlete,
  onRace,
}: {
  race: Race;
  onAthlete: (id: string) => void;
  onRace: (race: Race) => void;
}) {
  const unit = race.course === "SCY" ? "yd" : "m";
  const members = race.members ?? [];
  const splits = race.splits ?? [];
  const lineupCoverage = race.lineupCoverage ?? relayLineupCoverage(members);
  return (
    <div className={s.raceDetails}>
      <ResultModeration key={`${race.resultType}:${race.id}`} race={race} onRace={onRace} />
      {race.resultOrigin === "relay_leadoff" && (
        <LeadOffOrigin key={race.id} race={race} onRace={onRace} />
      )}
      {race.relay && (
        <section aria-label="Relay lineup">
          <h3>Relay lineup</h3>
          <p className={s.note}>
            {lineupCoverage === "complete"
              ? "Complete lineup with linked athlete profiles."
              : lineupCoverage === "partial"
                ? members.length === 4
                  ? "All four members are reported; some athlete profiles are unlinked."
                  : "Partial reported lineup; some members are unavailable."
                : "Relay lineup is unavailable."}
          </p>
          <ol className={s.lineup}>
            {[1, 2, 3, 4].map((leg) => {
              const member = members.find((member) => member.leg === leg);
              return (
                <li key={leg}>
                  <div>
                    {member?.athleteId ? (
                      <button
                        className={s.link}
                        onClick={() => onAthlete(member.athleteId!)}
                      >
                        {member.name || "Unnamed member"}
                      </button>
                    ) : (
                      <span>{member?.name || "Member unreported"}</span>
                    )}
                    {member?.stroke && (
                      <small>{strokes[member.stroke] || member.stroke}</small>
                    )}
                    {member?.leadOffEligible && (
                      <small>Verified lead-off · individual eligible</small>
                    )}
                  </div>
                  <span>
                    {member?.timeMs ? formatSwimTime(member.timeMs) : "—"}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className={s.note}>
            Leg times are shown only when split boundaries are verified.
            Flying-start legs remain relay splits.
          </p>
        </section>
      )}
      <section aria-label="Race splits">
        <h3>Race splits</h3>
        <p className={s.note}>
          {race.splitCoverage === "complete"
            ? "Complete validated split coverage."
            : race.splitCoverage === "partial"
              ? "Partial validated split coverage; some distances are unavailable."
              : "Validated split distances are unavailable."}
        </p>
        {splits.length > 0 && (
          <div className={s.tableWrap}>
            <table className={`${s.table} ${s.splitTable}`}>
              <caption className="sr-only">
                Validated cumulative and lap times
              </caption>
              <thead>
                <tr>
                  <th scope="col">Distance</th>
                  <th scope="col">Cumulative</th>
                  <th scope="col">Lap</th>
                </tr>
              </thead>
              <tbody>
                {splits.map((split) => (
                  <tr key={split.distance}>
                    <th scope="row">
                      {split.distance} {unit}
                    </th>
                    <td>{formatSwimTime(split.cumulativeMs)}</td>
                    <td>{split.lapMs ? formatSwimTime(split.lapMs) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
