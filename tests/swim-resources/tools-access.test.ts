import { readdirSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getClaims: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createClient }));
import { config, proxy } from "@/proxy";
import { isToolsAdmin } from "@/lib/tools-access";

const admin = {
  email: "christiancutter02@gmail.com",
  email_confirmed_at: "2026-10-01T00:00:00Z",
};
function request(path: string, headers?: HeadersInit) {
  return new NextRequest("https://velocity.test" + path, { headers });
}
function toolPages(directory = "src/app"): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(
    (entry): string[] => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return toolPages(path);
      if (entry.name !== "page.tsx") return [];
      const route = path
        .replace(/^src\/app/, "")
        .replace(/\/\([^/]+\)/g, "")
        .replace(/\/page.tsx$/, "")
        .replace(/\[\.\.\.[^\]]+\]/g, "example/nested")
        .replace(/\[[^\]]+\]/g, "example");
      return route === "/tools" || route.startsWith("/tools/") ? [route] : [];
    },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://backend.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
  mocks.createClient.mockReturnValue({
    auth: { getUser: mocks.getUser, getClaims: mocks.getClaims },
  });
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
});

describe("temporary tools lock", () => {
  it.each(toolPages())(
    "blocks signed-out direct access to %s",
    async (path) => {
      expect(
        unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path }),
      ).toBe(true);
      const response = await proxy(request(path));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://velocity.test/login",
      );
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(mocks.getClaims).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      email: "coach@velocity-swimming.com",
      email_confirmed_at: admin.email_confirmed_at,
      app_metadata: { staff: true },
    },
    { ...admin, email_confirmed_at: null },
    { ...admin, is_anonymous: true },
    {
      email: "other@example.test",
      email_confirmed_at: admin.email_confirmed_at,
      user_metadata: { email: admin.email },
    },
  ])(
    "rejects other accounts, unverified identities, and editable metadata: %j",
    async (user) => {
      mocks.getUser.mockResolvedValue({ data: { user }, error: null });
      const response = await proxy(request("/tools/review"));
      expect(response.headers.get("location")).toBe(
        "https://velocity.test/login",
      );
    },
  );

  it("allows only the verified admin and keeps responses private", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: admin }, error: null });
    const response = await proxy(request("/tools/swim-resources/admin/import"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(isToolsAdmin("CHRISTIANCUTTER02@gmail.com", true)).toBe(true);
  });

  it.each([
    "/api/times",
    "/api/times/moderation",
    "/api/collection/meets",
    "/api/collection/review",
    "/api/collection/race-baseline",
    "/api/data",
    "/api/workshare",
    "/api/swim-resources/admin/imports/prepared",
  ])("locks the backing endpoint %s", async (path) => {
    expect(
      unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path }),
    ).toBe(true);
    const response = await proxy(request(path));
    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
    mocks.getUser.mockResolvedValue({
      data: { user: { ...admin, email: "other@example.test" } },
      error: null,
    });
    expect((await proxy(request(path))).status).toBe(403);
  });

  it("validates bearer tokens for prepared imports", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: admin }, error: null });
    const response = await proxy(
      request("/api/swim-resources/admin/imports/prepared", {
        authorization: "Bearer admin-token",
      }),
    );
    expect(mocks.getUser).toHaveBeenCalledWith("admin-token");
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("also locks prefetch and React Server Component requests", async () => {
    const response = await proxy(
      request("/tools/times?_rsc=test", {
        rsc: "1",
        "next-router-prefetch": "1",
      }),
    );
    expect(response.status).toBe(307);
  });

  it("fails closed without configuration or when auth fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect((await proxy(request("/tools"))).status).toBe(503);
    expect(mocks.createClient).not.toHaveBeenCalled();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://backend.test");
    mocks.getUser.mockRejectedValue(new Error("Auth unavailable"));
    expect((await proxy(request("/tools/workshare/guest"))).status).toBe(503);
    mocks.getUser.mockResolvedValue({
      data: { user: admin },
      error: new Error("Invalid session"),
    });
    expect((await proxy(request("/api/times"))).status).toBe(401);
  });

  it("preserves refreshed cookies even when access is denied", async () => {
    mocks.createClient.mockImplementation((_url, _key, options) => {
      options.cookies.setAll([
        {
          name: "session",
          value: "refreshed",
          options: { httpOnly: true, path: "/" },
        },
      ]);
      return { auth: { getUser: mocks.getUser } };
    });
    const response = await proxy(request("/tools"));
    expect(response.cookies.get("session")?.value).toBe("refreshed");
  });

  it.each([
    "/",
    "/schedule",
    "/news",
    "/store",
    "/api/calendar",
    "/api/checkout",
    "/api/webhook",
  ])("keeps the public route outside the lock: %s", (path) => {
    expect(
      unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path }),
    ).toBe(false);
  });

  it.each(["/login", "/auth/callback", "/account"])(
    "keeps auth navigation available: %s",
    async (path) => {
      const response = await proxy(request(path));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(mocks.getUser).not.toHaveBeenCalled();
      expect(mocks.getClaims).toHaveBeenCalled();
    },
  );
});
