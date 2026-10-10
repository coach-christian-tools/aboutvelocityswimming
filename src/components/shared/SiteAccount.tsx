"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/features/workshare/contexts/auth";
import { isStaffRoute } from "@/lib/staff-routes";
import styles from "./SiteAccount.module.css";

export default function SiteAccount() {
  const { user, isAdmin, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const staff = isStaffRoute(usePathname());
  return <>
    {!loading && isAdmin && <Link className={`${styles.pill} ${styles.staff}`} href={staff ? "/" : "/tools/swim-resources/admin/import"}>
      {staff ? "Back to site" : "Staff Tools"}
    </Link>}
    {!loading && <div className={`${styles.pill} ${styles.account}`} aria-label="Account">
      {user ? <div className={styles.menu} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
        <button className={styles.email} aria-expanded={open} aria-controls="account-actions" onClick={() => setOpen(value => !value)} title={user.email ?? "Signed in"}>{user.email ?? "Signed in"}</button>
        <div id="account-actions" className={styles.actions} hidden={!open}><button onClick={() => void logout()}>Sign out</button></div>
      </div> : <Link href="/login">Sign in</Link>}
    </div>}
  </>;
}
