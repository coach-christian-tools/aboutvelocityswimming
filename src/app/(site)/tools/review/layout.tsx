"use client";

import { CalendarDays, ClipboardList, Download, Flag, Table2 } from "lucide-react";
import { useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";
import ToolSidebar, { ToolSidebarItem } from "@/components/shared/ToolSidebar";
import { useAuth } from "@/features/workshare/contexts/auth";
import { toolDirectory } from "@/lib/tool-directory";

export default function ImportsLayout({ children }: { children: ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const { isAdmin, loading } = useAuth();
  const { title, href } = toolDirectory.imports;

  return (
    <ToolSidebar
      tool="imports"
      navigationLabel={`${title} navigation`}
      storageKey="velocity-imports-sidebar"
      navigation={
        <>
          {!loading && isAdmin && (
            <>
              <ToolSidebarItem href={`${href}/swims`} active={segment === "swims"} icon={Table2}>
                Swims
              </ToolSidebarItem>
              <ToolSidebarItem href={`${href}/meet-inventory`} active={segment === "meet-inventory"} icon={CalendarDays}>
                Meets
              </ToolSidebarItem>
            </>
          )}
          <ToolSidebarItem href={href} active={segment === null} icon={ClipboardList}>
            Review queue
          </ToolSidebarItem>
          {!loading && isAdmin && (
            <>
              <ToolSidebarItem href={`${href}/meets`} active={segment === "meets"} icon={CalendarDays}>
                Meet collection
              </ToolSidebarItem>
              <ToolSidebarItem href={`${href}/results`} active={segment === "results"} icon={Flag}>
                Flagged results
              </ToolSidebarItem>
              <ToolSidebarItem href={`${href}/exports`} active={segment === "exports"} icon={Download}>
                Exports
              </ToolSidebarItem>
            </>
          )}
        </>
      }
    >
      {children}
    </ToolSidebar>
  );
}
