"use client";

import Link from "next/link";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { useAuth } from "@/features/workshare/contexts/auth";
import { toolDirectory, type ToolId } from "@/lib/tool-directory";
import { getToolPages } from "@/lib/tool-pages";

export default function ToolHome({ tool }: { tool: ToolId }) {
  const { isAdmin, clientMode } = useAuth();
  const { title, description, icon: Icon } = toolDirectory[tool];
  const pages = getToolPages(tool, isAdmin && !clientMode);

  return (
    <main className="mx-auto w-full max-w-6xl p-5 pb-16 sm:p-8 lg:p-12">
      <Link
        href="/tools"
        className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-accent"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All tools
      </Link>
      <header className="mb-10 max-w-2xl">
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-hover-bg text-accent">
          <Icon className="size-6" aria-hidden="true" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 leading-relaxed text-text-secondary">
          {description}
        </p>
      </header>
      <section aria-labelledby="tool-pages-heading">
        <h2 id="tool-pages-heading" className="mb-4 text-lg font-semibold">
          Explore {title}
        </h2>
        <ul className="grid gap-4 lg:grid-cols-2">
          {pages.map(({ id, label, description, href, icon: PageIcon }) => (
            <li key={id}>
              <Link
                href={href}
                className="group flex h-full flex-col rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-accent hover:bg-hover-bg sm:p-6"
              >
                <div className="mb-4 flex items-center justify-between text-accent">
                  <PageIcon className="size-6" aria-hidden="true" />
                  <ArrowRight
                    className="size-4 text-text-secondary group-hover:text-accent"
                    aria-hidden="true"
                  />
                </div>
                <h3 className="text-xl font-bold">{label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  {description}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
