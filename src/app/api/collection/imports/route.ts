import { requestDiagnostics } from "@/lib/request-diagnostics";
import { sameOrigin } from "@/lib/same-origin";
import type { Json } from "@/lib/supabase/database.types";
import { serverClient } from "@/lib/supabase/server";
import { invalidateTimes } from "@/lib/times/server";

const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const recordIdPattern = /^[a-zA-Z0-9_-]{1,180}$/;
const matchVersionPattern = /^[a-f0-9]{64}$/;

function uuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function ids(value: unknown, limit: number): value is string[] | undefined {
  return value === undefined || (Array.isArray(value) && value.length <= limit && value.every(uuid));
}

function filters(value: unknown) {
  if (!object(value)) return null;
  const { kind, search = "", batchId } = value;
  if (kind !== "meets" && kind !== "swims") return null;
  if (typeof search !== "string" || search.length > 200) return null;
  if (batchId !== undefined && !uuid(batchId)) return null;
  return { kind, search: search.trim(), ...(batchId ? { batchId } : {}) };
}

type Operation =
  | {
    name: "velocity_import_queue" | "velocity_import_detail" | "velocity_import_selection"
      | "velocity_import_swimmer_matches" | "resolve_velocity_import_swimmer";
    input: Json;
  }
  | { name: "approve_velocity_import"; selectionId: string };

function readOperation(params: URLSearchParams): Operation | null {
  if (params.has("swimmerMatch")) {
    const id = params.get("swimmerMatch");
    const search = (params.get("search") ?? "").trim();
    return uuid(id) && search.length <= 200
      ? { name: "velocity_import_swimmer_matches", input: { id, search } }
      : null;
  }
  if (params.has("id")) {
    const id = params.get("id");
    return uuid(id) ? { name: "velocity_import_detail", input: { id } } : null;
  }
  const rawOffset = params.get("offset") ?? "0";
  if (!/^\d{1,7}$/.test(rawOffset)) return null;
  const offset = Number(rawOffset);
  if (params.has("section")) {
    const section = params.get("section");
    const selectionId = params.get("selectionId");
    if ((section !== "prerequisites" && section !== "blockers") || !uuid(selectionId)) return null;
    return { name: "velocity_import_detail", input: { selectionId, section, offset } };
  }
  const match = filters({
    kind: params.get("kind"),
    search: params.get("search") ?? "",
    batchId: params.get("batchId") || undefined,
  });
  const selectionIds = params.getAll("selectionId");
  if (!match || !ids(selectionIds, 2)) return null;
  const onlySelected = params.get("onlySelected") === "true";
  return { name: "velocity_import_queue", input: { ...match, offset, selectionIds, onlySelected } };
}

function writeOperation(body: unknown): Operation | null {
  if (!object(body)) return null;
  if (body.action === "approve" && uuid(body.selectionId))
    return { name: "approve_velocity_import", selectionId: body.selectionId };
  if (body.action === "resolveSwimmerMatch") {
    const { id, athleteId, reason, matchVersion } = body;
    if (!uuid(id) || typeof athleteId !== "string" || !recordIdPattern.test(athleteId)
      || typeof reason !== "string" || typeof matchVersion !== "string" || !matchVersionPattern.test(matchVersion)) return null;
    const note = reason.trim();
    return note.length > 0 && note.length <= 1000
      ? { name: "resolve_velocity_import_swimmer", input: { id, athleteId, reason: note, matchVersion } }
      : null;
  }
  if (body.action !== "selection") return null;
  if (body.prepareSelectionId !== undefined) {
    return uuid(body.prepareSelectionId)
      ? { name: "velocity_import_selection", input: { prepareSelectionId: body.prepareSelectionId } }
      : null;
  }

  const { ids: selected, matches = [], selectionIds, excludeIds, preview } = body;
  if (!ids(selected, 5000) || !ids(excludeIds, 5000) || !ids(selectionIds, 2)) return null;
  if (preview !== undefined && typeof preview !== "boolean") return null;
  if (!Array.isArray(matches) || matches.length > 2) return null;
  const queries = matches.map(filters);
  if (!queries.every((query) => query !== null)) return null;
  return {
    name: "velocity_import_selection",
    input: {
      ids: selected ?? [], matches: queries, selectionIds: selectionIds ?? [], excludeIds: excludeIds ?? [],
      ...(preview === undefined ? {} : { preview }),
    },
  };
}

async function run(
  diagnostic: ReturnType<typeof requestDiagnostics>,
  operation: Operation | null,
) {
  const respond = diagnostic.response;
  if (!operation) return respond({ error: "Invalid import review request." }, 400);
  try {
    const client = await serverClient();
    const { data: { user }, error: authError } = await diagnostic.step("auth", () => client.auth.getUser());
    if (authError) diagnostic.failure("auth", authError);
    if (!user) return respond({ error: "Sign in to review imports." }, 401);

    const { data, error } = await diagnostic.step(operation.name, () =>
      operation.name === "approve_velocity_import"
        ? client.rpc(operation.name, { selection_id: operation.selectionId })
        : client.rpc(operation.name, { input: operation.input }),
    );
    if (error) {
      diagnostic.failure(operation.name, error);
      switch (error.code) {
        case "42501": return respond({ error: "Staff access is required." }, 403);
        case "22023": case "22P02": return respond({ error: "Invalid import review request." }, 400);
        case "P0002": case "PT404": return respond({ error: "This import or selection is unavailable." }, 404);
        case "PT409": return respond({
          error: operation.name === "resolve_velocity_import_swimmer" || operation.name === "velocity_import_swimmer_matches"
            ? "This swimmer match has changed or conflicts with an existing identity. Refresh the queue and review the match again."
            : "This selection changed. Review the current rows and try again.",
        }, 409);
        default: return respond({ error: "The import request could not be confirmed. Try again." }, 503);
      }
    }
    if (!object(data)) return respond({ error: "The import request returned no data." }, 503);

    // Cumulative approval counts also expire stale results when a response was lost after commit.
    if (operation.name === "approve_velocity_import" && typeof data.approved === "number" && data.approved > 0) {
      try {
        invalidateTimes();
      } catch (error) {
        diagnostic.failure("invalidate-times", error);
      }
    }
    return respond(data);
  } catch (error) {
    diagnostic.failure("unexpected", error);
    return respond({ error: "The import request could not be confirmed. Try again." }, 503);
  }
}

export async function GET(request: Request) {
  return run(requestDiagnostics("collection-imports", request), readOperation(new URL(request.url).searchParams));
}

export async function POST(request: Request) {
  const diagnostic = requestDiagnostics("collection-imports", request);
  if (!sameOrigin(request)) return diagnostic.response({ error: "Invalid request origin." }, 403);
  const body: unknown = await request.json().catch(() => null);
  return run(diagnostic, writeOperation(body));
}
