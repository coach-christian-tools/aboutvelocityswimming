"use client";
import Link from "next/link";
import { useAuth } from "@/features/workshare/contexts/auth";
import { WORKSHARE_PATH } from "@/features/workshare/lib/routes";
import { SWIM_RESOURCES_PATH } from "@/features/swim-resources/lib/routes";
import SectionPage, { SectionIcon } from "@/components/SectionPage";
import styles from "@/components/SectionPage.module.css";
const tools = [
  {
    title: "Inland Empire Times Database",
    audience: "For swimmers & coaches",
    icon: "book" as const,
    description:
      "Explore approved results and time standards for Inland Empire athletes wherever they compete.",
    href: "/tools/times",
  },
  {
    title: "Velocity Workshare",
    audience: "For families",
    icon: "people" as const,
    description:
      "Find volunteer opportunities, sign up for shifts, and keep track of your family’s workshare hours.",
    href: WORKSHARE_PATH,
  },
  {
    title: "USA Swimming Knowledge Base",
    audience: "For the swimming community",
    href: "/tools/knowledge",
    icon: "book" as const,
    description:
      "Find meet, region, LSC, team, and venue information with original source links.",
  },
];

export default function ToolsDirectory() {
  const { isAdmin, user, loading } = useAuth();
  return (
    <SectionPage>
      <div className={styles.tools}>
        {tools.map((tool, index) => (
          <article className={styles.tool} key={tool.title}>
            <div className={styles.toolTop}>
              <div className={styles.icon}>
                <SectionIcon kind={tool.icon} />
              </div>
              <span className={styles.toolNumber} aria-hidden="true">
                0{index + 1}
              </span>
            </div>
            <p className={styles.toolAudience}>{tool.audience}</p>
            <h2>{tool.title}</h2>
            <p className={styles.toolDescription}>{tool.description}</p>
            {tool.href ? (
              <Link
                className={styles.status}
                href={
                  tool.title === "Coach Attendance" && !isAdmin
                    ? "/login"
                    : tool.href
                }
              >
                {tool.title === "Coach Attendance" && !isAdmin
                  ? "Staff sign-in"
                  : tool.title === "Velocity Workshare" && !user
                    ? "Family sign-in"
                    : "Open " + tool.title}{" "}
                →
              </Link>
            ) : (
              <span className={styles.status}>Coming soon</span>
            )}
          </article>
        ))}
      </div>
      {isAdmin && (
        <p className={styles.toolsNote}>
          <Link href="/tools/review">Review collected changes</Link> ·{" "}
          <Link href={SWIM_RESOURCES_PATH + "/attendance"}>
            Coach attendance
          </Link>
        </p>
      )}
      <p className={styles.toolsNote}>
        {loading
          ? "Checking your account…"
          : isAdmin
            ? "Your staff account has access to attendance, imports, maintenance, and family administration."
            : user
              ? "Your account can access the records for your linked family."
              : "Sign in once to access family or staff tools. Times and standards are public."}
      </p>
    </SectionPage>
  );
}
