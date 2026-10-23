import { baselineCollections } from "@/lib/collection/race-baseline";
import { serverClient } from "@/lib/supabase/server";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(request: Request) {
  const client = await serverClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return Response.json({ error: "Sign in to export a private race baseline." }, { status: 401, headers });
  const { data: staff, error: staffError } = await client.rpc("is_staff");
  if (staffError || !staff) return Response.json({ error: "Verified staff access is required." }, { status: 403, headers });
  const params = new URL(request.url).searchParams;
  const collection = params.get("collection") ?? undefined;
  const revision = params.get("revision") ?? undefined;
  const after = params.get("after") ?? undefined;
  const size = Number(params.get("size") ?? 100);
  if ((collection && !baselineCollections.includes(collection as typeof baselineCollections[number]))
    || (revision !== undefined && !/^\d{1,19}$/.test(revision)) || (collection && revision === undefined)
    || (after && after.length > 1200) || !Number.isInteger(size) || size < 1 || size > 500)
    return Response.json({ error: "Invalid private baseline page." }, { status: 400, headers });
  const { data, error } = await client.rpc("private_race_baseline_page", {
    collection_name: collection, after_id: after, page_size: size, expected_revision: revision,
  });
  if (error) return Response.json({ error: error.code === "40001"
    ? "Data changed during export. Discard these pages and start again."
    : error.code === "54000" ? "This page is too large. Use a smaller page size."
    : "Private baseline export is unavailable. No complete file was created." },
  { status: error.code === "40001" ? 409 : error.code === "54000" ? 413 : 503, headers });
  const endpoint = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const project = ["localhost", "127.0.0.1"].includes(endpoint.hostname)
    ? "local:aboutvelocityswimming" : endpoint.hostname.split(".")[0];
  return Response.json({ ...(data as object), project }, { headers });
}
