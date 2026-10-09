"use client";
import type { Child } from "@/features/workshare/types";

/** A Workshare member is a household identity, independent of Times athletes. */
export default function SwimmerPicker({
  child,
  onChange,
}: {
  child: Child;
  onChange: (value: Child) => void;
}) {
  return (
    <label className="block text-xs">
      Household member
      <input
        aria-label="Household member name"
        placeholder="Full name"
        className="mt-2 w-full rounded-md border border-border p-2 bg-surface"
        required
        value={child.name}
        onChange={(event) => onChange({ ...child, name: event.target.value })}
      />
      <span className="block mt-2 text-text-secondary">
        This member belongs to Workshare. Times profiles are managed separately.
      </span>
    </label>
  );
}
