import type { TimesResponse } from "./times-api";

const message = "We couldn’t load these results. Please try again.";
const retryable = new Set([408, 429, 500, 502, 503, 504]);

function pause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 500);
    signal.addEventListener("abort", abort, { once: true });
  });
}

// Read-only requests get one bounded retry. Never use this for approval writes.
export async function loadTimes(
  url: string,
  signal: AbortSignal,
): Promise<TimesResponse> {
  const view = new URL(url, "https://local.invalid").searchParams.get("view");
  for (let attempt = 1; attempt <= 2; attempt++) {
    signal.throwIfAborted();
    const requestId = crypto.randomUUID();
    const started = performance.now();
    let status: number | undefined;
    let canRetry = true;
    try {
      console.info("[velocity:times] request started", {
        view,
        requestId,
        attempt,
      });
      const response = await fetch(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
        cache: "no-store",
        headers: { "X-Request-ID": requestId },
      });
      status = response.status;
      canRetry = retryable.has(status);
      if (!response.ok) throw new Error(message);
      const data = (await response.json()) as TimesResponse;
      console.info("[velocity:times] request completed", {
        view,
        requestId: response.headers.get("X-Request-ID") ?? requestId,
        attempt,
        status,
        durationMs: Math.round(performance.now() - started),
        serverTiming: response.headers.get("Server-Timing"),
      });
      return data;
    } catch {
      signal.throwIfAborted();
      console.warn("[velocity:times] request failed", {
        view,
        requestId,
        attempt,
        status,
        durationMs: Math.round(performance.now() - started),
        retrying: attempt === 1 && canRetry,
      });
      if (attempt === 2 || !canRetry) throw new Error(message);
      await pause(signal);
    }
  }
  throw new Error(message);
}
