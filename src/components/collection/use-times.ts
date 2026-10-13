"use client";
import { useEffect, useState } from "react";
import type { TimesResponse } from "./times-api";
import { timesCache as cache, timesGeneration } from "./times-cache";
export function useDebouncedSearch(value: string) {
  const [search, setSearch] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(value), 250);
    return () => clearTimeout(timer);
  }, [value]);
  return search;
}
export function useTimes(url: string | null, enabled = true) {
  const cacheKey = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}|${url}`;
  const [state, setState] = useState<{
    url: string | null;
    data: TimesResponse | null;
    error: string;
  }>({ url: null, data: null, error: "" });
  const [attempt, retry] = useState(0);
  useEffect(() => {
    if (!url || !enabled) return;
    const controller = new AbortController();
    const generation = timesGeneration;
    let timer: ReturnType<typeof setTimeout>;
    const changed = () => retry((n) => n + 1);
    window.addEventListener("ies-times-changed", changed);
    async function load() {
      try {
        let data = cache.get(cacheKey);
        if (!data || data.expiresAt <= Date.now()) {
          const response = await fetch(url!, {
            signal: controller.signal,
            cache: "no-store",
          });
          if (!response.ok)
            throw new Error(
              "We couldn’t load these results. Please try again.",
            );
          data = (await response.json()) as TimesResponse;
          if (controller.signal.aborted || generation !== timesGeneration)
            return;
          cache.set(cacheKey, data);
          if (cache.size > 128) cache.delete(cache.keys().next().value!);
        }
        if (!controller.signal.aborted) {
          setState({ url, data, error: "" });
          timer = setTimeout(
            () => retry((n) => n + 1),
            Math.max(1000, data.expiresAt - Date.now() + 10),
          );
        }
      } catch {
        if (!controller.signal.aborted)
          setState({
            url,
            data: null,
            error: "We couldn’t load these results. Please try again.",
          });
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("ies-times-changed", changed);
    };
  }, [url, cacheKey, attempt, enabled]);
  const data = url && state.url === url ? state.data : null;
  const error = url && state.url === url ? state.error : "";
  return {
    data,
    error,
    loading: Boolean(enabled && url && !data && !error),
    retry: () => {
      if (url) cache.delete(cacheKey);
      setState({ url: null, data: null, error: "" });
      retry((n) => n + 1);
    },
  };
}
