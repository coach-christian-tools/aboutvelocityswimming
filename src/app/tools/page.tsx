import type { Metadata } from "next";
import ToolsDirectory from "@/components/shared/ToolsDirectory";

export const metadata: Metadata = {
  title: "Account & Tools | Velocity Swimming",
  description: "Manage your Velocity Swimming profile and open Velocity Times, Swim Atlas, and Velocity Workshare.",
};

export default function ToolsPage() {
  return <ToolsDirectory />;
}
