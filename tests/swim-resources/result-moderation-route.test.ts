import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  serverClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  }),
}));
vi.mock("@/lib/times/server", () => ({ invalidateTimes: mocks.invalidate }));
import { GET, POST } from "@/app/api/times/moderation/route";
const valid = {
  resultType: "swim",
  resultId: "example",
  action: "flag",
  reason: "incorrect_time",
  note: "",
  expectedVersion: 0,
};
function post(body: unknown, origin = "https://example.test") {
  return new Request("https://example.test/api/times/moderation", {
    method: "POST",
    headers: {
      host: "example.test",
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "staff" } },
    error: null,
  });
  mocks.rpc.mockImplementation(async (name: string) =>
    name === "is_staff"
      ? { data: true, error: null }
      : { data: { flagged: true, version: 1 }, error: null },
  );
});
it("checks origin and staff on writes and private reads", async () => {
  expect((await POST(post(valid, "https://attacker.test"))).status).toBe(403);
  expect(mocks.getUser).not.toHaveBeenCalled();
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  expect((await POST(post(valid))).status).toBe(401);
  expect(
    (await GET(new Request("https://example.test/api/times/moderation")))
      .status,
  ).toBe(401);
  mocks.getUser.mockResolvedValue({ data: { user: { id: "nonstaff" } } });
  mocks.rpc.mockResolvedValue({ data: false });
  expect((await POST(post(valid))).status).toBe(403);
  expect(
    (await GET(new Request("https://example.test/api/times/moderation")))
      .status,
  ).toBe(403);
  expect(mocks.invalidate).not.toHaveBeenCalled();
});
it("validates reasons, restoration explanations and optimistic version before writes", async () => {
  for (const body of [
    null,
    { ...valid, reason: "unknown" },
    { ...valid, reason: "other", note: "  " },
    { ...valid, action: "restore" },
    { ...valid, expectedVersion: -1 },
    { ...valid, note: "x".repeat(4001) },
  ]) {
    expect((await POST(post(body))).status).toBe(400);
  }
  expect(mocks.rpc.mock.calls.every(([name]) => name === "is_staff")).toBe(
    true,
  );
});
it("invalidates times only after a committed mutation, and never caches private evidence", async () => {
  const response = await POST(post(valid));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.rpc).toHaveBeenCalledWith("moderate_result", {
    result_type: "swim",
    result_id: "example",
    action: "flag",
    reason: "incorrect_time",
    note: "",
    expected_version: 0,
  });
  expect(mocks.invalidate).toHaveBeenCalledOnce();
  mocks.invalidate.mockClear();
  mocks.rpc.mockImplementation(async (name: string) =>
    name === "is_staff"
      ? { data: true }
      : { error: { code: "40001", message: "private db diagnostic" } },
  );
  const conflict = await POST(post(valid));
  expect(conflict.status).toBe(409);
  expect(JSON.stringify(await conflict.json())).not.toContain(
    "private db diagnostic",
  );
  expect(mocks.invalidate).not.toHaveBeenCalled();
});
it("reads result history or paginated staff queue with no shared cache", async () => {
  const history = await GET(
    new Request(
      "https://example.test/api/times/moderation?resultType=relay&resultId=relay1",
    ),
  );
  expect(history.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.rpc).toHaveBeenCalledWith("read_result_moderation", {
    result_type: "relay",
    result_id: "relay1",
  });
  await GET(
    new Request(
      "https://example.test/api/times/moderation?offset=25&includeRestored=true",
    ),
  );
  expect(mocks.rpc).toHaveBeenCalledWith("list_result_moderation", {
    page_from: 25,
    page_size: 25,
    include_restored: true,
  });
  expect(
    (
      await GET(
        new Request("https://example.test/api/times/moderation?offset=-2"),
      )
    ).status,
  ).toBe(400);
});

it("explains missing database migrations without exposing backend diagnostics", async () => {
  for (const code of ["PGRST202", "42P01", "42883"]) {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "is_staff"
        ? { data: true, error: null }
        : { error: { code, message: "private database diagnostic" } },
    );
    const result = await GET(
      new Request("https://example.test/api/times/moderation"),
    );
    expect(result.status).toBe(503);
    const body = await result.json();
    expect(body.code).toBe("MODERATION_NOT_INSTALLED");
    expect(body.error).toContain("database migration must be applied");
    expect(JSON.stringify(body)).not.toContain("private database diagnostic");
  }
  expect(mocks.invalidate).not.toHaveBeenCalled();
});
