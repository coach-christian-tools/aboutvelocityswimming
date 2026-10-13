import { beforeEach, expect, it, vi } from "vitest";
const readTimes = vi.hoisted(() => vi.fn());
vi.mock("@/lib/times/server", () => ({ readTimes }));
import { GET } from "@/app/api/times/route";
const request = (query: string) =>
  new Request("https://example.test/api/times?" + query);
beforeEach(() => vi.resetAllMocks());
it("rejects invalid input before querying and returns only the public read result", async () => {
  expect((await GET(request("view=rankings&limit=50000"))).status).toBe(400);
  expect(readTimes).not.toHaveBeenCalled();
  readTimes.mockResolvedValue({ rows: [], total: 0, expiresAt: 180000 });
  const response = await GET(
    request("view=rankings&genders=M,F&unused=private"),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(readTimes).toHaveBeenCalledWith("rankings", {
    genders: ["F", "M"],
    mode: "bests",
    offset: 0,
    limit: 25,
  });
  expect(await response.json()).toEqual({
    rows: [],
    total: 0,
    expiresAt: 180000,
  });
});
it("failed queries have no HTTP cache and are retryable", async () => {
  readTimes.mockRejectedValueOnce(new Error("private diagnostic"));
  const failure = await GET(request("view=facets"));
  expect(failure.status).toBe(503);
  expect(failure.headers.get("cache-control")).toBe("no-store");
  expect(JSON.stringify(await failure.json())).not.toContain(
    "private diagnostic",
  );
  readTimes.mockResolvedValueOnce({ teams: [], expiresAt: 180000 });
  expect((await GET(request("view=facets"))).status).toBe(200);
});
