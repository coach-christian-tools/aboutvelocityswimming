import { sameOrigin } from "@/lib/same-origin";
import { serverClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const { operation, input } = await request.json();
    const client = await serverClient();
    const { data, error } = await client.rpc("workshare_action", {
      operation,
      input,
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ data });
  } catch {
    return Response.json(
      { error: "Unable to process your request." },
      { status: 500 },
    );
  }
}
