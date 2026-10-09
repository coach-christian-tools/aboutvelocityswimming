"use client";
import Link from "next/link";
import { useAuth } from "@/features/workshare/contexts/auth";
import ThemeToggle from "@/features/swim-resources/components/ThemeToggle";
export default function SiteAccount() {
  const { user, isAdmin, loading, logout } = useAuth();
  return (
    <div
      className="fixed bottom-3 right-3 z-50 flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-2 shadow-sm text-sm"
      aria-label="Account and appearance"
    >
      <ThemeToggle singleIcon />
      {!loading &&
        (user ? (
          <>
            <Link
              href={
                isAdmin ? "/tools/swim-resources/admin" : "/tools/workshare"
              }
            >
              {isAdmin ? "Staff tools" : "My family"}
            </Link>
            <button onClick={() => void logout()}>Sign out</button>
          </>
        ) : (
          <Link href="/login">Sign in</Link>
        ))}
    </div>
  );
}
