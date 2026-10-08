import type { Metadata } from "next";
import SectionPage from "@/components/SectionPage";
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
    <SectionPage eyebrow="Make time for the water" title="Schedule" description="Your week in the pool, all in one place. Find your practice, plan for meet weekends, and stay in step with the team.">
      <ScheduleCalendar initialMonth={today.slice(0, 7)} today={today} />
    </SectionPage>
  );
}
