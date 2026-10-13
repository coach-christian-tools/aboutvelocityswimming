import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  browserClient: () => ({ from: backend.from }),
}));
import { findFamilyMembership } from "@/features/workshare/lib/family-membership";

beforeEach(() => {
  vi.clearAllMocks();
  backend.from.mockReturnValue({ select: backend.select });
  backend.select.mockReturnValue({ eq: backend.eq });
  backend.eq.mockReturnValue({ order: backend.order });
  backend.order.mockReturnValue({ limit: backend.limit });
  backend.limit.mockResolvedValue({ data: [], error: null });
});

describe("Workshare family membership", () => {
  it("uses a single indexed canonical email lookup and returns only the first family ID", async () => {
    backend.limit.mockResolvedValue({
      data: [{ family_id: "family-a" }],
      error: null,
    });
    expect(
      await findFamilyMembership({
        email: " Family-A@Example.Test ",
        emailVerified: true,
      }),
    ).toBe("family-a");
    expect(backend.from).toHaveBeenCalledExactlyOnceWith("family_emails");
    expect(backend.select).toHaveBeenCalledExactlyOnceWith("family_id");
    expect(backend.eq).toHaveBeenCalledExactlyOnceWith(
      "email",
      "family-a@example.test",
    );
    expect(backend.order).toHaveBeenCalledExactlyOnceWith("family_id");
    expect(backend.limit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it.each([
    { email: "family-a@example.test", emailVerified: false },
    { email: null, emailVerified: true },
    { email: "  ", emailVerified: true },
  ])("does not query membership without a verified email: %j", async (user) => {
    expect(await findFamilyMembership(user)).toBeNull();
    expect(backend.from).not.toHaveBeenCalled();
  });

  it("keeps missing membership distinct from a database error", async () => {
    const user = { email: "none@example.test", emailVerified: true };
    expect(await findFamilyMembership(user)).toBeNull();
    const error = { code: "57014", message: "Synthetic statement timeout" };
    backend.limit.mockResolvedValue({ data: null, error });
    await expect(findFamilyMembership(user)).rejects.toEqual(error);
  });
});
