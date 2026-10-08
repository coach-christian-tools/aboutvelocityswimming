import { NextRequest, NextResponse } from "next/server";
import { checkoutParams, CommerceError } from "@/lib/commerce";
import { getStripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const key = process.env.PRINTFUL_API_KEY;
    if (!key) throw new Error("PRINTFUL_API_KEY is not configured");
    // Prefer a configured canonical origin over forwarded request headers.
    const origin = new URL(process.env.SITE_URL || req.url).origin;
    let form: FormData;
    try { form = await req.formData(); }
    catch { return NextResponse.json({ error: "Invalid checkout form" }, { status: 400 }); }
    const params = await checkoutParams(form, origin, key);
    const session = await getStripe().checkout.sessions.create(params);
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    console.error("Checkout failed", error instanceof CommerceError ? error.message : "Service error");
    const status = error instanceof CommerceError ? error.status : 503;
    return NextResponse.json({ error: status === 400 || status === 404 ? "This product variant is unavailable" : "Checkout is temporarily unavailable. Please try again." }, { status });
  }
}
