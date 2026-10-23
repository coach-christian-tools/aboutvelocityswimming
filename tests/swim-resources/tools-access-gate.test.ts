import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/tools/times",
  auth: {
    user: null as null | { email: string; emailVerified: boolean },
    loading: false,
  },
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/features/workshare/contexts/auth", () => ({
  useAuth: () => mocks.auth,
}));
import ToolsAccessGate from "@/components/shared/ToolsAccessGate";
const render = () =>
  renderToStaticMarkup(
    createElement(ToolsAccessGate, null, "Protected tool content"),
  );

beforeEach(() => {
  mocks.pathname = "/tools/times";
  mocks.auth = { user: null, loading: false };
});

describe("already-loaded tool access", () => {
  it("hides tool content while checking auth and after sign-out", () => {
    mocks.auth.loading = true;
    expect(render()).toContain("Checking your account");
    expect(render()).not.toContain("Protected tool content");
    mocks.auth.loading = false;
    expect(render()).toContain("Tools are temporarily locked");
    expect(render()).not.toContain("Protected tool content");
  });
  it("hides tools for other signed-in accounts", () => {
    mocks.auth.user = {
      email: "coach@velocity-swimming.com",
      emailVerified: true,
    };
    expect(render()).not.toContain("Protected tool content");
  });
  it("shows tools for the verified admin", () => {
    mocks.auth.user = {
      email: "christiancutter02@gmail.com",
      emailVerified: true,
    };
    expect(render()).toBe("Protected tool content");
    mocks.auth.user.emailVerified = false;
    expect(render()).not.toContain("Protected tool content");
  });
  it("keeps the public site and sign-in page visible", () => {
    for (const path of ["/", "/login", "/schedule", "/store"]) {
      mocks.pathname = path;
      expect(render()).toBe("Protected tool content");
    }
  });
});
