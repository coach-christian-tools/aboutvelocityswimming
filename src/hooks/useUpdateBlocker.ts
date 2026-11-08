"use client";

import { useEffect } from "react";
import { holdUpdates } from "@/lib/update-safety";

// For existing draft/busy state. Mutation handlers also acquire synchronously.
export function useUpdateBlocker(active: boolean): void {
  useEffect(() => {
    if (active) return holdUpdates();
  }, [active]);
}
