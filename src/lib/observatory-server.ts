import "server-only";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { Database } from "@/lib/supabase/database.types";
import type { ArchiveData, ArchiveFilters } from "./observatory";

const cachedArchive = unstable_cache(
  async (url: string, key: string, serialized: string) => {
    const client = createClient<Database>(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
      },
    });
    const { data, error } = await client.rpc("archive_observatory", {
      input: JSON.parse(serialized),
    });
    if (error)
      throw Object.assign(new Error("Archive query failed"), {
        code: error.code,
      });
    return data as unknown as ArchiveData;
  },
  ["archive-observatory-v1"],
  { tags: ["ies-times"], revalidate: 60 },
);

export async function readArchive(filters: ArchiveFilters) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Archive database is not configured.");
  return cachedArchive(url, key, JSON.stringify(filters));
}
