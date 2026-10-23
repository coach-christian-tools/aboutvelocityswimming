import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  browserClient: vi.fn(),
  auth: { isAdmin: false, loading: false },
}));
vi.mock("@/lib/supabase/client", () => ({ browserClient: mocks.browserClient, hasBackendConfiguration: true }));
vi.mock("@/features/workshare/contexts/auth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/components/collection/StandardReview", () => ({ default: () => null }));
vi.mock("@/components/collection/PrivateRaceBaseline", () => ({ default: () => null }));
import ReviewQueue from "@/components/collection/ReviewQueue";

describe("review history retains the staff UI boundary", () => {
  it("renders no queue or history controls for a non-admin account", () => {
    const html = renderToStaticMarkup(createElement(ReviewQueue));
    expect(html).toContain("Staff access is required");
    expect(html).not.toContain("Collected changes");
    expect(html).not.toContain("Search completed batches");
    expect(mocks.browserClient).not.toHaveBeenCalled();
  });
  it("keeps the account-loading state before showing protected controls", () => {
    mocks.auth.loading = true;
    const html = renderToStaticMarkup(createElement(ReviewQueue));
    expect(html).toContain("Checking your account");
    expect(html).not.toContain("Collected changes");
    expect(mocks.browserClient).not.toHaveBeenCalled();
    mocks.auth.loading = false;
  });
});
