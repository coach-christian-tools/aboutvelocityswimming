import { sameOrigin } from "@/lib/same-origin";
import { serverClient } from "@/lib/supabase/server";

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
  const { error } = await client.rpc("review_collection", {
    batch_id: body.batchId,
    decision: body.decision,
    note: body.note,
  });
  if (error)
    return Response.json(
      { error: error.message },
      { status: error.code === "40001" ? 409 : 403 },
    );
  return Response.json({ success: true });
}
