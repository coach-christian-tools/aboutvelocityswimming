import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effect: undefined as undefined | (() => () => void),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState(initial: unknown) {
    const slot = harness.cursor++;
    if (!(slot in harness.slots)) harness.slots[slot] = initial;
    return [
      harness.slots[slot],
      (value: unknown) => {
        harness.slots[slot] = value;
      },
    ];
  },
  useRef(initial: unknown) {
    const slot = harness.cursor++;
    if (!(slot in harness.slots)) harness.slots[slot] = { current: initial };
    return harness.slots[slot];
  },
  useEffect(effect: () => () => void) {
    // This component has one mount-only effect. Renders do not rerun it.
    harness.effect ??= effect;
  },
}));
import ProductForm from "@/app/(site)/store/[id]/ProductForm";
import { updatesBlocked } from "@/lib/update-safety";

type Element = ReactElement<Record<string, unknown>>;
let cleanup: (() => void) | undefined;
let browser: EventTarget & { location: { reload: ReturnType<typeof vi.fn> } };
function render() {
  harness.cursor = 0;
  return ProductForm({
    productId: 1,
    productName: "Team shirt",
    variants: [
      {
        id: 2,
        external_id: "shirt-medium",
        name: "Team shirt - M",
        retail_price: "25",
      },
    ],
  });
}
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function find(predicate: (element: Element) => boolean) {
  const result = elements(render()).find(predicate);
  if (!result) throw new Error("Expected element missing");
  return result;
}
function submit() {
  const event = { preventDefault: vi.fn() };
  const form = find((element) => element.type === "form");
  (form.props.onSubmit as (submission: typeof event) => void)(event);
  return event;
}
beforeEach(() => {
  harness.slots = [];
  harness.cursor = 0;
  harness.effect = undefined;
  browser = Object.assign(new EventTarget(), { location: { reload: vi.fn() } });
  vi.stubGlobal("window", browser);
  render();
  cleanup = harness.effect!();
});
afterEach(() => {
  cleanup?.();
  expect(updatesBlocked()).toBe(false);
  vi.unstubAllGlobals();
});

describe("checkout update safety", () => {
  it("holds updates on submit, shows pending status, and prevents duplicate submissions", () => {
    expect(updatesBlocked()).toBe(false);
    expect(submit().preventDefault).not.toHaveBeenCalled();
    expect(updatesBlocked()).toBe(true);
    const button = find((element) => element.props.type === "submit");
    expect(button.props.disabled).toBe(true);
    expect(button.props.children).toBe("Opening checkout…");
    expect(find((element) => element.props.role === "status")).toBeDefined();
    expect(submit().preventDefault).toHaveBeenCalledOnce();
  });

  it("offers explicit reload recovery without releasing or resubmitting checkout", () => {
    submit();
    const recovery = find(
      (element) => element.props.children === "Reload page",
    );
    expect(recovery.props.type).toBe("button");
    expect(browser.location.reload).not.toHaveBeenCalled();
    (recovery.props.onClick as () => void)();
    expect(browser.location.reload).toHaveBeenCalledOnce();
    expect(updatesBlocked()).toBe(true);
    expect(submit().preventDefault).toHaveBeenCalledOnce();
  });

  it("releases the hold and pending state on pageshow so back navigation can retry", () => {
    submit();
    browser.dispatchEvent(new Event("pageshow"));
    expect(updatesBlocked()).toBe(false);
    const button = find((element) => element.props.type === "submit");
    expect(button.props.disabled).toBe(false);
    expect(button.props.children).toBe("Checkout with Stripe");
    expect(submit().preventDefault).not.toHaveBeenCalled();
    expect(updatesBlocked()).toBe(true);
  });

  it("releases on unmount and removes the pageshow listener", () => {
    const remove = vi.spyOn(browser, "removeEventListener");
    submit();
    cleanup?.();
    cleanup = undefined;
    expect(updatesBlocked()).toBe(false);
    expect(remove).toHaveBeenCalledWith("pageshow", expect.any(Function));
    browser.dispatchEvent(new Event("pageshow"));
    expect(updatesBlocked()).toBe(false);
  });
});
