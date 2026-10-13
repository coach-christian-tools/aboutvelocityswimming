import type { MeetEventEntry } from "./times-api";
import { eventLabel } from "./times-data";
import s from "./TimesDatabase.module.css";

export function meetEventLabel(event: MeetEventEntry) {
  const gender =
    { F: "Girls", M: "Boys", X: "Mixed" }[event.gender] || "Gender unreported";
  return `${event.eventNumber == null ? "" : `#${event.eventNumber} · `}${gender} · ${event.ageGroup || "Event age group unreported"} · ${eventLabel(event.event)} · ${event.course}`;
}

export default function MeetEventNavigation({
  events,
  selectedKey,
  onSelect,
}: {
  events: MeetEventEntry[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const groups = [
    { ordering: "official", label: "Official event order" },
    {
      ordering: "fallback",
      label: "Event order unavailable — grouped by event",
    },
  ]
    .map((group) => ({
      ...group,
      events: events.filter((event) => event.ordering === group.ordering),
    }))
    .filter((group) => group.events.length);
  return (
    <>
      <nav className={s.meetEventNav} aria-label="Meet events">
        {groups.map((group) => (
          <section key={group.ordering}>
            <h3>{group.label}</h3>
            {group.events.map((event) => (
              <button
                type="button"
                key={event.key}
                className={s.meetEventButton}
                aria-pressed={selectedKey === event.key}
                aria-controls="meet-event-results"
                onClick={() => onSelect(event.key)}
              >
                <span>{meetEventLabel(event)}</span>
                <small>
                  {event.count.toLocaleString("en-US")}{" "}
                  {event.count === 1 ? "result" : "results"}
                </small>
              </button>
            ))}
          </section>
        ))}
      </nav>
      <label className={s.meetEventSelect}>
        Meet event
        <select
          aria-label="Meet event"
          value={selectedKey}
          onChange={(e) => onSelect(e.target.value)}
        >
          {groups.map((group) => (
            <optgroup key={group.ordering} label={group.label}>
              {group.events.map((event) => (
                <option key={event.key} value={event.key}>
                  {meetEventLabel(event)} · {event.count} results
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </>
  );
}
