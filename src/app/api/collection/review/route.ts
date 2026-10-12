import { sameOrigin } from "@/lib/same-origin";
import { serverClient } from "@/lib/supabase/server";
import { dependencyTables, reviewDependencies } from "@/components/collection/review-dependencies";
import type { ReviewWrite } from "@/components/collection/review-summary";

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const client = await serverClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user)
    return Response.json(
      { error: "Sign in to review changes." },
      { status: 401 },
    );
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (
    typeof body?.batchId !== "string" ||
    !["approved", "held", "declined"].includes(body?.decision) ||
    typeof body?.note !== "string" ||
    body.note.length > 4000
  ) {
    return Response.json(
      { error: "Choose a valid decision and a note under 4,000 characters." },
      { status: 400 },
    );
  }
  if (body.decision === "approved") {
    const { data: batch, error: batchError } = await client.from("collection_batches").select("writes").eq("id", body.batchId).single();
    if (batchError || !batch || !Array.isArray(batch.writes))
      return Response.json({ error: "This batch is unavailable. Staff access is required." }, { status: 403 });
    const required = reviewDependencies(batch.writes as unknown as ReviewWrite[]);
    const checks = await Promise.all(dependencyTables.map(async table => {
      const ids = [...required[table]];
      if (!ids.length) return { table, missing: 0, error: null };
      const { data, error } = await client.from(table).select("id").in("id", ids);
      const found = new Set((data ?? []).map(row => row.id));
      return { table, missing: ids.filter(id => !found.has(id)).length, error };
    }));
    if (checks.some(check => check.error))
      return Response.json({ error: "Could not verify prerequisite records. Refresh and try again." }, { status: 503 });
    const labels = { teams: "teams", venues: "venues", meets: "meets", athletes: "swimmer profiles" };
    const missing = checks.filter(check => check.missing).map(check => `${check.missing} ${labels[check.table]}`);
    if (missing.length)
      return Response.json({ error: `Approve the prerequisite batches first: ${missing.join(", ")} are not yet in the database. Teams and meets appear at the top of the pending queue, followed by swimmer profiles, then results. No changes were applied.` }, { status: 409 });
  }
  const { error } = await client.rpc("review_collection", {
    batch_id: body.batchId,
    decision: body.decision,
    note: body.note,
  });
  if (error)
    return Response.json(
      { error: error.message },
      { status: ["40001", "23503"].includes(error.code) ? 409 : 403 },
    );
  return Response.json({ success: true });
}
