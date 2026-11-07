// Log operation metadata only: never request bodies, tokens, notes or result rows.
export function diagnosticCode(error: unknown): string {
  if (error && typeof error === "object") {
    const value =
      "code" in error ? error.code : "name" in error ? error.name : undefined;
    if (typeof value === "string" && /^[\w-]{1,50}$/.test(value)) return value;
  }
  return "UNKNOWN";
}

export function requestDiagnostics(scope: string, request: Request) {
  const supplied = request.headers.get("X-Request-ID");
  const requestId =
    supplied && /^[a-f0-9-]{36}$/i.test(supplied)
      ? supplied
      : crypto.randomUUID();
  const started = performance.now();
  const timings: string[] = [];
  const context = { scope, requestId };
  console.info("[velocity] request started", context);
  return {
    requestId,
    async step<T>(stage: string, run: () => PromiseLike<T>): Promise<T> {
      const start = performance.now();
      console.info("[velocity] stage started", { ...context, stage });
      const timer = setTimeout(() => {
        console.warn("[velocity] stage still running", {
          ...context,
          stage,
          durationMs: Math.round(performance.now() - start),
        });
      }, 10000);
      try {
        const result = await run();
        console.info("[velocity] stage completed", {
          ...context,
          stage,
          durationMs: Math.round(performance.now() - start),
        });
        return result;
      } catch (error) {
        console.error("[velocity] stage failed", {
          ...context,
          stage,
          code: diagnosticCode(error),
          durationMs: Math.round(performance.now() - start),
        });
        throw error;
      } finally {
        clearTimeout(timer);
        timings.push(`${stage};dur=${(performance.now() - start).toFixed(1)}`);
      }
    },
    failure(stage: string, error: unknown) {
      console.error("[velocity] request failed", {
        ...context,
        stage,
        code: diagnosticCode(error),
        durationMs: Math.round(performance.now() - started),
      });
    },
    response(body: object, status = 200, headers: Record<string, string> = {}) {
      const durationMs = Math.round(performance.now() - started);
      console.info("[velocity] request completed", {
        ...context,
        status,
        durationMs,
      });
      return Response.json(body, {
        status,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Request-ID": requestId,
          "Server-Timing": [...timings, `total;dur=${durationMs}`].join(", "),
          ...headers,
        },
      });
    },
  };
}
