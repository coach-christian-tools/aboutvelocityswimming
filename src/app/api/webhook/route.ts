import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { fulfillSession } from "@/lib/commerce";
import { getStripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY || !process.env.PRINTFUL_API_KEY) {
    return NextResponse.json({ error: "Fulfillment is not configured" }, { status: 503 });
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return NextResponse.json({ received: true });
  }
  if (!event.livemode) return NextResponse.json({ received: true, test: true });
  try {
    // Fetch current session fields using the SDK's API version, rather than
    // relying on the webhook endpoint's potentially older address format.
    const session = await stripe.checkout.sessions.retrieve(event.data.object.id);
    await fulfillSession(session, process.env.PRINTFUL_API_KEY);
    return NextResponse.json({ received: true });
  } catch {
    console.error("Fulfillment failed; webhook will retry", { eventId: event.id, sessionId: event.data.object.id });
    return NextResponse.json({ error: "Fulfillment failed. Retry required." }, { status: 500 });
  }
}
