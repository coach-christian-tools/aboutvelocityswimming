"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useAuth } from "@/features/workshare/contexts/auth";
import { getAvailableTools } from "@/lib/tool-directory";

export default function ToolsDirectory() {
  const { isAdmin } = useAuth();

  return (
    <main className="mx-auto w-full max-w-6xl p-5 pb-16 sm:p-8 lg:p-12">
      <header className="mb-8 max-w-xl">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Velocity Tools</h1>
        <p className="mt-3 text-text-secondary">Use the sidebar to browse each tool’s pages, or open a tool below.</p>
      </header>
      <ul className="grid gap-4 lg:grid-cols-2">
        {getAvailableTools(isAdmin).map(([id, { href, title, description, icon: Icon }]) => (
          <li key={id}>
            <Link href={href} className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-accent hover:bg-hover-bg sm:p-6">
              <div className="flex items-center justify-between text-accent">
                <Icon className="size-6" aria-hidden="true" />
                <ArrowUpRight className="size-4 text-text-secondary group-hover:text-accent" aria-hidden="true" />
              </div>
              <h2 className="text-xl font-bold">{title}</h2>
              <p className="text-sm leading-relaxed text-text-secondary">{description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
