import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import type { serverClient } from "@/lib/supabase/server";

export const swimInventoryPageSize = 50;
export const swimInventoryOptions = {
  kind: [["swims", "Swims"], ["relays", "Relays"]],
  course: [["SCY", "SCY"], ["SCM", "SCM"], ["LCM", "LCM"]],
  status: [["OK", "OK"], ["DQ", "DQ"], ["DFS", "DFS"], ["NS", "NS"]],
  gender: [["F", "F"], ["M", "M"], ["X", "X"]],
  sort: [["id", "Result ID"], ["newest", "Newest first"], ["oldest", "Oldest first"]],
  coverage: [["complete", "Complete"], ["partial", "Partial"], ["unavailable", "Unavailable"], ["unreported", "Unreported"]],
  gap: [
    ["age", "Age not recorded"],
    ["gender", "Gender not recorded"],
    ["official", "Official designation not recorded"],
    ["source", "Source URL not recorded"],
    ["time", "Time not recorded on OK results"],
    ["splits", "Incomplete splits on timed results"],
    ["lineup", "Incomplete relay lineup"],
  ],
} as const;

function date(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : "";
}

export function swimInventoryFilters(params: URLSearchParams) {
  function selected<Key extends keyof typeof swimInventoryOptions>(key: Key) {
    const value = params.get(key);
    return swimInventoryOptions[key].find(([choice]) => choice === value)?.[0] as
      (typeof swimInventoryOptions)[Key][number][0] | undefined;
  }

  const kind = selected("kind") ?? "swims";
  const gap = selected("gap");
  const offset = Number(params.get("offset") ?? 0);
  return {
    kind,
    search: (params.get("search") ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").split(/\s+/).filter(Boolean).slice(0, 8).join(" ").slice(0, 100).trim(),
    meet: (params.get("meet") ?? "").trim().slice(0, 250),
    course: selected("course") ?? "",
    event: (params.get("event") ?? "").trim().slice(0, 24),
    status: selected("status") ?? "",
    gender: selected("gender") ?? "",
    sort: selected("sort") ?? "id",
    from: date(params.get("from")),
    to: date(params.get("to")),
    coverage: selected("coverage") ?? "",
    gap: (kind === "relays" && gap === "age") || (kind === "swims" && gap === "lineup") ? "" : gap ?? "",
    offset: Number.isSafeInteger(offset) && offset >= 0 && offset <= 1_000_000 && offset % swimInventoryPageSize === 0 ? offset : 0,
  };
}

const meetDate = "data->meet->>date";
const meetName = "data->meet->>name";
const gender = "data->>gender";
const age = "data->>ageAtSwim";
const official = "data->>isOfficial";
const splitCoverage = "data->>splitCoverage";
const lineupCoverage = "data->>lineupCoverage";
const sourceUrl = "data->sourceObservation->>url";

const fields = [
  "id", "event_code", "meet_id", "course", "status", "time_ms",
  `date:${meetDate}`, `meet:${meetName}`, `gender:${gender}`, `official:${official}`,
  `split_coverage:${splitCoverage}`, `source_url:${sourceUrl}`,
  "team:data->>teamId", "team_name:data->>teamName", "round:data->>round",
  "source_method:data->metadata->>source", "event_number:data->sourceObservation->>eventNumber",
];

interface SwimInventoryRow {
  id: string;
  date: string | null;
  meet: string | null;
  meet_id: string | null;
  team: string | null;
  team_name: string | null;
  event_code: string;
  course: string;
  round: string | null;
  status: string | null;
  time_ms: number | null;
  gender: string | null;
  official: string | null;
  split_coverage: string | null;
  source_url: string | null;
  source_method: string | null;
  event_number: string | null;
  athlete_id?: string;
  athlete_name?: Json;
  age?: string | null;
  relay_name?: string | null;
  relay_age?: string | null;
  lineup_coverage?: string | null;
}

function literalPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function readSwimInventory(
  client: Awaited<ReturnType<typeof serverClient>>,
  filters: ReturnType<typeof swimInventoryFilters>,
) {
  const relays = filters.kind === "relays";
  const projection = [
    ...fields,
    ...(relays
      ? ["relay_name:data->>relayName", "relay_age:data->>ageGroup", `lineup_coverage:${lineupCoverage}`]
      : ["athlete_id", "athlete_name:data->athleteName", `age:${age}`]),
  ].join(",");
  let request = client.from(relays ? "relay_results" : "swims").select(projection);
  const searchColumns = [
    "id", "meet_id", meetName, "data->>teamName", "data->>teamId",
    ...(relays ? ["data->>relayName"] : ["athlete_id", "data->athleteName->>first", "data->athleteName->>last"]),
  ];
  if (filters.search) {
    for (const term of filters.search.split(" ")) {
      // Quote the escaped substring for PostgREST's logic grammar.
      const pattern = literalPattern(term);
      const clauses = searchColumns.map((column) => `${column}.imatch.${JSON.stringify(pattern)}`);
      // Older snapshots may store the swimmer's full name as a string.
      if (!relays) clauses.push(`data->>athleteName.imatch.${JSON.stringify(`^(?![\\[{]).*${pattern}`)}`);
      request = request.or(clauses.join(","));
    }
  }
  if (filters.meet) request = request.eq("meet_id", filters.meet);
  if (filters.course) request = request.eq("course", filters.course);
  if (filters.event) {
    const event = filters.event.toUpperCase().replace(/\s+/g, "_");
    request = request.filter("event_code", "match", `^${literalPattern(event)}(_|$)`);
  }
  if (filters.status) request = request.eq("status", filters.status);
  if (filters.gender) request = request.eq(gender, filters.gender);
  if (filters.from) request = request.gte(meetDate, filters.from);
  if (filters.to) request = request.lte(meetDate, filters.to);

  if (filters.coverage === "unreported") {
    request = request.or(`${splitCoverage}.is.null,${splitCoverage}.not.in.(complete,partial,unavailable)`);
  } else if (filters.coverage) {
    request = request.eq(splitCoverage, filters.coverage);
  }

  switch (filters.gap) {
    case "age":
      request = request.or(`${age}.is.null,${age}.not.match."^[0-9]{1,3}$"`);
      break;
    case "gender":
      request = request.or(`${gender}.is.null,${gender}.not.in.(F,M,X)`);
      break;
    case "official":
      request = request.or(`${official}.is.null,${official}.not.in.(true,false)`);
      break;
    case "source":
      request = request.or(`${sourceUrl}.is.null,${sourceUrl}.match."^[[:space:]]*$"`);
      break;
    case "time":
      request = request.eq("status", "OK").or("time_ms.is.null,time_ms.lte.0");
      break;
    case "splits":
      request = request.eq("status", "OK").gt("time_ms", 0)
        .or(`${splitCoverage}.is.null,${splitCoverage}.neq.complete`);
      break;
    case "lineup":
      request = request.or(`${lineupCoverage}.is.null,${lineupCoverage}.neq.complete`);
      break;
  }

  if (filters.sort !== "id") request = request.order(meetDate, { ascending: filters.sort === "oldest", nullsFirst: false });

  const { data, error } = await request
    .order("id")
    .range(filters.offset, filters.offset + swimInventoryPageSize)
    .overrideTypes<SwimInventoryRow[], { merge: false }>();

  if (error) {
    console.error("Could not load the swim inventory", { code: error.code });
    return { error: "Swim results could not be loaded. Try again." } as const;
  }

  return { rows: data.slice(0, swimInventoryPageSize), hasMore: data.length > swimInventoryPageSize } as const;
}

export function swimInventoryName(row: SwimInventoryRow) {
  const name = row.athlete_name;
  if (typeof name === "string" && name.trim()) return name.trim();
  if (name && typeof name === "object" && !Array.isArray(name)) {
    const fullName = [name.first, name.last]
      .filter((part): part is string => typeof part === "string" && !!part.trim())
      .join(" ").trim();
    if (fullName) return fullName;
  }
  return row.relay_name || row.athlete_id;
}
