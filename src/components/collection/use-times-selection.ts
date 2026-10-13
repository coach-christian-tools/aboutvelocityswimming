"use client";

import { useSearchParams } from "next/navigation";
import type { Dispatch, SetStateAction } from "react";
import { readTimesSelection, writeTimesSelection } from "./times-url-state";

/** The URL is the source of truth, including reloads and Back/Forward navigation. */
export function useTimesSelection<T>(
  key: string,
  fallback: T,
): [T, Dispatch<SetStateAction<T>>] {
  const params = useSearchParams();
  const value = readTimesSelection(params.get(key), fallback);
  function setValue(action: SetStateAction<T>) {
    // Read the live URL so several setters in one event don't overwrite each other.
    const url = new URL(window.location.href);
    const current = readTimesSelection(url.searchParams.get(key), fallback);
    const next =
      typeof action === "function"
        ? (action as (previous: T) => T)(current)
        : action;
    const href = writeTimesSelection(url, key, next, fallback);
    // Avoid adding a history entry for every search keystroke.
    window.history.replaceState(null, "", href);
  }
  return [value, setValue];
}
