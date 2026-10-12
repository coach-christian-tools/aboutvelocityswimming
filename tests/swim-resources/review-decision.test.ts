import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/client", () => ({ browserClient: vi.fn() }));
import {
  applyReviewDecision,
  type QueueBatch,
} from "@/components/collection/load-review-batches";
import { orderReviewBatches } from "@/components/collection/review-order";

const meet: QueueBatch = {
  id: "parent",
  division: "times",
  scope: "Meet",
  received_at: "2026-10-12",
  captured_at: "2026-10-12",
  status: "pending",
  coverage: "partial",
  source_url: "https://example.test",
  review_note: null,
  reviewed_at: null,
  writes: [{ path: "meets/m", after: { name: "Meet" } }],
  reads: [],
};
const swim: QueueBatch = {
  ...meet,
  id: "child",
  scope: "Swim",
  writes: [{ path: "swims/s", after: { meet: { id: "m" } } }],
};
function snapshot() {
  const sourceBatches = [swim, meet];
  const existing = new Set<string>();
  return {
    sourceBatches,
    existing,
    ...orderReviewBatches(sourceBatches, existing),
  };
}
describe("queue updates after confirmed review decisions", () => {
  it("removes the approved meet and unlocks its dependent without a reload", () => {
    const original = snapshot();
    const next = applyReviewDecision(
      original,
      "parent",
      "approved",
      "pending",
      "Checked",
    );
    expect(next.batches.map((batch) => batch.id)).toEqual(["child"]);
    expect(next.blockers.child).toEqual([]);
    expect(next.existing.has("meets/m")).toBe(true);
    expect(original.batches).toHaveLength(2);
    expect(original.existing.size).toBe(0);
  });
  it("keeps held prerequisites blocked and updates the explanation", () => {
    const next = applyReviewDecision(
      snapshot(),
      "parent",
      "held",
      "pending",
      "Investigate",
    );
    expect(next.batches.map((batch) => batch.id)).toEqual(["child"]);
    expect(next.blockers.child[0]).toContain("(held)");
    expect(
      next.sourceBatches.find((batch) => batch.id === "parent")?.review_note,
    ).toBe("Investigate");
  });
  it("declining a prerequisite does not unlock its dependent", () => {
    const next = applyReviewDecision(
      snapshot(),
      "parent",
      "declined",
      "pending",
      "Wrong meet",
    );
    expect(next.blockers.child[0]).toContain("missing prerequisite");
    expect(next.existing.has("meets/m")).toBe(false);
  });
  it("keeps a held batch visible when it is held again, and tolerates an already refreshed decision", () => {
    const original = snapshot();
    original.sourceBatches[1] = { ...meet, status: "held" };
    const next = applyReviewDecision(
      original,
      "parent",
      "held",
      "held",
      "Still investigating",
    );
    expect(next.batches.map((batch) => batch.id)).toEqual(["parent"]);
    expect(applyReviewDecision(next, "unknown", "approved", "held", "")).toBe(
      next,
    );
  });
});
