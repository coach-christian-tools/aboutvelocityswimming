import { parseTimesQuery } from "@/components/collection/times-api";
import { readTimes } from "@/lib/times/server";
import { requestDiagnostics } from "@/lib/request-diagnostics";
export async function GET(request: Request) {
  const diagnostic = requestDiagnostics("times", request);
  let query;
  try {
    query = parseTimesQuery(new URL(request.url).searchParams);
  } catch (error) {
    return diagnostic.response(
      { error: error instanceof Error ? error.message : "Invalid filters." },
      400,
    );
  }
  try {
    return diagnostic.response(
      await diagnostic.step("read", () => readTimes(query.kind, query.input)),
      200,
      { "Cache-Control": "no-store" },
    );
  } catch (error) {
    diagnostic.failure(query.kind, error);
    return diagnostic.response(
      { error: "We couldn’t load these results. Please try again." },
      503,
      { "Cache-Control": "no-store", "Retry-After": "1" },
    );
  }
}
