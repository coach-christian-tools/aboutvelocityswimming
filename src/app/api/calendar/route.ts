import { unstable_cache } from "next/cache";
import { CALENDAR_FEED, monthDays } from "@/lib/calendar-shared";
import { parseCalendar } from "@/lib/calendar";

// Cache the small, normalized month instead of Google’s feed, which exceeds
// Next’s 2 MB fetch-cache limit. This project does not enable Cache Components.
const getMonthEvents = unstable_cache(async (month: string) => {
  const response = await fetch(CALENDAR_FEED, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Calendar returned ${response.status}`);
  const days = monthDays(month);
  const from = new Date(`${days[0]}T00:00:00Z`);
  const to = new Date(new Date(`${days.at(-1)}T00:00:00Z`).getTime() + 2 * 86400000);
  return parseCalendar(await response.text(), from, to);
}, ["velocity-calendar-month-v1"], { revalidate: 300 });

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month");
  if (!month || !/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(month)) {
    return Response.json({ error: "Choose a valid calendar month." }, { status: 400 });
  }
  try {
    const events = await getMonthEvents(month);
    return Response.json({ events }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
  } catch (error) {
    console.error("Unable to load Velocity calendar", error);
    return Response.json({ error: "The calendar is temporarily unavailable. Please try again or open Google Calendar." }, { status: 502 });
  }
}
