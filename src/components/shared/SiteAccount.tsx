"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/features/workshare/contexts/auth";
import { isStaffRoute } from "@/lib/staff-routes";
import styles from "./SiteAccount.module.css";

export default function SiteAccount() {
  const { user, isAdmin, loading, logout } = useAuth();
  const staff = isStaffRoute(usePathname());
  return <>
    {!loading && isAdmin && <Link className={`${styles.pill} ${styles.staff}`} href={staff ? "/tools" : "/tools/swim-resources/admin/import"}>
      {staff ? "Back to site" : "Staff Tools"}
    </Link>}
    {!loading && (user ? <button type="button" className={`${styles.pill} ${styles.account}`} aria-label="Sign Out" onClick={() => void logout()} title={user.email ?? "Signed in"}>
      <span className={styles.email} aria-hidden="true">
        <span className={styles.emailText}>{user.email ?? "Signed in"}</span>
        <span className={styles.signOut}>Sign Out</span>
      </span>
    </button> : <Link className={`${styles.pill} ${styles.account}`} href="/login">Sign in</Link>)}
  </>;
}
