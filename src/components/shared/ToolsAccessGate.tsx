"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/features/workshare/contexts/auth";
import { isToolsAdmin, isToolsPage } from "@/lib/tools-access";

export default function ToolsAccessGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  if (!isToolsPage(pathname)) return children;
  // Also hide already-loaded routes immediately after sign-out or account changes.
  if (loading)
    return (
      <main className="p-12 text-center" role="status">
        Checking your account…
      </main>
    );
  if (!isToolsAdmin(user?.email, user?.emailVerified === true)) {
    return (
      <main className="p-12 text-center space-y-4">
        <h1 className="text-2xl font-semibold">Tools are temporarily locked</h1>
        <p>Access is currently limited to the administrator account.</p>
        <Link href="/login" className="underline">
          Sign in or switch accounts
        </Link>
      </main>
    );
  }
  return children;
}
