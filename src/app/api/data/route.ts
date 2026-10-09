import { sameOrigin } from "@/lib/same-origin";
import { serverClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const client = await serverClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user)
      return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const body = await request.json();
    if (!Array.isArray(body.reads) || !Array.isArray(body.writes))
      return Response.json({ error: "Invalid transaction." }, { status: 400 });
    const { error } = await client.rpc("commit_records", body);
    if (error)
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.code === "40001" ? 409 : 403 },
      );
    return Response.json({ success: true });
  } catch {
    return Response.json(
      { error: "Unable to save your changes." },
      { status: 500 },
    );
  }
}
