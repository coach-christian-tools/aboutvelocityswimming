import type { ReactNode } from "react";
import ToolsWorkspace from "@/components/shared/ToolsWorkspace";

export default function ToolsLayout({ children }: { children: ReactNode }) {
  return <ToolsWorkspace>{children}</ToolsWorkspace>;
}
