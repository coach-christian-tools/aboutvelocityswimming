import type { Metadata } from "next";
import Link from "next/link";
import { WORKSHARE_PATH } from "@/features/workshare/lib/routes";
import { SWIM_RESOURCES_PATH } from "@/features/swim-resources/lib/routes";
import SectionPage, { SectionIcon } from "@/components/SectionPage";
import styles from "@/components/SectionPage.module.css";

export const metadata: Metadata = {
  title: "Tools | Velocity Swimming",
  description: "Workshare, Swim Resources, and tools for Velocity Swimming families and coaches.",
};

const tools = [
  { title: "Swim Resources", audience: "For swimmers & coaches", icon: "book" as const, description: "Explore swimming knowledge, time standards, and helpful tools as our resource library grows.", href: SWIM_RESOURCES_PATH },
  { title: "Workshare", audience: "For families", icon: "people" as const, description: "Find volunteer opportunities, sign up for shifts, and keep track of your family’s workshare hours.", href: WORKSHARE_PATH },
  { title: "Coach Attendance", audience: "For coaches", icon: "attendance" as const, description: "Take practice attendance and keep swimmer participation organized throughout the season." },
];

export default function ToolsPage() {
  return (
    <SectionPage>
      <div className={styles.tools}>
        {tools.map((tool, index) => (
          <article className={styles.tool} key={tool.title}>
            <div className={styles.toolTop}><div className={styles.icon}><SectionIcon kind={tool.icon} /></div><span className={styles.toolNumber} aria-hidden="true">0{index + 1}</span></div>
            <p className={styles.toolAudience}>{tool.audience}</p>
            <h2>{tool.title}</h2>
            <p className={styles.toolDescription}>{tool.description}</p>
            {tool.href ? <Link className={styles.status} href={tool.href}>Open {tool.title} →</Link> : <span className={styles.status}>Coming soon</span>}
          </article>
        ))}
      </div>
      <p className={styles.toolsNote}>Workshare and Swim Resources are available and still growing. We’ll share updates as more tools become available here.</p>
    </SectionPage>
  );
}
