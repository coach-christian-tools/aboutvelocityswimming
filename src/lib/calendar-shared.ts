export const CALENDAR_ID = "webadmin@velocity-swimming.com";
export const CALENDAR_URL = "https://calendar.google.com/calendar/u/0?cid=d2ViYWRtaW5AdmVsb2NpdHktc3dpbW1pbmcuY29t";
export const CALENDAR_FEED = `https://calendar.google.com/calendar/ical/${encodeURIComponent(CALENDAR_ID)}/public/basic.ics`;
export const CALENDAR_TIME_ZONE = "America/Los_Angeles";

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  startDay: string;
  endDay: string;
  allDay: boolean;
  location: string;
  description: string;
};

export function calendarDate(date: Date, allDay = false): string {
  // node-ical normalizes DATE values to host-local midnight.
  if (allDay) return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CALENDAR_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}

export function monthDays(month: string): string[] {
  const [year, number] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1));
  const count = Math.ceil((first.getUTCDay() + new Date(Date.UTC(year, number, 0)).getUTCDate()) / 7) * 7;
  return Array.from({ length: count }, (_, index) => new Date(Date.UTC(year, number - 1, 1 - first.getUTCDay() + index)).toISOString().slice(0, 10));
}

export function eventsOnDay(events: CalendarEvent[], day: string): CalendarEvent[] {
  return events.filter(event => event.startDay <= day && event.endDay >= day);
}
