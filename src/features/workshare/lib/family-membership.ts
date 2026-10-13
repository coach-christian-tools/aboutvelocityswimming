import type { User } from "@/lib/auth";
import { browserClient } from "@/lib/supabase/client";

export async function findFamilyMembership(
  user: Pick<User, "email" | "emailVerified">,
): Promise<string | null> {
  const email = user.email?.trim().toLowerCase();
  if (!user.emailVerified || !email) return null;

  // The indexed, normalized membership table enforces the same family RLS as
  // family records, without assembling every family's full record projection.
  const { data, error } = await browserClient()
    .from("family_emails")
    .select("family_id")
    .eq("email", email)
    .order("family_id")
    .limit(1);
  if (error) throw error;
  return data?.[0]?.family_id ?? null;
}
