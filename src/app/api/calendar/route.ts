import { CALENDAR_LOAD_ERROR } from "@/lib/calendar-shared";
import { getMonthEvents } from "@/lib/calendar-server";

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
    return Response.json({ error: CALENDAR_LOAD_ERROR }, { status: 502 });
  }
}
