"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, CircleUserRound, Eye, EyeOff, LogOut, Shield, type LucideIcon,
} from "lucide-react";
import { Suspense, useId, useSyncExternalStore, type ReactNode } from "react";
import { timesViewHref } from "@/components/collection/times-url-state";
import { useAuth } from "@/features/workshare/contexts/auth";
import { worksharePath } from "@/features/workshare/lib/routes";
import { getAtlasView, getAvailableTools, getOverviewView, getTimesView, toolDirectory, type TimesView, type ToolId } from "@/lib/tool-directory";
import { getToolPages } from "@/lib/tool-pages";
import ToolSidebar from "./ToolSidebar";
import styles from "./ToolSidebar.module.css";

type Subpage = {
  label: string;
  icon: LucideIcon;
  href: string;
  active: boolean;
};

function routeItem(pathname: string, href: string, label: string, icon: LucideIcon, includeChildren = false): Subpage {
  return { href, label, icon, active: pathname === href || (includeChildren && pathname.startsWith(href + "/")) };
}

function SidebarLink({ label, href, icon: Icon, active }: Subpage) {
  return (
    <Link href={href} className={styles.item} aria-current={active ? "page" : undefined}>
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function ToolsNavigation({ pathname, currentTool }: { pathname: string; currentTool?: ToolId }) {
  const { isAdmin, clientMode } = useAuth();
  const params = useSearchParams();
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash, () => "");
  const sectionId = useId();
  const onTimes = pathname === toolDirectory.times.href;
  const onAtlas = pathname === toolDirectory.atlas.href;
  const timesView = getTimesView(params.get("view"));
  const atlasView = getAtlasView(params.get("view"));
  const timesSearch = onTimes ? params.toString() : "";
  const timesHash = onTimes ? hash : "";
  const workshareAdmin = isAdmin && !clientMode;

  const subpages = currentTool ? getToolPages(currentTool, workshareAdmin).map(page => {
    if (currentTool === "overview") {
      const query = new URLSearchParams(params);
      query.set("view", page.id);
      return { ...page, href: `/tools/overview?${query}`, active: getOverviewView(params.get("view")) === page.id };
    }
    if (currentTool === "times") {
      const active = onTimes && timesView === page.id;
      return { ...page, active, href: active
        ? `${pathname}${timesSearch ? `?${timesSearch}` : ""}${timesHash}`
        : timesViewHref(page.id as TimesView, timesSearch, timesHash) };
    }
    if (currentTool === "atlas") return { ...page, active: onAtlas && atlasView === page.id };
    return routeItem(pathname, page.href, page.label, page.icon, page.includeChildren);
  }) : [];

  return (
    <>
      <SidebarLink {...routeItem(pathname, "/tools", "Account & Tools", CircleUserRound)} />
      <ul className={styles.groups}>
        {getAvailableTools(isAdmin).map(([id, { homeHref, title, icon: Icon }]) => {
          const expanded = currentTool === id;
          const idForPages = `${sectionId}-${id}`;
          return (
            <li key={id}>
              <Link
                href={homeHref}
                className={`${styles.item} ${styles.groupLink}`}
                data-current-tool={expanded}
                aria-current={pathname === homeHref ? "page" : undefined}
                aria-expanded={expanded}
                aria-controls={idForPages}
              >
                <Icon aria-hidden="true" />
                <span>{title}</span>
              </Link>
              <ul id={idForPages} className={styles.subpages} hidden={!expanded}>
                {expanded && subpages.map(page => (
                  <li key={page.label}><SidebarLink {...page} /></li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ToolsAccount({ workshare, pathname }: { workshare: boolean; pathname: string }) {
  const { user, logout, isAdmin, clientMode, setClientMode, setPreviewFamilyId } = useAuth();
  const router = useRouter();
  const PreviewIcon = clientMode ? EyeOff : Eye;
  function toggleClientMode() {
    const family = pathname.match(/\/admin\/families\/([^/]+)/)?.[1];
    setPreviewFamilyId(clientMode ? null : family ?? null);
    setClientMode(!clientMode);
    router.push(worksharePath(clientMode ? "admin/families" : ""));
  }

  return (
    <>
      <div className="mb-2 px-3 text-xs">
        <p className="font-medium text-text-secondary">Logged in as</p>
        <p className="truncate font-semibold text-text-primary">{user?.email}</p>
      </div>
      {workshare && isAdmin && (
        <button type="button" className={styles.item} onClick={toggleClientMode} data-close-tool-drawer>
          <PreviewIcon aria-hidden="true" />
          {clientMode ? "To Admin" : "View Client"}
        </button>
      )}
      <Link href="/" className={`${styles.item} ${styles.footerAction}`}><ArrowLeft aria-hidden="true" />Back to Home</Link>
      <button type="button" className={`${styles.item} ${styles.footerAction}`} onClick={() => void logout()}>
        <LogOut aria-hidden="true" />Sign Out
      </button>
    </>
  );
}

export default function ToolsWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isAdmin, clientMode } = useAuth();
  const currentTool = getAvailableTools(isAdmin).find(([, { href }]) => pathname === href || pathname.startsWith(href + "/"))?.[0]
    ?? (pathname.startsWith("/tools/swim-resources/") ? "times" : undefined);
  const workshare = currentTool === "workshare";

  return (
    <ToolSidebar
      title={currentTool ? toolDirectory[currentTool].title : "Velocity Tools"}
      badge={workshare && isAdmin && !clientMode && (
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#0A856C]/10 px-2.5 py-1 text-xs font-semibold text-accent">
          <Shield className="size-3.5 shrink-0" aria-hidden="true" />Administrator
        </span>
      )}
      navigation={<Suspense fallback={null}><ToolsNavigation pathname={pathname} currentTool={currentTool} /></Suspense>}
      footer={<ToolsAccount workshare={workshare} pathname={pathname} />}
    >
      {children}
    </ToolSidebar>
  );
}
