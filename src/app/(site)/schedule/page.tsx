import type { Metadata } from "next";
import Footer from "@/components/Footer";
import styles from "@/components/ScheduleCalendar.module.css";
import ScheduleCalendar from "@/components/ScheduleCalendar";
import { calendarDate } from "@/lib/calendar-shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Schedule | Velocity Swimming",
  description: "Explore Velocity Swimming’s live practice and competition calendar. Filter by group, event, or pool to find your time in the water.",
};

export default function SchedulePage() {
  const today = calendarDate(new Date());
  return (
    <>
      <main className={styles.page}>
        <ScheduleCalendar initialMonth={today.slice(0, 7)} today={today} />
      </main>
      <Footer />
    </>
  );
}
