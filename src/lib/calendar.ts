import ical from "node-ical";
import { calendarDate, type CalendarEvent } from "./calendar-shared";

function text(value: ical.ParameterValue | undefined): string {
  return typeof value === "string" ? value : value?.val ?? "";
}

export async function parseCalendar(source: string, from: Date, to: Date): Promise<CalendarEvent[]> {
  if (!source.trimStart().startsWith("BEGIN:VCALENDAR")) throw new Error("Invalid calendar response");
  const calendar = await ical.async.parseICS(source);
  const events = new Map<string, CalendarEvent>();
  for (const event of Object.values(calendar)) {
    if (event?.type !== "VEVENT" || event.status === "CANCELLED") continue;
    // Include overrides moved into this window from a recurrence outside it.
    const sources = [event, ...new Set(Object.values(event.recurrences ?? {}).map(override => override as ical.VEvent))];
    for (const sourceEvent of sources) {
      if (sourceEvent.status === "CANCELLED" || !sourceEvent.start) continue;
      for (const instance of ical.expandRecurringEvent(sourceEvent, { from, to, expandOngoing: true })) {
        if (instance.event.status === "CANCELLED" || instance.start >= to || (instance.end <= from && instance.start < from)) continue;
        const id = `${event.uid}:${instance.start.toISOString()}`;
        const lastMoment = new Date(Math.max(instance.start.getTime(), instance.end.getTime() - 1));
        events.set(id, {
          id,
          title: text(instance.summary) || "Team event",
          start: instance.start.toISOString(),
          end: instance.end.toISOString(),
          startDay: calendarDate(instance.start, instance.isFullDay),
          endDay: calendarDate(lastMoment, instance.isFullDay),
          allDay: instance.isFullDay,
          location: text(instance.event.location ?? event.location),
          description: text(instance.event.description ?? event.description),
        });
      }
    }
  }
  return [...events.values()].sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}
