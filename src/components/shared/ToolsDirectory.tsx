"use client";
import Link from "next/link";
import { useAuth } from "@/features/workshare/contexts/auth";
import SectionPage from "@/components/SectionPage";
import styles from "@/components/SectionPage.module.css";
const tools = [
  { title: "IES Times", description: "Explore approved results and time standards for Inland Empire athletes wherever they compete.", href: "/tools/times" },
  { title: "Velocity Workshare", description: "Find volunteer opportunities, sign up for shifts, and track your family’s workshare hours.", href: "/tools/workshare" },
  { title: "USA Swim Wiki", description: "Explore teams, meets, swimming organizations, and documents with original source links.", href: "/tools/knowledge" },
];
const staffTools = [
  { title: "Review collected changes", description: "Review proposed additions and corrections before they are published.", href: "/tools/review" },
  { title: "Coach attendance", description: "Manage practice attendance and review your athletes’ participation.", href: "/tools/swim-resources/attendance" },
];
export default function ToolsDirectory() {
  const { isAdmin, loading } = useAuth();
  return <SectionPage><div className={styles.tools}>
    {[...tools, ...(!loading && isAdmin ? staffTools : [])].map(tool => <Link className={`${styles.tool} ${styles.toolLink}`} href={tool.href} key={tool.href}>
      <h2>{tool.title}</h2><p>{tool.description}</p>
    </Link>)}
  </div></SectionPage>;
}
