"use client";
import Link from "next/link";
import { useAuth } from "@/features/workshare/contexts/auth";
import { WORKSHARE_PATH } from "@/features/workshare/lib/routes";
import { SWIM_RESOURCES_PATH } from "@/features/swim-resources/lib/routes";
import SectionPage, { SectionIcon } from "@/components/SectionPage";
import styles from "@/components/SectionPage.module.css";
const tools = [
  {
    title: "Swim Resources",
    audience: "For swimmers & coaches",
    icon: "book" as const,
    description:
      "Explore swimming knowledge, time standards, and helpful tools as our resource library grows.",
    href: SWIM_RESOURCES_PATH,
  },
  {
    title: "Workshare",
    audience: "For families",
    icon: "people" as const,
    description:
      "Find volunteer opportunities, sign up for shifts, and keep track of your family’s workshare hours.",
    href: WORKSHARE_PATH,
  },
  {
    title: "Coach Attendance",
    audience: "For coaches",
    href: SWIM_RESOURCES_PATH + "/attendance",
    icon: "attendance" as const,
    description:
      "Take practice attendance and keep swimmer participation organized throughout the season.",
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
                  : tool.title === "Workshare" && !user
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
