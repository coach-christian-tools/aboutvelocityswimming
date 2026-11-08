import type { ReactNode } from "react";
import { Briefcase, ClipboardList, Eye, EyeOff, Home, LogOut, Settings, Shield, Users } from "lucide-react";
import ToolSidebar, { ToolSidebarItem } from "@/components/shared/ToolSidebar";
import { useLocation, useNavigate } from "@/features/workshare/lib/navigation";
import { worksharePath } from "@/features/workshare/lib/routes";
import { useAuth } from "../../contexts/auth";

export function MainLayout({ children, isAdmin = false }: { children: ReactNode; isAdmin?: boolean }) {
  const { user, logout, isAdmin: authIsAdmin, clientMode, setClientMode, setPreviewFamilyId } = useAuth();
  const canPreview = isAdmin || authIsAdmin;
  const effectiveIsAdmin = canPreview && !clientMode;
  const { pathname } = useLocation();
  const navigate = useNavigate();

  function toggleClientMode() {
    if (clientMode) {
      setClientMode(false);
      setPreviewFamilyId(null);
      navigate("/admin/families");
    } else {
      const family = pathname.match(/\/admin\/families\/([^/]+)/)?.[1];
      setPreviewFamilyId(family ?? null);
      setClientMode(true);
      navigate("/");
    }
  }

  const navLinks = [
    { to: "", label: "Dashboard", icon: Home },
    ...(!effectiveIsAdmin ? [{ to: "/logs", label: "Volunteer Logs", icon: ClipboardList }] : []),
    { to: "/jobs", label: "Job Board", icon: Briefcase },
    ...(effectiveIsAdmin
      ? [
          { to: "/admin/families", label: "Families", icon: Users },
          { to: "/admin/roster", label: "Roster", icon: ClipboardList },
          { to: "/admin/settings", label: "Settings", icon: Settings },
        ]
      : []),
  ];
  const PreviewIcon = clientMode ? EyeOff : Eye;
  return (
    <ToolSidebar
      tool="workshare"
      navigationLabel="Workshare navigation"
      storageKey="sidebar_collapsed"
      brandHref={worksharePath()}
      badge={effectiveIsAdmin && (
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#0A856C]/10 px-2.5 py-1 text-xs font-semibold text-accent">
          <Shield className="size-3.5 shrink-0" aria-hidden="true" />Administrator
        </span>
      )}
      navigation={navLinks.map(({ to, label, icon }) => (
        <ToolSidebarItem
          key={to}
          href={worksharePath(to)}
          active={to ? pathname === to || pathname.startsWith(to + "/") : pathname === "/"}
          icon={icon}
        >
          {label}
        </ToolSidebarItem>
      ))}
      footer={
        <>
          <div className="mb-2 px-3 text-xs">
            <p className="font-medium text-text-secondary">Logged in as</p>
            <p className="truncate font-semibold text-text-primary">{user?.email?.split("@")[0]}</p>
          </div>
          {canPreview && (
            <button
              type="button"
              onClick={toggleClientMode}
              data-tool-sidebar-item
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-text-primary hover:bg-hover-bg"
            >
              <PreviewIcon className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
              {clientMode ? "To Admin" : "View Client"}
            </button>
          )}
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-500/10"
          >
            <LogOut className="size-4 shrink-0" aria-hidden="true" />Sign Out
          </button>
        </>
      }
    >
      <main className="min-w-0 p-4 pb-20 md:p-8 md:pb-16">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </ToolSidebar>
  );
}
