import { parseTimesQuery } from "@/components/collection/times-api";
import { readTimes } from "@/lib/times/server";
export async function GET(request: Request) {
  let query;
  try {
    query = parseTimesQuery(new URL(request.url).searchParams);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid filters." },
      { status: 400 },
    );
  }
  try {
    return Response.json(await readTimes(query.kind, query.input), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "We couldn’t load these results. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
