"use client";

import Link from "next/link";
import { useAuth } from "@/features/workshare/contexts/auth";
import { getAvailableTools } from "@/lib/tool-directory";
import AccountProfile from "./AccountProfile";

export default function ToolsDirectory() {
  const { isAdmin } = useAuth();

  return (
    <main aria-label="Account & Tools" className="mx-auto w-full max-w-6xl p-5 pb-16 sm:p-8 lg:p-12">
      <section aria-label="Your tools" className="mb-6">
        <ul className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {getAvailableTools(isAdmin).map(
            ([id, { homeHref, title, icon: Icon }]) => (
              <li key={id}>
                <Link
                  href={homeHref}
                  className="flex h-full items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-3 text-sm font-semibold transition-colors hover:border-accent hover:bg-hover-bg"
                >
                  <Icon className="size-4 shrink-0 text-accent" aria-hidden="true" />
                  <span>{title}</span>
                </Link>
              </li>
            ),
          )}
        </ul>
      </section>
      <AccountProfile />
    </main>
  );
}
