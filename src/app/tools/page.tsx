import type { Metadata } from "next";
import SectionPage, { SectionIcon } from "@/components/SectionPage";
import styles from "@/components/SectionPage.module.css";

export const metadata: Metadata = {
  title: "Tools | Velocity Swimming",
  description: "A future home for Velocity Swimming workshare, coach attendance, and swim resources.",
};

const tools = [
  { title: "Workshare", audience: "For families", icon: "people" as const, description: "Find volunteer opportunities, sign up for shifts, and keep track of your family’s workshare hours." },
  { title: "Coach Attendance", audience: "For coaches", icon: "attendance" as const, description: "Take practice attendance and keep swimmer participation organized throughout the season." },
  { title: "Swim Resources", audience: "For swimmers & coaches", icon: "book" as const, description: "Explore swimming knowledge, time standards, and helpful tools as our resource library grows." },
];

export default function ToolsPage() {
  return (
    <SectionPage eyebrow="Built around our team" title="Tools" description="Less searching, more swimming. We’re bringing the resources families and coaches use into one familiar place.">
      <div className={styles.tools}>
        {tools.map((tool, index) => (
          <article className={styles.tool} key={tool.title}>
            <div className={styles.toolTop}><div className={styles.icon}><SectionIcon kind={tool.icon} /></div><span className={styles.toolNumber} aria-hidden="true">0{index + 1}</span></div>
            <p className={styles.toolAudience}>{tool.audience}</p>
            <h2>{tool.title}</h2>
            <p className={styles.toolDescription}>{tool.description}</p>
            <span className={styles.status}>Coming soon</span>
          </article>
        ))}
      </div>
      <p className={styles.toolsNote}>These tools are still taking shape. We’ll share updates as each one becomes available here.</p>
    </SectionPage>
  );
}
