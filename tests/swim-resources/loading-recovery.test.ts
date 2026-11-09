import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadTimes } from "@/components/collection/load-times";
import { saveReviewDecision } from "@/components/collection/save-review-decision";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const response = (status: number, body: object) =>
  Response.json(body, { status });

it("recovers a temporary results failure without requiring a second user action", async () => {
  fetchMock
    .mockResolvedValueOnce(response(503, { error: "temporarily unavailable" }))
    .mockResolvedValueOnce(response(200, { rows: [], expiresAt: 180000 }));
  const loaded = loadTimes(
    "/api/times?view=meets&search=private-search",
    new AbortController().signal,
  );
  await vi.advanceTimersByTimeAsync(500);
  expect(await loaded).toEqual({ rows: [], expiresAt: 180000 });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(
    "private-search",
  );
  expect(fetchMock.mock.calls[0][1].headers["X-Request-ID"]).toMatch(
    /^[a-f0-9-]{36}$/,
  );
});
it.each([401, 403, 400])(
  "does not retry a %s results response",
  async (status) => {
    fetchMock.mockResolvedValue(response(status, { error: "denied" }));
    await expect(
      loadTimes("/api/times?view=meets", new AbortController().signal),
    ).rejects.toThrow("couldn’t load");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);
it("stops after two failed results reads", async () => {
  fetchMock.mockResolvedValue(response(503, {}));
  const failed = expect(
    loadTimes("/api/times?view=meets", new AbortController().signal),
  ).rejects.toThrow("couldn’t load");
  await vi.advanceTimersByTimeAsync(500);
  await failed;
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("cancels a pending retry when the user leaves or changes filters", async () => {
  const controller = new AbortController();
  fetchMock.mockResolvedValue(response(503, {}));
  const failed = expect(
    loadTimes("/api/times?view=meets", controller.signal),
  ).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(100);
  controller.abort();
  await failed;
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("never retries an approval whose response was lost", async () => {
  fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
  await expect(
    saveReviewDecision("batch", "approved", "private note", vi.fn()),
  ).rejects.toThrow("Refresh the queue");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(
    "private note",
  );
});
it("handles a non-JSON gateway response without hiding the recovery action", async () => {
  fetchMock.mockResolvedValue(
    new Response("<html>timeout</html>", { status: 504 }),
  );
  await expect(
    saveReviewDecision("batch", "approved", "", vi.fn()),
  ).rejects.toThrow("Refresh the queue");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("shows the stale batch recovery instruction immediately without resubmitting", async () => {
  const message = "Canonical baseline changed after staging. Export and revalidate this batch before approval.";
  fetchMock.mockResolvedValue(response(409, { error: message }));
  const onSlow = vi.fn();
  await expect(saveReviewDecision("batch", "approved", "", onSlow)).rejects.toThrow(message);
  await vi.advanceTimersByTimeAsync(10000);
  expect(onSlow).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("shows slow approval feedback and bounds a hung approval without resubmitting", async () => {
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new DOMException("Timed out", "TimeoutError")),
      ms,
    );
    return controller.signal;
  });
  fetchMock.mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason));
      }),
  );
  const onSlow = vi.fn();
  const failed = expect(
    saveReviewDecision("batch", "approved", "", onSlow),
  ).rejects.toThrow("Refresh the queue");
  await vi.advanceTimersByTimeAsync(10000);
  expect(onSlow).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(80000);
  await failed;
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
