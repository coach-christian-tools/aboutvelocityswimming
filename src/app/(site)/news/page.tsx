import type { Metadata } from "next";
import SectionPage from "@/components/SectionPage";
import styles from "@/components/SectionPage.module.css";

export const metadata: Metadata = {
  title: "News | Velocity Swimming",
  description: "Monthly news, team stories, and community updates from Velocity Swimming.",
};

export default function NewsPage() {
  return (
    <SectionPage eyebrow="From our lanes to your home" title="News" description="The people, progress, and moments that make us Velocity. A new way to keep up with life on the team.">
      <section className={`${styles.panel} ${styles.newsFeature}`} aria-labelledby="first-issue-title">
        <div className={styles.issueCover} aria-hidden="true">
          <span className={styles.coverBrand}>Velocity Swimming / Team stories</span>
          <div className={styles.coverTitle}>In &amp; out<br />of <em>the water.</em></div>
          <span className={styles.coverFooter}>Our monthly newsletter is taking shape.</span>
        </div>
        <div className={styles.panelContent}>
          <span className={styles.status}>First issue coming soon</span>
          <h2 id="first-issue-title">A little closer to the team.</h2>
          <p>We’re preparing a monthly newsletter with swimmer highlights, team updates, and stories from our community. Each issue will have its own home here, ready to read and revisit.</p>
        </div>
      </section>
      <section aria-labelledby="archive-title">
        <div className={styles.sectionHeading}><h2 id="archive-title">Past issues</h2><p>A growing collection of team memories.</p></div>
        <div className={styles.archive}><h2>The archive starts here.</h2><p>Once our first newsletter is published, you’ll find every monthly issue in this space.</p></div>
      </section>
    </SectionPage>
  );
}
