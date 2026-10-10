"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CALENDAR_TIME_ZONE, CALENDAR_URL, eventsOnDay, monthDays, type CalendarEvent } from "@/lib/calendar-shared";
import styles from "./ScheduleCalendar.module.css";

const timeFormatter = new Intl.DateTimeFormat("en-US", { timeZone: CALENDAR_TIME_ZONE, hour: "numeric", minute: "2-digit" });
const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
const monthFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function timeLabel(event: CalendarEvent) {
  return event.allDay ? "All day" : `${timeFormatter.format(new Date(event.start))} – ${timeFormatter.format(new Date(event.end))}`;
}

function eventKind(title: string) {
  if (/\bno practice\b|\bcancel(?:led|ed)\b/i.test(title)) return "notice";
  if (/\bmeet\b|\binvitational\b|\bchampionship\b|\bchallenge\b/i.test(title)) return "meet";
  return "practice";
}

function groupByStart(events: CalendarEvent[]): CalendarEvent[][] {
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = event.allDay ? "all-day" : event.start;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export default function ScheduleCalendar({ initialMonth, today }: { initialMonth: string; today: string }) {
  const [month, setMonth] = useState(initialMonth);
  const [view, setView] = useState<"month" | "agenda">("month");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<{ month: string; events: CalendarEvent[]; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/calendar?month=${month}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load the calendar.");
        if (!controller.signal.aborted) setResult({ month, events: data.events });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ month, events: [], error: error instanceof Error ? error.message : "Unable to load the calendar." });
      }
    }
    void load();
    return () => controller.abort();
  }, [month, attempt]);

  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);

  const loading = result?.month !== month;
  const events = useMemo(() => result?.month === month ? result.events : [], [result, month]);
  const days = monthDays(month);
  const filtered = useMemo(() => events.filter(event =>
    (!search.trim() || `${event.title} ${event.location} ${event.description}`.toLowerCase().includes(search.trim().toLowerCase())),
  ), [events, search]);
  const visibleEvents = filtered.filter(event => event.startDay <= `${month}-31` && event.endDay >= `${month}-01`);
  const agenda = days.filter(day => day.startsWith(month)).map(day => ({ day, events: eventsOnDay(filtered, day) })).filter(day => day.events.length);
  const displayedAgenda = view === "month" ? agenda.filter(({ day }) => day === selectedDay) : agenda;
  const selectedDayEvents = selectedDay ? eventsOnDay(filtered, selectedDay) : [];
  const hasFilters = Boolean(search.trim());
  const monthLabel = monthFormatter.format(new Date(`${month}-01T12:00:00Z`));

  function moveMonth(direction: number) {
    const [year, number] = month.split("-").map(Number);
    setMonth(new Date(Date.UTC(year, number - 1 + direction, 1)).toISOString().slice(0, 7));
    setSelectedDay(null);
  }

  function clearFilters() { setSearch(""); }

  return (
    <section className={styles.calendar} aria-label="Team calendar">
      <div className={styles.filters}>
        <label><span className="sr-only">Search</span><input type="search" placeholder="Find a practice or meet…" value={search} onChange={event => setSearch(event.target.value)} /></label>
        {hasFilters ? <button type="button" className={styles.clear} onClick={clearFilters}>Clear search</button> : null}
        <a className={styles.subscribe} href={CALENDAR_URL} target="_blank" rel="noopener noreferrer">Add to my calendar <span aria-hidden="true">↗</span></a>
      </div>
      {hasFilters ? <p className={styles.filterNote}>Showing matching events only. <button type="button" onClick={clearFilters}>Show all events</button> to check team notices and schedule changes.</p> : null}

      <div className={styles.toolbar}>
        <div className={styles.navigation}>
          <div className={styles.arrows}><button type="button" aria-label="Previous month" disabled={month === "1900-01"} onClick={() => moveMonth(-1)}>‹</button><button type="button" aria-label="Next month" disabled={month === "2099-12"} onClick={() => moveMonth(1)}>›</button></div>
          <h3>{monthLabel}</h3>
          <button type="button" className={styles.today} onClick={() => { setMonth(initialMonth); setSelectedDay(today); }}>Today</button>
        </div>
        <div className={styles.views} role="group" aria-label="Calendar view"><button type="button" aria-pressed={view === "month"} onClick={() => setView("month")}>Month</button><button type="button" aria-pressed={view === "agenda"} onClick={() => setView("agenda")}>Agenda</button></div>
      </div>

      <div className={styles.summary}><p role="status" aria-live="polite">{loading ? "Loading calendar…" : result?.error ? "Calendar unavailable" : `${visibleEvents.length} ${visibleEvents.length === 1 ? "event" : "events"}${hasFilters ? " matching your search" : " this month"}`}</p><span>All times Pacific</span></div>

      {view === "month" ? <div className={styles.mobilePicker}>
        <p className={styles.pickerHint}>Select a day to see its schedule.</p>
        <div className={styles.dateGrid} role="group" aria-label="Choose a date">
          {weekdays.map(day => <span className={styles.dateWeekday} key={day}>{day}</span>)}
          {days.map(day => {
            const dayEvents = eventsOnDay(filtered, day);
            const kinds = [...new Set(dayEvents.map(event => eventKind(event.title)))];
            const label = dayFormatter.format(new Date(`${day}T12:00:00Z`));
            return <button type="button" key={day} className={`${styles.dateButton} ${day === today ? styles.dateToday : ""}`} disabled={!day.startsWith(month)} aria-label={`${label}${loading ? "" : `, ${dayEvents.length} ${dayEvents.length === 1 ? "event" : "events"}`}`} aria-pressed={selectedDay === day} aria-current={day === today ? "date" : undefined} aria-controls="mobile-day-schedule" onClick={() => setSelectedDay(day)}>
              <time dateTime={day}>{Number(day.slice(-2))}</time>
              <span className={styles.dateDots} aria-hidden="true">{kinds.map(kind => <i key={kind} className={styles[`${kind}Dot`]} />)}</span>
            </button>;
          })}
        </div>
      </div> : null}

      {loading ? <div className={styles.message} aria-busy="true"><span className={styles.loadingDot} />Finding your time in the water…</div> : result?.error ? (
        <div className={styles.message} role="alert"><h3>We couldn’t load the calendar.</h3><p>{result.error}</p><button type="button" onClick={() => { setResult(null); setAttempt(value => value + 1); }}>Try again</button><a href={CALENDAR_URL} target="_blank" rel="noopener noreferrer">Open Google Calendar ↗</a></div>
      ) : (
        <>
          {view === "month" ? <div className={styles.monthGrid}>
            {weekdays.map(day => <div className={styles.weekday} key={day}>{day}</div>)}
            {days.map(day => <div key={day} className={`${styles.day} ${day.startsWith(month) ? "" : styles.outside}`}>
              <time dateTime={day} className={day === today ? styles.currentDay : styles.dayNumber} aria-label={dayFormatter.format(new Date(`${day}T12:00:00Z`))} aria-current={day === today ? "date" : undefined}>{Number(day.slice(-2))}</time>
              {groupByStart(eventsOnDay(filtered, day)).map(group => <div className={styles.eventRow} key={group[0].id}>{group.map(event => <button type="button" key={event.id} className={`${styles.event} ${styles[eventKind(event.title)]}`} onClick={() => setSelected(event)}><span className={styles.eventTime}>{event.allDay ? "All day" : timeFormatter.format(new Date(event.start))}</span><span>{event.title}</span></button>)}</div>)}
            </div>)}
          </div> : null}
          <div id="mobile-day-schedule" className={view === "month" ? styles.mobileAgenda : styles.agenda} aria-live={view === "month" ? "polite" : undefined}>
            {view === "month" && selectedDay ? <h2 className={styles.selectedDateHeading}>{dayFormatter.format(new Date(`${selectedDay}T12:00:00Z`))}</h2> : null}
            {view === "month" && selectedDay && !selectedDayEvents.length ? <p className={styles.dayEmpty}>{hasFilters ? "No events match your search on this day." : "No events scheduled for this day."}</p> : null}
            {displayedAgenda.length ? displayedAgenda.map(({ day, events: dayEvents }) => <section className={styles.agendaDay} key={day} aria-label={dayFormatter.format(new Date(`${day}T12:00:00Z`))}>
              <div className={styles.agendaDate}><span>{weekdays[new Date(`${day}T12:00:00Z`).getUTCDay()]}</span><time dateTime={day} className={day === today ? styles.currentDay : ""}>{Number(day.slice(-2))}</time></div>
              <div className={styles.agendaEvents}>{dayEvents.map(event => <button type="button" className={`${styles.agendaEvent} ${styles[eventKind(event.title)]}`} key={event.id} onClick={() => setSelected(event)}><span className={styles.agendaTime}>{timeLabel(event)}</span><span className={styles.agendaDetails}><strong>{event.title}</strong>{event.location ? <span>{event.location}</span> : null}</span><span className={styles.detailArrow} aria-hidden="true">↗</span></button>)}</div>
            </section>) : null}
          </div>
          {!visibleEvents.length ? <div className={styles.message}><h3>{hasFilters ? "No events match your search." : "No events scheduled this month."}</h3><p>{hasFilters ? "Try another search." : "Check another month or come back for schedule updates."}</p>{hasFilters ? <button type="button" onClick={clearFilters}>Clear search</button> : null}</div> : null}
        </>
      )}

      <div className={styles.footer}><div className={styles.legend}><span><i className={styles.practiceDot} />Practice &amp; team events</span><span><i className={styles.meetDot} />Meets</span><span><i className={styles.noticeDot} />Schedule notices</span></div><p>Updated from the team’s Google Calendar.</p></div>
      <noscript><p className={styles.message}>Enable JavaScript to browse and filter events, or <a href={CALENDAR_URL}>view the team calendar in Google Calendar</a>.</p></noscript>

      <dialog ref={dialog} className={styles.dialog} onClose={() => setSelected(null)} aria-labelledby="event-title">
        {selected ? <><div className={styles.dialogTop}><span className={styles.dialogEyebrow}>Team calendar</span><button type="button" autoFocus aria-label="Close event details" onClick={() => setSelected(null)}>×</button></div><h2 id="event-title">{selected.title}</h2><p className={styles.dialogDate}>{dayFormatter.format(new Date(`${selected.startDay}T12:00:00Z`))}{selected.endDay !== selected.startDay ? ` – ${dayFormatter.format(new Date(`${selected.endDay}T12:00:00Z`))}` : ""}</p><p>{timeLabel(selected)}{selected.allDay ? "" : " · Pacific time"}</p>{selected.location ? <p className={styles.dialogLocation}>{selected.location}<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.location)}`} target="_blank" rel="noopener noreferrer">Get directions ↗</a></p> : null}{selected.description ? <p className={styles.description}>{selected.description}</p> : null}<a className={styles.subscribe} href={CALENDAR_URL} target="_blank" rel="noopener noreferrer">Open team calendar ↗</a></> : null}
      </dialog>
    </section>
  );
}
