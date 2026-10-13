import { beforeEach, describe, expect, it, vi } from "vitest";
import { iesParticipation, parseMeetQueuePatch, parseMeetQueueQuery, type MeetParticipant } from "../../src/lib/collection/meet-queue";
const mocks = vi.hoisted(() => ({ serverClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ serverClient: mocks.serverClient }));
import { GET, PATCH } from "../../src/app/api/collection/meets/route";

const participant = (extra: Partial<MeetParticipant> = {}): MeetParticipant => ({ id: "pn-club", name: "Outside Club", clubCode: "FIX", lscCode: "PN", basis: "recorded", representation: "club", evidence: [{ sourceUrl: "https://example.test/results" }], ...extra });
const patch = { meetId: "meet-one", selected: true, priority: 20, notes: "", blockers: [], updatedAt: null };
function request(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/collection/meets", { method: "PATCH", headers: { origin, host: "localhost:3000", "content-type": "application/json" }, body: JSON.stringify(body) });
}
function client(staff = true, user = true) {
  const rpc = vi.fn().mockImplementation(async (name: string) => name === "is_staff" ? { data: staff, error: null } : { data: { success: true }, error: null });
  return { rpc, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: user ? { id: "fixture" } : null }, error: null }) } };
}
beforeEach(() => vi.clearAllMocks());

describe("meet queue filters and evidence", () => {
  it("exports only selected rows independently of pagination", () => {
    expect(parseMeetQueueQuery(new URLSearchParams("export=1&selected=false&offset=60"))).toMatchObject({ selected: true, offset: 0, export: true });
    expect(parseMeetQueueQuery(new URLSearchParams("search=%25_FIX&year=1988&team=team-one&ies=confirmed&progress=prepared&offset=30"))).toMatchObject({ search: "%_FIX", year: 1988, team: "team-one", ies: "confirmed", progress: "prepared", offset: 30 });
  });
  it("rejects invalid filters and versions", () => {
    for (const value of ["year=1888", "offset=-1", "team=../other", "ies=yes", "category=canceled", "selected=1", "export=all", "progress=done"]) expect(() => parseMeetQueueQuery(new URLSearchParams(value))).toThrow();
    expect(() => parseMeetQueuePatch({ ...patch, updatedAt: undefined })).toThrow(/version/);
    expect(() => parseMeetQueuePatch({ ...patch, priority: 101 })).toThrow(/priority/);
    expect(() => parseMeetQueuePatch({ ...patch, blockers: [""] })).toThrow(/blockers/);
  });
  it("requires reconciliation and resolution of all blockers for completion", () => {
    expect(() => parseMeetQueuePatch({ ...patch, importState: "complete" })).toThrow(/reconciliation/);
    expect(() => parseMeetQueuePatch({ ...patch, importState: "complete", reconciliationNote: "All source rows reconciled", blockers: ["Relay review"] })).toThrow(/blockers/);
    expect(parseMeetQueuePatch({ ...patch, importState: "complete", reconciliationNote: "All source rows reconciled" }).importState).toBe("complete");
  });
  it("does not turn incomplete or unresolved affiliations into no IES participation", () => {
    expect(iesParticipation([], "unknown")).toBe("unknown");
    expect(iesParticipation([], "complete")).toBe("unknown");
    expect(iesParticipation([participant()], "partial")).toBe("unknown");
    expect(iesParticipation([participant()], "complete")).toBe("none");
    expect(iesParticipation([participant({ lscCode: "" })], "complete")).toBe("unknown");
    expect(iesParticipation([participant({ representation: "school" })], "complete")).toBe("unknown");
    expect(iesParticipation([participant({ representation: "school", lscCode: "IE" })], "complete")).toBe("unknown");
    expect(iesParticipation([participant({ representation: "unattached" })], "complete")).toBe("unknown");
    expect(iesParticipation([participant({ lscCode: "IE", basis: "entered" })], "complete")).toBe("unknown");
    expect(iesParticipation([participant({ lscCode: "IE", representation: "unattached" })], "partial")).toBe("confirmed");
  });
});

