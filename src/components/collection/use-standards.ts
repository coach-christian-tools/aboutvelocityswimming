"use client";
import { useEffect, useState } from "react";
import { browserClient, hasBackendConfiguration } from "@/lib/supabase/client";
import type { StandardSet } from "@/features/swim-resources/types/schema";

export function useStandards() {
  const [sets, setSets] = useState<StandardSet[]>([]);
  const [loading, setLoading] = useState(hasBackendConfiguration);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!hasBackendConfiguration) return;
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const { data, error } = await browserClient()
          .from("standards")
          .select("id,data")
          .order("id");
        if (error) throw error;
        if (alive)
          setSets(
            (data ?? []).map((row) => ({
              ...(row.data as unknown as StandardSet),
              id: row.id,
            })),
          );
      } catch {
        if (alive)
          setError("Could not load approved standards. Please try again.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    const refresh = () => {
      void load();
    };
    window.addEventListener("ies-times-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      window.removeEventListener("ies-times-changed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [revision]);
  return {
    sets,
    loading,
    error,
    retry: () => setRevision((value) => value + 1),
  };
}
