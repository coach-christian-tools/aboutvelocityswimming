import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-05-27.dahlia" as any,
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    
    // We get the item details from the form
    const sync_variant_id = formData.get("sync_variant_id") as string;
    const productName = formData.get("product_name") as string;
    const priceStr = formData.get("price") as string;
    const image = formData.get("image") as string;

    if (!sync_variant_id || !productName || !priceStr) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Convert price to cents
    const priceInCents = Math.round(parseFloat(priceStr) * 100);

    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host');
    const baseUrl = `${protocol}://${host}`;

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      shipping_address_collection: {
        allowed_countries: ["US", "CA", "GB"], // Adjust as needed
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 500, currency: 'usd' }, // Example flat rate
            display_name: 'Standard shipping',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 5 },
              maximum: { unit: 'business_day', value: 7 },
            },
          },
        },
      ],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: productName,
              images: image ? [image] : [],
            },
            unit_amount: priceInCents,
          },
          quantity: 1,
        },
      ],
      // Store the Printful sync variant ID so the webhook can fulfill it
      metadata: {
        sync_variant_id: sync_variant_id,
      },
      success_url: `${baseUrl}/store/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/store`,
    });

    if (session.url) {
      return NextResponse.redirect(session.url, 303);
    }
    
    return NextResponse.json({ error: "Could not create session" }, { status: 500 });
  } catch (error: any) {
    console.error("Stripe Checkout Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