describe("meet collection route authorization and edits", () => {
  it("requires authenticated staff for reads", async () => {
    mocks.serverClient.mockResolvedValue(client(true, false));
    expect((await GET(new Request("http://localhost:3000/api/collection/meets"))).status).toBe(401);
    const db = client(false); mocks.serverClient.mockResolvedValue(db);
    const response = await GET(new Request("http://localhost:3000/api/collection/meets"));
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "Staff access is required." });
    expect(db.rpc.mock.calls).toEqual([["is_staff"]]);
  });
  it.each(["PGRST202", "PGRST205", "42883", "42P01"])("reports incomplete setup for %s without exposing database details", async (code) => {
    const db = client(); mocks.serverClient.mockResolvedValue(db);
    db.rpc.mockImplementation(async (name: string) => name === "is_staff" ? { data: true, error: null } : { data: null, error: { code, message: "private database message", details: "private database details", hint: "private database hint" } });
    for (const response of [await GET(new Request("http://localhost:3000/api/collection/meets")), await PATCH(request(patch))]) {
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toEqual({ error: "Meet collection setup is incomplete. A site update is required before you can use this queue." });
    }
  });
  it.each(["57014", "PGRST003", "42501"])("keeps %s failures retryable and private", async (code) => {
    const db = client(); mocks.serverClient.mockResolvedValue(db);
    db.rpc.mockImplementation(async (name: string) => name === "is_staff" ? { data: true, error: null } : { data: null, error: { code, message: "private database message", details: "private database details", hint: "private database hint" } });
    const read = await GET(new Request("http://localhost:3000/api/collection/meets"));
    const edit = await PATCH(request(patch));
    for (const response of [read, edit]) {
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(await read.json()).toEqual({ error: "Meet collection could not be loaded. Try again." });
    expect(await edit.json()).toEqual({ error: "Meet changes could not be saved. Try again." });
  });
  it("keeps failed staff checks private and does not query the queue", async () => {
    const db = client(); mocks.serverClient.mockResolvedValue(db);
    db.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "private staff function details" } });
    const response = await GET(new Request("http://localhost:3000/api/collection/meets"));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "Staff access could not be verified. Try again." });
    expect(db.rpc.mock.calls).toEqual([["is_staff"]]);
  });
  it("rejects foreign request origins before checking sessions", async () => {
    expect((await PATCH(request(patch, "https://outside.test"))).status).toBe(403);
    expect(mocks.serverClient).not.toHaveBeenCalled();
  });
  it("passes filters and the precise CAS version through to the database", async () => {
    const db = client(); mocks.serverClient.mockResolvedValue(db);
    const version = "2026-10-13T18:00:00.123456+00:00";
    expect((await PATCH(request({ ...patch, updatedAt: version }))).status).toBe(200);
    expect(db.rpc).toHaveBeenLastCalledWith("update_meet_collection_work", { input: { ...patch, updatedAt: version } });
    const response = await GET(new Request("http://localhost:3000/api/collection/meets?export=1&selected=false&offset=90"));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(db.rpc).toHaveBeenLastCalledWith("meet_collection_queue", { input: expect.objectContaining({ export: true, selected: true, offset: 0 }) });
  });
  it("reports stale edits and oversized exports without silently dropping data", async () => {
    const db = client(); mocks.serverClient.mockResolvedValue(db);
    db.rpc.mockImplementation(async (name: string) => name === "is_staff" ? { data: true, error: null } : { data: null, error: { code: name === "update_meet_collection_work" ? "40001" : "54000", message: "Export exceeds 5,000 meets" } });
    expect((await PATCH(request(patch))).status).toBe(409);
    expect((await GET(new Request("http://localhost:3000/api/collection/meets?export=1"))).status).toBe(413);
  });
});
