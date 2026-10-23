import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
const mocks = vi.hoisted(() => ({ browserClient: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ browserClient: mocks.browserClient }));
import { loadReviewBatches } from "@/components/collection/load-review-batches";
import {
  HISTORY_COLUMNS,
  historySearchFilter,
  loadReviewBatchDetails,
  loadReviewHistory,
} from "@/components/collection/load-review-history";

function header(id: string) {
  return {
    id, division: "times", scope: "Whole-catalog race preparation: 10 validated results",
    source_url: "https://example.test/results.zip", captured_at: "2026-10-15T00:00:00Z",
    received_at: "2026-10-15T00:00:00Z", coverage: "partial", status: "approved",
    review_note: null, reviewed_at: "2026-10-15T00:00:00Z",
  };
}
function backend(handler: (url: URL, init?: RequestInit) => Response) {
  const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
    handler(new URL(String(url)), init));
  const client = createClient<Database>("https://example.test", "synthetic-public-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetcher },
  });
  mocks.browserClient.mockReturnValue(client);
  return fetcher;
}
const ok = (value: unknown) => new Response(JSON.stringify(value), {
  headers: { "Content-Type": "application/json" },
});
beforeEach(() => vi.clearAllMocks());

describe("bounded completed review history", () => {
  it("issues one scalar-only request for20 rows plus one lookahead, never a count or summary", async () => {
    const fetcher = backend((url, init) => {
      expect(url.pathname).toBe("/rest/v1/collection_batches");
      expect(url.searchParams.get("select")).toBe(HISTORY_COLUMNS);
      expect(url.searchParams.get("status")).toBe("eq.approved");
      expect(url.searchParams.get("order")).toBe("received_at.asc,id.asc");
      expect(url.searchParams.get("offset")).toBe("0");
      expect(url.searchParams.get("limit")).toBe("21");
      expect(new Headers(init?.headers).get("Prefer") ?? "").not.toContain("count=");
      expect(HISTORY_COLUMNS).not.toMatch(/writes|reads|evidence/);
      return ok(Array.from({ length: 21 }, (_, i) => header(String(i))));
    });
    const result = await loadReviewHistory("approved", "", 0, new AbortController().signal);
    expect(result.batches).toHaveLength(20);
    expect(result.hasMore).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("loads only the requested next page and reports the last page honestly", async () => {
    const fetcher = backend(url => {
      expect(url.searchParams.get("offset")).toBe("20");
      expect(url.searchParams.get("limit")).toBe("21");
      expect(url.searchParams.get("status")).toBe("eq.declined");
      return ok([header("last")]);
    });
    const result = await loadReviewHistory("declined", "", 20, new AbortController().signal);
    expect(result.batches.map(row => row.id)).toEqual(["last"]);
    expect(result.hasMore).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("quotes PostgREST grammar and treats regex/wildcard characters as literal search text", async () => {
    const needle = 'Name,scope.eq.approved("a\\b") .*%_[x]';
    const fetcher = backend(url => {
      const filter = url.searchParams.get("or")!;
      const terms = [...filter.matchAll(/(scope|division|source_url)\.imatch\.("(?:\\.|[^"\\])*")(?:,|\)$)/g)];
      expect(terms.map(term => term[1])).toEqual(["scope", "division", "source_url"]);
      for (const term of terms) {
        const literalPattern = JSON.parse(term[2]) as string;
        const regex = new RegExp(literalPattern, "i");
        expect(regex.test(`prefix ${needle} suffix`)).toBe(true);
        expect(regex.test("NameXscopeYeqXapproved just anything")).toBe(false);
      }
      expect(filter).toBe(`(${historySearchFilter(needle)})`);
      return ok([]);
    });
    await loadReviewHistory("approved", `  ${needle}  `, 0, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps full records as a separate exact-ID detail request", async () => {
    const fetcher = backend(url => {
      if (url.searchParams.get("select") === HISTORY_COLUMNS) return ok([header("selected")]);
      expect(url.searchParams.get("select")).toBe("*");
      expect(url.searchParams.get("id")).toBe("eq.selected");
      expect(url.searchParams.has("status")).toBe(false);
      return ok({ ...header("selected"), writes: [{ path: "swims/s", after: { timeMs: 1000 } }], reads: [], evidence: { private: true } });
    });
    const page = await loadReviewHistory("approved", "", 0, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(page.batches[0]).not.toHaveProperty("writes");
    const details = await loadReviewBatchDetails(page.batches[0].id, new AbortController().signal);
    expect(details.id).toBe(page.batches[0].id);
    expect(details.writes).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("searches the displayed division labels as well as stored division IDs", () => {
    expect(historySearchFilter("Velocity")).toContain("division.in.(workshare,times)");
    expect(historySearchFilter("Swim Atlas")).toContain("division.in.(knowledge)");
  });
  it("propagates staff RLS errors without retry or privileged fallback", async () => {
    const fetcher = backend(() => new Response(JSON.stringify({ code: "42501", message: "permission denied", details: "", hint: "" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    }));
    await expect(loadReviewHistory("approved", "", 0, new AbortController().signal)).rejects.toMatchObject({ code: "42501" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid or already-aborted input before requesting anything", async () => {
    const fetcher = backend(() => ok([]));
    for (const [status, search, offset] of [["pending", "", 0], ["approved", "", -20], ["approved", "", 1], ["approved", "x".repeat(201), 0], ["approved", "bad\ntext", 0]] as const) {
      await expect(loadReviewHistory(status, search, offset, new AbortController().signal)).rejects.toThrow();
    }
    const aborted = new AbortController(); aborted.abort();
    await expect(loadReviewHistory("approved", "", 0, aborted.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(loadReviewBatchDetails("selected", aborted.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(loadReviewBatches("approved", new AbortController().signal)).rejects.toThrow("paged history");
    expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.browserClient).not.toHaveBeenCalled();
  });
  it("still loads the entire active dependency queue, including a parent after the first100", async () => {
    const batches = Array.from({ length: 101 }, (_, index) => ({
      ...header(String(index)), status: "pending", reads: [],
      writes: index === 0 ? [{ path: "swims/child", after: { meet: { id: "parent" } } }]
        : index === 100 ? [{ path: "meets/parent", after: {} }]
          : [{ path: `knowledge_entries/${index}`, after: {} }],
    }));
    const fetcher = backend(url => {
      if (url.pathname.endsWith("/collection_batch_queue")) {
        expect(url.searchParams.get("status")).toBe("in.(pending,held)");
        const start = Number(url.searchParams.get("offset"));
        return ok(batches.slice(start, start + 100));
      }
      expect(url.pathname).toBe("/rest/v1/meets");
      expect(url.searchParams.get("select")).toBe("id");
      return ok([]);
    });
    const result = await loadReviewBatches("pending", new AbortController().signal);
    expect(result.batches).toHaveLength(101);
    expect(result.batches.findIndex(row => row.id === "100")).toBeLessThan(result.batches.findIndex(row => row.id === "0"));
    expect(result.blockers["0"][0]).toContain("approve");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
