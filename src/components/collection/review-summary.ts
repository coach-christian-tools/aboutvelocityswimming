import type { Json } from "@/lib/supabase/database.types";
import { formatSwimTime } from "@/features/swim-resources/lib/domain/swim-time";

export type ReviewWrite = { path: string; after: Json };
export type ReviewRead = { path: string; before: Json };
export function object(value: Json | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
export function athleteName(value: Json | undefined): string {
  const name = object(value).name;
  if (typeof name === "string") return name;
  const parts = object(name);
  return [parts.first, parts.last].filter(part => typeof part === "string" && part).join(" ");
}
export function athleteProfiles(writes: ReviewWrite[], reads: ReviewRead[], current: Record<string, Json>, proposed: boolean) {
  const profiles = { ...current };
  for (const read of reads) if (read.path.startsWith("athletes/") && read.before) profiles[read.path.slice(9)] = read.before;
  if (proposed) for (const write of writes) if (write.path.startsWith("athletes/") && write.after) profiles[write.path.slice(9)] = write.after;
  return profiles;
}
export function raceSummary(value: Json, profiles: Record<string, Json>) {
  const race = object(value);
  const id = typeof race.athleteId === "string" ? race.athleteId : "";
  const strokes: Record<string, string> = { FR: "Freestyle", FREE: "Freestyle", BK: "Backstroke", BACK: "Backstroke", BR: "Breaststroke", BREAST: "Breaststroke", FL: "Butterfly", FLY: "Butterfly", IM: "IM" };
  const stroke = typeof race.stroke === "string" ? strokes[race.stroke] ?? race.stroke : "Unknown stroke";
  const status = typeof race.status === "string" ? race.status : "Unknown status";
  const meet = object(race.meet);
  return {
    swimmer: athleteName(profiles[id]) || (id ? `Name unavailable (${id})` : "Missing athlete link"),
    event: `${typeof race.distance === "number" ? race.distance : "?"} ${stroke}${race.isRelay === true ? " relay" : ""}`,
    time: status !== "OK" ? status : formatSwimTime(typeof race.timeMs === "number" ? race.timeMs : null, "No time"),
    course: typeof race.course === "string" ? race.course : "Unknown course",
    meet: typeof meet.name === "string" ? meet.name : "Unknown meet",
    date: typeof meet.date === "string" ? meet.date : "",
  };
}
