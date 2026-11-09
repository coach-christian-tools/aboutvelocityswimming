import { archiveFilters } from "@/lib/observatory";
import { readArchive } from "@/lib/observatory-server";
import { requestDiagnostics } from "@/lib/request-diagnostics";

export async function GET(request: Request) {
  const diagnostic = requestDiagnostics("observatory", request);
  let filters;
  try {
    filters = archiveFilters(new URL(request.url).searchParams);
  } catch (error) {
    return diagnostic.response(
      { error: error instanceof Error ? error.message : "Invalid filters." },
      400,
    );
  }
  try {
    return diagnostic.response(
      await diagnostic.step("read", () => readArchive(filters)),
      200,
      { "Cache-Control": "private, no-store" },
    );
  } catch (error) {
    diagnostic.failure("archive", error);
    return diagnostic.response(
      { error: "The archive could not be loaded. Please try again." },
      503,
      { "Cache-Control": "private, no-store" },
    );
  }
}
