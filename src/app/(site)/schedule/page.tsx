import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import Footer from "@/components/Footer";
import styles from "@/components/ScheduleCalendar.module.css";
import ScheduleCalendar from "@/components/ScheduleCalendar";
import { CALENDAR_LOAD_ERROR, calendarDate, type CalendarEvent } from "@/lib/calendar-shared";
import { getMonthEvents } from "@/lib/calendar-server";

export const metadata: Metadata = {
  title: "Schedule | Velocity Swimming",
  description: "Explore Velocity Swimming’s live practice and competition calendar. Filter by group, event, or pool to find your time in the water.",
};

export default function SchedulePage() {
  return (
    <>
      <main className={styles.page}>
        <Suspense fallback={<section className={styles.calendar} aria-label="Team calendar"><div className={styles.message} role="status" aria-busy="true"><span className={styles.loadingDot} />Finding your time in the water…</div></section>}>
          <InitialCalendar />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

async function InitialCalendar() {
  // Compute Pacific dates per request without force-dynamic disabling the cache.
  await connection();
  const today = calendarDate(new Date());
  const initialMonth = today.slice(0, 7);
  let events: CalendarEvent[] = [];
  let error: string | undefined;
  try {
    events = await getMonthEvents(initialMonth);
  } catch (cause) {
    console.error("Unable to load Velocity calendar", cause);
    error = CALENDAR_LOAD_ERROR;
  }
  return <ScheduleCalendar initialMonth={initialMonth} today={today} initialEvents={events} initialError={error} />;
}
