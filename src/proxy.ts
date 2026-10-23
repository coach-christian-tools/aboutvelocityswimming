import type { Database } from "@/lib/supabase/database.types";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isToolsAdmin, isToolsApi, isToolsPage } from "@/lib/tools-access";
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const toolPage = isToolsPage(request.nextUrl.pathname);
  const toolApi = isToolsApi(request.nextUrl.pathname);
  const restricted = toolPage || toolApi;
  function finish(result: NextResponse) {
    if (restricted) result.headers.set("Cache-Control", "private, no-store");
    return result;
  }
  function deny(status: number) {
    const denied =
      toolPage && status !== 503
        ? NextResponse.redirect(new URL("/login", request.url))
        : NextResponse.json(
            {
              error:
                status === 503
                  ? "Tools are temporarily unavailable."
                  : "Tools are temporarily restricted to the administrator account.",
            },
            { status },
          );
    response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie));
    return finish(denied);
  }
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return restricted ? deny(503) : response;
  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          response.headers.set("Cache-Control", "private, no-store");
        },
      },
    },
  );
  if (restricted) {
    try {
      // Read the current, server-confirmed identity rather than trusting cookie data
      // or user-editable metadata. Prepared imports also support bearer auth.
      const token = toolApi
        ? request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1]
        : undefined;
      const {
        data: { user },
        error,
      } = await client.auth.getUser(token);
      if (error || !user) return deny(401);
      if (
        user.is_anonymous ||
        !isToolsAdmin(user.email, Boolean(user.email_confirmed_at))
      )
        return deny(403);
    } catch {
      return deny(503);
    }
  } else {
    await client.auth.getClaims();
  }
  return finish(response);
}
export const config = {
  matcher: [
    "/tools/:path*",
    "/login",
    "/account",
    "/auth/:path*",
    "/api/data/:path*",
    "/api/workshare/:path*",
    "/api/times/:path*",
    "/api/collection/:path*",
    "/api/swim-resources/:path*",
  ],
};
