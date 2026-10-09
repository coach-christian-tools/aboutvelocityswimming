export async function handleReminders(
  request,
  { secret, enabled, client, apiKey, from, deliver = fetch },
) {
  const provided = request.headers.get("x-cron-secret") ?? "";
  const hashes = await Promise.all(
    [secret ?? "", provided].map((value) =>
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
  const a = new Uint8Array(hashes[0]),
    b = new Uint8Array(hashes[1]);
  if (
    !secret ||
    a.reduce((difference, byte, index) => difference | (byte ^ b[index]), 0)
  )
    return new Response("Unauthorized", { status: 401 });
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  if (enabled && (!apiKey || !from))
    return Response.json(
      { error: "Email delivery is not configured." },
      { status: 503 },
    );
  const { data, error } = await client.rpc("claim_shift_reminders", {
    dry_run: !enabled,
  });
  if (error)
    return Response.json(
      { error: "Unable to load reminders." },
      { status: 500 },
    );
  if (!enabled)
    return Response.json({ suppressed: true, eligible: data.length });
  let sent = 0,
    failed = 0;
  for (const reminder of data) {
    let deliveryId = null,
      failure = null;
    try {
      const when = new Date(reminder.when).toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
        dateStyle: "full",
        timeStyle: "short",
      });
      const response = await deliver("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": reminder.key,
        },
        body: JSON.stringify({
          from,
          to: reminder.emails,
          subject: `Reminder: Upcoming Shift for ${reminder.title}`,
          text: `Hello! ${reminder.name} is signed up for ${reminder.title} on ${when} (Pacific time). Please contact your administrator if you need help with this shift.`,
        }),
      });
      if (!response.ok)
        throw new Error(`Email provider returned ${response.status}`);
      deliveryId = (await response.json()).id;
      if (!deliveryId)
        throw new Error("Email provider did not acknowledge delivery");
    } catch (error) {
      failure = error instanceof Error ? error.message : "Delivery failed";
    }
    const result = await client.rpc("finish_shift_reminder", {
      registration_id: reminder.registrationId,
      reminder_date: reminder.date,
      delivery_id: deliveryId,
      failure,
    });
    if (failure || result.error) failed++;
    else sent++;
  }
  return Response.json({ sent, failed }, { status: failed ? 503 : 200 });
}
