import { notFound } from "next/navigation";
import WorkshareClient from "@/features/workshare/Client";
import { isWorkshareRoute } from "@/features/workshare/lib/routes";

export default async function WorksharePage({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  if (!isWorkshareRoute(path)) notFound();
  return <WorkshareClient />;
}
