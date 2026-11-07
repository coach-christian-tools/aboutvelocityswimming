import { invalidateTimes } from "@/lib/times/server";
import { sameOrigin } from "@/lib/same-origin";
import { serverClient } from "@/lib/supabase/server";
import {
  dependencyTables,
  reviewDependencies,
} from "@/components/collection/review-dependencies";
import type { ReviewWrite } from "@/components/collection/review-summary";
import { requestDiagnostics } from "@/lib/request-diagnostics";

export async function POST(request: Request) {
  const diagnostic = requestDiagnostics("collection-review", request);
  const respond = diagnostic.response;
  if (!sameOrigin(request))
    return respond({ error: "Invalid request origin." }, 403);
  try {
    const client = await serverClient();
    const {
      data: { user },
      error: authError,
    } = await diagnostic.step("auth", () => client.auth.getUser());
    if (authError) diagnostic.failure("auth", authError);
    if (!user) return respond({ error: "Sign in to review changes." }, 401);
    let body;
    try {
      body = await request.json();
    } catch {
      return respond({ error: "Invalid request." }, 400);
    }
    if (
      typeof body?.batchId !== "string" ||
      !["approved", "held", "declined"].includes(body?.decision) ||
      typeof body?.note !== "string" ||
      body.note.length > 4000
    )
      return respond(
        { error: "Choose a valid decision and a note under 4,000 characters." },
        400,
      );

    console.info("[velocity:review] decision started", {
      requestId: diagnostic.requestId,
      batchId: body.batchId,
      decision: body.decision,
    });
    if (body.decision === "approved") {
      const { data: batch, error: batchError } = await diagnostic.step(
        "batch",
        () =>
          client
            .from("collection_batches")
            .select("writes")
            .eq("id", body.batchId)
            .single(),
      );
      if (batchError) {
        diagnostic.failure("batch", batchError);
        if (["57014", "55P03", "PGRST003"].includes(batchError.code))
          return respond(
            { error: "Could not load this batch. Refresh and try again." },
            503,
          );
      }
      if (batchError || !batch || !Array.isArray(batch.writes))
        return respond(
          { error: "This batch is unavailable. Staff access is required." },
          403,
        );
      const required = reviewDependencies(
        batch.writes as unknown as ReviewWrite[],
      );
      const checks = await diagnostic.step("dependencies", () =>
        Promise.all(
          dependencyTables.map(async (table) => {
            const ids = [...required[table]];
            const found = new Set<string>();
            // Bound URL length and PostgREST row limits for larger import batches.
            for (let offset = 0; offset < ids.length; offset += 200) {
              const { data, error } = await client
                .from(table)
                .select("id")
                .in("id", ids.slice(offset, offset + 200));
              if (error) {
                diagnostic.failure(`dependency-${table}`, error);
                return { table, missing: 0, error };
              }
              for (const row of data ?? []) found.add(row.id);
            }
            return {
              table,
              missing: ids.filter((id) => !found.has(id)).length,
              error: null,
            };
          }),
        ),
      );
      if (checks.some((check) => check.error))
        return respond(
          {
            error:
              "Could not verify prerequisite records. Refresh and try again.",
          },
          503,
        );
      const labels = {
        teams: "teams",
        venues: "venues",
        meets: "meets",
        athletes: "swimmer profiles",
        relay_results: "parent relay results",
      };
      const missing = checks
        .filter((check) => check.missing)
        .map((check) => `${check.missing} ${labels[check.table]}`);
      if (missing.length)
        return respond(
          {
            error: `Approve the prerequisite batches first: ${missing.join(", ")} are not yet in the database. Teams and meets appear at the top of the pending queue, followed by swimmer profiles, then results. No changes were applied.`,
          },
          409,
        );
    }
    const { error } = await diagnostic.step("review-rpc", () =>
      client.rpc("review_collection", {
        batch_id: body.batchId,
        decision: body.decision,
        note: body.note,
      }),
    );
    if (error) {
      diagnostic.failure("review-rpc", error);
      if (["57014", "55P03", "PGRST003"].includes(error.code))
        return respond(
          {
            error:
              "Saving the decision timed out. Refresh the queue to check this batch before trying again.",
          },
          503,
        );
      return respond(
        { error: error.message },
        ["40001", "23503"].includes(error.code) ? 409 : 403,
      );
    }
    // A cache failure must not turn a committed decision into an apparent failure.
    try {
      invalidateTimes();
    } catch (error) {
      diagnostic.failure("invalidate-times", error);
    }
    return respond({ success: true });
  } catch (error) {
    diagnostic.failure("unexpected", error);
    return respond(
      {
        error:
          "Could not confirm the decision. Refresh the queue to check this batch before trying again.",
      },
      503,
    );
  }
}
