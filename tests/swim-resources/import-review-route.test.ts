import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), invalidateTimes: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  serverClient: async () => ({ rpc: mocks.rpc, auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/times/server", () => ({ invalidateTimes: mocks.invalidateTimes }));

import { GET, POST } from "@/app/api/collection/imports/route";

const selectionId = "a2a77c1d-5bde-4fa5-9d63-e0f678bd0b6e";
const rowId = "3b2b6ce5-e93b-4c56-9107-ad6d746d820f";
const matchVersion = "0123456789abcdef".repeat(4);
const endpoint = "https://example.test/api/collection/imports";
const post = (body: object, origin = "https://example.test") => new Request(endpoint, {
  method: "POST",
  headers: { origin, host: "example.test" },
  body: JSON.stringify(body),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "staff" } }, error: null });
  mocks.rpc.mockResolvedValue({ data: {}, error: null });
});

describe("Velocity Imports review API", () => {
  it("serves a private, paginated queue with snapshot membership", async () => {
    const response = await GET(new Request(`${endpoint}?kind=swims&search=free&offset=30&selectionId=${selectionId}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("velocity_import_queue", {
      input: { kind: "swims", search: "free", offset: 30, selectionIds: [selectionId], onlySelected: false },
    });
  });

  it("freezes only validated filters, snapshot IDs and exclusions", async () => {
    const response = await POST(post({ action: "selection", selectionIds: [selectionId], excludeIds: [rowId] }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("velocity_import_selection", {
      input: { ids: [], matches: [], selectionIds: [selectionId], excludeIds: [rowId] },
    });
    expect(mocks.invalidateTimes).not.toHaveBeenCalled();
  });

  it("continues a large preview with its original snapshot ID", async () => {
    const response = await POST(post({ action: "selection", prepareSelectionId: selectionId }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("velocity_import_selection", { input: { prepareSelectionId: selectionId } });
  });

  it("rejects cross-origin writes and invalid selection IDs", async () => {
    expect((await POST(post({ action: "approve", selectionId }, "https://elsewhere.test"))).status).toBe(403);
    expect((await POST(post({ action: "approve", selectionId: "wrong" }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires a signed-in user and handles the database staff check", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await GET(new Request(`${endpoint}?id=${rowId}`))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ error: { code: "42501" } });
    expect((await GET(new Request(`${endpoint}?id=${rowId}`))).status).toBe(403);
  });

  it("looks up private swimmer matches for a staged row", async () => {
    const response = await GET(new Request(`${endpoint}?swimmerMatch=${rowId}&search=Swimmer`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("velocity_import_swimmer_matches", {
      input: { id: rowId, search: "Swimmer" },
    });
  });

  it("saves a verified swimmer match without invalidating published results", async () => {
    const input = { id: rowId, athleteId: "swimmer-123", reason: "Verified against the source archive.", matchVersion };
    const receipt = { updated: 1, rowIds: [rowId] };
    mocks.rpc.mockResolvedValueOnce({ data: receipt, error: null });
    const response = await POST(post({ action: "resolveSwimmerMatch", ...input }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(receipt);
    expect(mocks.rpc).toHaveBeenCalledWith("resolve_velocity_import_swimmer", { input });
    expect(mocks.invalidateTimes).not.toHaveBeenCalled();
  });

  it("validates swimmer match inputs before calling the database", async () => {
    const input = { action: "resolveSwimmerMatch", id: rowId, athleteId: "swimmer-123", reason: "Checked source evidence.", matchVersion };
    expect((await GET(new Request(`${endpoint}?swimmerMatch=wrong`))).status).toBe(400);
    expect((await POST(post({ ...input, athleteId: "wrong/id" }))).status).toBe(400);
    expect((await POST(post({ ...input, reason: " " }))).status).toBe(400);
    expect((await POST(post({ ...input, matchVersion: "old" }))).status).toBe(400);
    expect((await POST(post(input, "https://elsewhere.test"))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires a fresh review when the affected swims have changed", async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { code: "PT409" } });
    const response = await POST(post({
      action: "resolveSwimmerMatch", id: rowId, athleteId: "swimmer-123", reason: "Checked source evidence.", matchVersion,
    }));
    expect(response.status).toBe(409);
    expect(mocks.invalidateTimes).not.toHaveBeenCalled();
  });

  it("invalidates Times and Archive after publication, including a confirmed retry", async () => {
    const data = { selected: 1, approved: 1, duplicates: 0, blocked: 0, remaining: 0, done: true, published: 0 };
    mocks.rpc.mockResolvedValueOnce({ data, error: null });
    mocks.invalidateTimes.mockImplementationOnce(() => { throw new Error("cache unavailable"); });
    const response = await POST(post({ action: "approve", selectionId }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(data);
    expect(mocks.rpc).toHaveBeenCalledWith("approve_velocity_import", { selection_id: selectionId });
    expect(mocks.invalidateTimes).toHaveBeenCalledOnce();
  });
});
