import type { Database, Json } from "@/lib/supabase/database.types";
export type WikiEntry = Database["public"]["Tables"]["knowledge_entries"]["Row"];
export function field(data: Json, key: string): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  return typeof data[key] === "string" ? data[key] : "";
}
export function webUrl(value: string): string | undefined {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
export function originalSource(entry: WikiEntry): string | undefined {
  return (entry.kind === "team" ? webUrl(field(entry.data, "website")) : undefined) ?? webUrl(entry.source_url);
}
export function reviewedDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
}
