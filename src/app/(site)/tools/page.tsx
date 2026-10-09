import type { Metadata } from "next";
import ToolsDirectory from "@/components/shared/ToolsDirectory";





export const metadata: Metadata = {
  title: "Tools | Velocity Swimming",
  description: "Workshare, Swim Resources, and tools for Velocity Swimming families and coaches.",
};

export default function ToolsPage(){return <ToolsDirectory/>;}
