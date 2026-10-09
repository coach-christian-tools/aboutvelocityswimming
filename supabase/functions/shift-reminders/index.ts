import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { handleReminders } from "./worker.mjs";
Deno.serve((request) =>
  handleReminders(request, {
    secret: Deno.env.get("VELOCITY_REMINDER_SECRET"),
    enabled: Deno.env.get("OUTBOUND_EMAIL_ENABLED") === "true",
    client: createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    ),
    apiKey: Deno.env.get("RESEND_API_KEY"),
    from: Deno.env.get("RESEND_FROM_EMAIL"),
  }),
);
