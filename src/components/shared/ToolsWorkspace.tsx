"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Briefcase, CalendarDays, ChevronDown, ClipboardList, Download, Eye, EyeOff, Flag,
  Home, LayoutGrid, LogOut, Settings, Shield, Table2, Users, type LucideIcon,
} from "lucide-react";
import { Suspense, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { timesViewHref } from "@/components/collection/times-url-state";
import { useAuth } from "@/features/workshare/contexts/auth";
import { worksharePath } from "@/features/workshare/lib/routes";
import { atlasViews, getAtlasView, getAvailableTools, getTimesView, timesViews, toolDirectory, type ToolId } from "@/lib/tool-directory";
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
  const [disclosure, setDisclosure] = useState<{ currentTool?: ToolId; openTool?: ToolId }>({ currentTool, openTool: currentTool });
  if (disclosure.currentTool !== currentTool) {
    setDisclosure({ currentTool, openTool: currentTool });
  }
  const openTool = disclosure.currentTool === currentTool ? disclosure.openTool : currentTool;
  const onTimes = pathname === toolDirectory.times.href;
  const onAtlas = pathname === toolDirectory.atlas.href;
  const timesView = getTimesView(params.get("view"));
  const atlasView = getAtlasView(params.get("view"));
  const timesSearch = onTimes ? params.toString() : "";
  const timesHash = onTimes ? hash : "";
  const importsHref = toolDirectory.imports.href;
  const workshareAdmin = isAdmin && !clientMode;

  const subpages = {
    times: timesViews.map(([id, label, icon]) => {
      const active = onTimes && timesView === id;
      const href = active
        ? `${pathname}${timesSearch ? `?${timesSearch}` : ""}${timesHash}`
        : timesViewHref(id, timesSearch, timesHash);
      return { href, label, icon, active };
    }),
    workshare: [
      routeItem(pathname, worksharePath(), "Dashboard", Home),
      ...(!workshareAdmin ? [routeItem(pathname, worksharePath("logs"), "Volunteer Logs", ClipboardList)] : []),
      routeItem(pathname, worksharePath("jobs"), "Job Board", Briefcase),
      ...(workshareAdmin ? [
        routeItem(pathname, worksharePath("admin/families"), "Families", Users, true),
        routeItem(pathname, worksharePath("admin/roster"), "Roster", ClipboardList),
        routeItem(pathname, worksharePath("admin/settings"), "Settings", Settings),
      ] : []),
    ],
    atlas: atlasViews.map(([id, label, icon]) => ({
      href: `${toolDirectory.atlas.href}${id === "map" ? "" : `?view=${id}`}`,
      label,
      icon,
      active: onAtlas && atlasView === id,
    })),
    imports: [
      routeItem(pathname, `${importsHref}/swims`, "Swims", Table2),
      routeItem(pathname, `${importsHref}/meet-inventory`, "Meets", CalendarDays),
      routeItem(pathname, importsHref, "Review queue", ClipboardList),
      routeItem(pathname, `${importsHref}/meets`, "Meet collection", CalendarDays),
      routeItem(pathname, `${importsHref}/results`, "Flagged results", Flag),
      routeItem(pathname, `${importsHref}/exports`, "Exports", Download),
    ],
  };

  return (
    <>
      <SidebarLink {...routeItem(pathname, "/tools", "Tools overview", LayoutGrid)} />
      <ul className={styles.groups}>
        {getAvailableTools(isAdmin).map(([id, { title, icon: Icon }]) => {
          const expanded = openTool === id;
          const idForPages = `${sectionId}-${id}`;
          return (
            <li key={id}>
              <button
                type="button"
                className={`${styles.item} ${styles.groupButton}`}
                data-current-tool={currentTool === id}
                aria-expanded={expanded}
                aria-controls={idForPages}
                onClick={() => setDisclosure({ currentTool, openTool: expanded ? undefined : id })}
              >
                <Icon aria-hidden="true" />
                <span>{title}</span>
                <ChevronDown className={styles.chevron} aria-hidden="true" />
              </button>
              <ul id={idForPages} className={styles.subpages} hidden={!expanded}>
                {expanded && subpages[id].map(page => (
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
      <button type="button" className={`${styles.item} ${styles.signOut}`} onClick={() => void logout()}>
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
