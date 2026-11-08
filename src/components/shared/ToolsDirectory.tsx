"use client";
import Link from "next/link";
import { useAuth } from "@/features/workshare/contexts/auth";
import SectionPage from "@/components/SectionPage";
import styles from "@/components/SectionPage.module.css";
import { getAvailableTools } from "@/lib/tool-directory";

export default function ToolsDirectory() {
  const { isAdmin, loading } = useAuth();
  return <SectionPage><div className={styles.tools}>
    {getAvailableTools(!loading && isAdmin).map(([id, tool]) => <Link className={`${styles.tool} ${styles.toolLink}`} href={tool.href} key={id}>
      <h2>{tool.title}</h2><p>{tool.description}</p>
    </Link>)}
  </div></SectionPage>;
}
