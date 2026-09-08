import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-05-27.dahlia" as any,
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const signature = req.headers.get("stripe-signature") as string;

  let event: Stripe.Event;

  try {
    if (!endpointSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not set");
    }
    event = stripe.webhooks.constructEvent(payload, signature, endpointSecret);
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // Handle the checkout.session.completed event
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Get the sync_variant_id from metadata
    const syncVariantId = session.metadata?.sync_variant_id;
    
    const sessionAny = session as any;
    if (syncVariantId && (sessionAny.shipping_details || sessionAny.customer_details)) {
      const shipping = sessionAny.shipping_details || sessionAny.customer_details;
      const address = shipping.address;
      
      // Prepare Printful Order payload
      const printfulOrder = {
        recipient: {
          name: shipping.name,
          address1: address?.line1,
          address2: address?.line2 || undefined,
          city: address?.city,
          state_code: address?.state, // Stripe state matches Printful state_code usually
          country_code: address?.country,
          zip: address?.postal_code,
        },
        items: [
          {
            sync_variant_id: parseInt(syncVariantId, 10),
            quantity: 1, // Currently hardcoded to 1 from checkout
          },
        ],
      };

      try {
        const response = await fetch("https://api.printful.com/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.PRINTFUL_API_KEY}`,
          },
          body: JSON.stringify(printfulOrder),
        });

        const printfulData = await response.json();
        
        if (printfulData.code !== 200) {
          console.error("Printful Order Error:", printfulData);
          // Return 500 so Stripe retries or logs the failure
          return NextResponse.json({ error: "Failed to create Printful order" }, { status: 500 });
        }
        
        console.log("Printful order created successfully:", printfulData.result.id);
      } catch (error) {
        console.error("Failed to call Printful API:", error);
        return NextResponse.json({ error: "Failed to communicate with Printful" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
