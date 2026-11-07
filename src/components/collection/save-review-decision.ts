// Approval writes are never retried: a lost response may follow a successful commit.
export async function saveReviewDecision(
  batchId: string,
  decision: string,
  note: string,
  onSlow: () => void,
) {
  const requestId = crypto.randomUUID();
  const started = performance.now();
  const context = { requestId, batchId, decision };
  console.info("[velocity:review] request started", context);
  const slowTimer = setTimeout(() => {
    console.warn("[velocity:review] still waiting for decision", {
      ...context,
      durationMs: Math.round(performance.now() - started),
    });
    onSlow();
  }, 10000);
  try {
    const response = await fetch("/api/collection/review", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      },
      body: JSON.stringify({ batchId, decision, note }),
      signal: AbortSignal.timeout(90000),
    });
    console.info("[velocity:review] response received", {
      ...context,
      requestId: response.headers.get("X-Request-ID") ?? requestId,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      serverTiming: response.headers.get("Server-Timing"),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.success !== true)
      throw new Error(
        result?.error ||
          "Could not confirm the decision. Refresh the queue to check this batch before trying again.",
      );
  } catch (error) {
    console.error("[velocity:review] decision not confirmed", {
      ...context,
      durationMs: Math.round(performance.now() - started),
    });
    if (
      error instanceof TypeError ||
      (error instanceof Error &&
        ["TimeoutError", "AbortError"].includes(error.name))
    )
      throw new Error(
        "Could not confirm the decision. Refresh the queue to check this batch before trying again.",
      );
    throw error;
  } finally {
    clearTimeout(slowTimer);
  }
}
