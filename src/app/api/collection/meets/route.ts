import { parseMeetQueuePatch, parseMeetQueueQuery } from "@/lib/collection/meet-queue";
import { sameOrigin } from "@/lib/same-origin";
import { serverClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

const headers = { "Cache-Control": "private, no-store" };
const setupErrorCodes = new Set(["PGRST202", "PGRST205", "42883", "42P01"]);
const setupError = "Meet collection setup is incomplete. A site update is required before you can use this queue.";
async function staffClient() {
  const client = await serverClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { denied: Response.json({ error: "Sign in to manage meet collection." }, { status: 401, headers }) };
  const { data: staff, error: staffError } = await client.rpc("is_staff");
  if (staffError) return { denied: Response.json({ error: "Staff access could not be verified. Try again." }, { status: 503, headers }) };
  if (!staff) return { denied: Response.json({ error: "Staff access is required." }, { status: 403, headers }) };
  return { client };
}

export async function GET(request: Request) {
  const authorized = await staffClient();
  if (authorized.denied) return authorized.denied;
  let query;
  try { query = parseMeetQueueQuery(new URL(request.url).searchParams); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid filters." }, { status: 400, headers }); }
  const { data, error } = await authorized.client.rpc("meet_collection_queue", { input: query as unknown as Json });
  if (error) return Response.json({ error: setupErrorCodes.has(error.code) ? setupError : error.code === "54000" ? error.message : "Meet collection could not be loaded. Try again." }, { status: error.code === "54000" ? 413 : 503, headers });
  return Response.json(data, { headers });
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403, headers });
  const authorized = await staffClient();
  if (authorized.denied) return authorized.denied;
  if (Number(request.headers.get("content-length")) > 24000) return Response.json({ error: "Meet update is too large." }, { status: 413, headers });
  let patch;
  try { patch = parseMeetQueuePatch(await request.json()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid meet update." }, { status: 400, headers }); }
  const { data, error } = await authorized.client.rpc("update_meet_collection_work", { input: patch as unknown as Json });
  if (error) return Response.json({ error: setupErrorCodes.has(error.code) ? setupError : error.code === "40001" ? "This meet changed after you opened it. Refresh before saving." : error.code === "23514" || error.code === "22023" ? error.message : error.code === "P0002" ? "This meet is no longer available." : "Meet changes could not be saved. Try again." }, { status: error.code === "40001" ? 409 : error.code === "P0002" ? 404 : ["23514", "22023"].includes(error.code) ? 400 : 503, headers });
  return Response.json(data, { headers });
}
