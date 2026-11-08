import "server-only";

import { serverClient } from "@/lib/supabase/server";

export async function getInventoryStaffClient() {
  const client = await serverClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { error: "Sign in with your staff account to view this data." } as const;

  const { data: staff, error: staffError } = await client.rpc("is_staff");
  if (staffError) return { error: "Staff access could not be verified. Try again." } as const;
  if (staff !== true) return { error: "Staff access is required." } as const;

  return { client } as const;
}
