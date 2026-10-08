import type { Metadata } from "next";
import SectionPage, { SectionIcon } from "@/components/SectionPage";
import styles from "@/components/SectionPage.module.css";

export const metadata: Metadata = {
  title: "Schedule | Velocity Swimming",
  description: "Practice schedules and upcoming meet information for Velocity Swimming families.",
};

export default function SchedulePage() {
  return (
    <SectionPage eyebrow="Make time for the water" title="Schedule" description="Your week in the pool, all in one place. Practice times and meet weekends for the Velocity community.">
      <section className={`${styles.panel} ${styles.practicePanel}`} aria-labelledby="practice-title">
        <div className={styles.calendarArt} aria-hidden="true">
          <svg className={styles.calendarDrawing} viewBox="0 0 260 210" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="20" y="25" width="220" height="170" rx="14" fill="#ffffff09" />
            <path d="M20 70h220M75 12v28m110-28v28" strokeWidth="4" strokeLinecap="round" />
            {[0, 1, 2].map(row => [0, 1, 2, 3, 4].map(col => <rect key={`${row}-${col}`} x={44 + col * 36} y={90 + row * 30} width="20" height="12" rx="3" fill="currentColor" opacity={0.12} stroke="none" />))}
          </svg>
        </div>
        <div className={styles.panelContent}>
          <span className={styles.status}>Coming soon</span>
          <h2 id="practice-title">A clearer view of practice.</h2>
          <p>We’re bringing the practice calendar here. In the meantime, find current times, groups, and locations on our official schedule.</p>
          <a className={styles.action} href="https://www.gomotionapp.com/team/ievs/page/practice-calendar/practice-calendar1" target="_blank" rel="noopener noreferrer">View current practice schedule <span aria-hidden="true">↗</span></a>
        </div>
      </section>
      <section aria-labelledby="meets-title">
        <div className={styles.sectionHeading}><h2 id="meets-title">Meet weekends</h2><p>The next chapter of your season.</p></div>
        <div className={styles.emptyMeet}>
          <div className={styles.icon}><SectionIcon kind="flag" /></div>
          <div><h3>Meet information is on the way.</h3><p>Upcoming meets, important dates, and links to official event information will appear here.</p></div>
        </div>
      </section>
    </SectionPage>
  );
}
