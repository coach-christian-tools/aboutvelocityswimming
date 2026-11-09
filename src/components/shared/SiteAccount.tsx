"use client";
import { CircleUserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/features/workshare/contexts/auth";
import { isToolsAdmin, isToolsPage } from "@/lib/tools-access";
import styles from "./SiteAccount.module.css";

export default function SiteAccount() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  if (loading || (isToolsPage(pathname) && isToolsAdmin(user?.email, user?.emailVerified === true))) return null;
  const className = `${styles.pill} ${styles.account}`;
  return user ? (
    <button
      type="button"
      className={className}
      aria-label="Sign Out"
      onClick={() => void logout()}
      title={user.email ?? "Signed in"}
    >
      <CircleUserRound className={styles.icon} aria-hidden="true" />
      <span className={styles.email} aria-hidden="true">
        <span className={styles.emailText}>{user.email ?? "Signed in"}</span>
        <span className={styles.signOut}>Sign Out</span>
      </span>
    </button>
  ) : (
    <Link className={className} href="/login">
      <CircleUserRound className={styles.icon} aria-hidden="true" />
      Sign in
    </Link>
  );
}
