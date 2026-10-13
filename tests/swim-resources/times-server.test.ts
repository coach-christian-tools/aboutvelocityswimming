import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  client: vi.fn(),
  cache: new Map<string, unknown>(),
  revalidate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({
  unstable_cache:
    (reader: (...args: unknown[]) => Promise<unknown>) =>
    async (...args: unknown[]) => {
      const key = JSON.stringify(args);
      if (!mocks.cache.has(key)) mocks.cache.set(key, await reader(...args));
      return mocks.cache.get(key);
    },
  revalidateTag: mocks.revalidate,
}));
import { readTimes, invalidateTimes } from "@/lib/times/server";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cache.clear();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://public-fixture.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
  mocks.client.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: { rows: [], total: 0 }, error: null });
  vi.spyOn(Date, "now").mockReturnValue(120001);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("uses a stateless public client and expires reads at the minute boundary", async () => {
  const first = await readTimes("rankings", { genders: ["F"] });
  expect(first.expiresAt).toBe(180000);
  await readTimes("rankings", { genders: ["F"] });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.client.mock.calls[0][2].auth).toEqual({
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  });
  vi.mocked(Date.now).mockReturnValue(180000);
  await readTimes("rankings", { genders: ["F"] });
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://another-fixture.supabase.co");
  await readTimes("rankings", { genders: ["F"] });
  expect(mocks.rpc).toHaveBeenCalledTimes(3);
  invalidateTimes();
  expect(mocks.revalidate).toHaveBeenCalledWith("ies-times", { expire: 0 });
});
it("does not save failed reads in the cache", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "57014" } });
  await expect(readTimes("facets", {})).rejects.toThrow();
  expect(mocks.cache.size).toBe(0);
  await readTimes("facets", {});
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});
it("shares the scored cohort cache across athlete searches and list pages", async () => {
  const athletes = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    name: "Athlete " + i,
    rank: i + 1,
    status: "ranked",
  }));
  mocks.rpc.mockResolvedValue({
    data: {
      groups: [{ ageGroup: "11-12", gender: "F", label: "11–12", athletes }],
    },
    error: null,
  });
  const base = { team: "fixture", course: "SCY", period: "recent" };
  const first = await readTimes("athletes", base);
  expect(first.groups?.[0].athletes).toHaveLength(25);
  const second = await readTimes("athletes", { ...base, offset: 25 });
  expect(second.groups?.[0].athletes[0].rank).toBe(26);
  const searched = await readTimes("athletes", {
    ...base,
    search: "Athlete 29",
  });
  expect(searched.groups?.[0].athletes[0].rank).toBe(30);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
