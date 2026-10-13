import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ serverClient: async () => ({ from: mocks.from, rpc: mocks.rpc, auth: { getUser: mocks.getUser } }) }));
vi.mock("@/lib/times/server", () => ({ invalidateTimes: vi.fn() }));
vi.mock("@/lib/same-origin", () => ({ sameOrigin: () => true }));
import { POST } from "@/app/api/collection/review/route";

const request = (decision = "approved") => new Request("https://example.test/api/collection/review", { method: "POST", body: JSON.stringify({ batchId: "batch", decision, note: "" }) });
function queries(athletes: { id: string }[], batchError: unknown = null) {
  mocks.from.mockImplementation((table: string) => ({ select: () => table === "collection_batches"
    ? { eq: () => ({ single: async () => ({ data: batchError ? null : { writes: [{ path: "swims/r", after: { athleteId: "claire", meet: { id: "meet" } } }] }, error: batchError }) }) }
    : { in: async () => ({ data: table === "athletes" ? athletes : [{ id: "meet" }], error: null }) } }));
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "staff" } } });
  mocks.rpc.mockResolvedValue({ error: null });
});
describe("collection approval API", () => {
  it("blocks a separately staged missing athlete before invoking the writer", async () => {
    queries([]);
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("1 swimmer profiles");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("allows approval once prerequisite records exist", async () => {
    queries([{ id: "claire" }]);
    expect((await POST(request())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("review_collection", { batch_id: "batch", decision: "approved", note: "" });
  });
  it("does not expose dependency data when the staff-only batch is inaccessible", async () => {
    queries([], { message: "Not accessible" });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("still allows holding a batch with unresolved dependencies", async () => {
    expect((await POST(request("held"))).status).toBe(200);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("review_collection", { batch_id: "batch", decision: "held", note: "" });
  });
});
