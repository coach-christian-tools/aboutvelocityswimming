import type { ContextType, ReactElement } from "react";
import type { User } from "@/lib/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  effect: undefined as undefined | (() => () => void),
  listener: undefined as undefined | ((user: User | null) => Promise<void>),
  membership: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const slot = harness.cursor++;
    if (!(slot in harness.states)) harness.states[slot] = initial;
    return [
      harness.states[slot],
      (value: unknown) => {
        harness.states[slot] = value;
      },
    ];
  },
  useEffect: (effect: () => () => void) => {
    harness.effect ??= effect;
  },
}));
vi.mock("@/lib/auth", () => ({
  onAuthStateChanged: (
    _auth: unknown,
    listener: (user: User | null) => Promise<void>,
  ) => {
    harness.listener = listener;
    return harness.unsubscribe;
  },
  signOut: vi.fn(),
}));
vi.mock("@/features/workshare/lib/backend", () => ({ auth: {} }));
vi.mock("@/features/workshare/lib/family-membership", () => ({
  findFamilyMembership: harness.membership,
}));
import { AuthProvider } from "@/features/workshare/contexts/AuthContext";
import { AuthContext } from "@/features/workshare/contexts/auth";

function state() {
  harness.cursor = 0;
  const provider = AuthProvider({ children: null }) as ReactElement<{
    value: ContextType<typeof AuthContext>;
  }>;
  return provider.props.value;
}
function account(uid = "staff", staff = true): User {
  return {
    uid,
    staff,
    email: `${uid}@example.test`,
    emailVerified: true,
    getIdToken: async () => "synthetic-token",
  };
}
function deferred() {
  let resolve!: (value: string | null) => void;
  const promise = new Promise<string | null>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function publish(user: User | null) {
  if (!harness.listener) throw new Error("Auth provider is not mounted");
  return harness.listener(user);
}

beforeEach(() => {
  harness.states = [];
  harness.cursor = 0;
  harness.effect = undefined;
  harness.listener = undefined;
  harness.membership.mockReset().mockResolvedValue(null);
  harness.unsubscribe.mockReset();
  state();
});

describe("Workshare auth membership lifecycle", () => {
  it("keeps staff authorization independent of family membership", async () => {
    const cleanup = harness.effect!();
    const staff = account();
    await publish(staff);
    expect(state()).toMatchObject({
      user: staff,
      isAdmin: true,
      familyId: null,
      loading: false,
    });
    cleanup();
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
  });

  it("refreshes membership without resetting staff access or an active client preview", async () => {
    harness.effect!();
    const staff = account();
    harness.membership.mockResolvedValueOnce("staff-family");
    await publish(staff);
    state().setClientMode(true);
    state().setPreviewFamilyId("preview-family");
    const next = deferred();
    harness.membership.mockReturnValueOnce(next.promise);
    const refreshing = publish({ ...staff });
    expect(state()).toMatchObject({
      isAdmin: true,
      familyId: "preview-family",
      loading: false,
      clientMode: true,
      previewFamilyId: "preview-family",
    });
    next.resolve("updated-family");
    await refreshing;
    expect(state().familyId).toBe("preview-family");
    state().setClientMode(false);
    expect(state().familyId).toBe("updated-family");
    expect(harness.membership).toHaveBeenCalledTimes(2);
  });

  it("ignores an older membership response after the account changes", async () => {
    harness.effect!();
    const first = deferred();
    const second = deferred();
    harness.membership
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const oldAccount = publish(account("first"));
    const newUser = account("second", false);
    const newAccount = publish(newUser);
    first.resolve("old-family");
    await oldAccount;
    expect(state()).toMatchObject({
      user: newUser,
      isAdmin: false,
      familyId: null,
      loading: true,
    });
    second.resolve("new-family");
    await newAccount;
    expect(state()).toMatchObject({
      user: newUser,
      isAdmin: false,
      familyId: "new-family",
      loading: false,
    });
  });

  it("clears staff preview when access is revoked and ignores a pending result after logout", async () => {
    harness.effect!();
    const staff = account();
    await publish(staff);
    state().setClientMode(true);
    state().setPreviewFamilyId("preview-family");
    const next = deferred();
    harness.membership.mockReturnValueOnce(next.promise);
    const revoking = publish({ ...staff, staff: false });
    expect(state()).toMatchObject({
      isAdmin: false,
      clientMode: false,
      previewFamilyId: null,
      familyId: null,
      loading: true,
    });
    await publish(null);
    next.resolve("must-not-restore");
    await revoking;
    expect(state()).toMatchObject({
      user: null,
      isAdmin: false,
      familyId: null,
      clientMode: false,
      loading: false,
    });
  });

  it("fails closed on membership errors while preserving verified staff access", async () => {
    harness.effect!();
    const staff = account();
    harness.membership.mockResolvedValueOnce("staff-family");
    await publish(staff);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("Synthetic membership failure");
    harness.membership.mockRejectedValueOnce(error);
    try {
      await publish({ ...staff });
      expect(state()).toMatchObject({
        user: staff,
        isAdmin: true,
        familyId: null,
        loading: false,
      });
      expect(log).toHaveBeenCalledExactlyOnceWith(
        "Error fetching family membership:",
        error,
      );
    } finally {
      log.mockRestore();
    }
  });

  it("ignores membership completion after unmount", async () => {
    const cleanup = harness.effect!();
    const next = deferred();
    harness.membership.mockReturnValueOnce(next.promise);
    const pending = publish(account());
    cleanup();
    next.resolve("must-not-restore");
    await pending;
    expect(state()).toMatchObject({
      isAdmin: false,
      familyId: null,
      loading: true,
    });
  });
});
