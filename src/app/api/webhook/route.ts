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
    // In Stripe Checkout sessions, physical shipping address is in shipping_details or collected_information.shipping_details
    const shipping = sessionAny.shipping_details || sessionAny.collected_information?.shipping_details || sessionAny.customer_details;
    const address = shipping?.address || sessionAny.customer_details?.address;

    if (syncVariantId && shipping && address?.line1 && address?.city && address?.state) {
      // Prepare Printful Order payload
      const printfulOrder = {
        recipient: {
          name: shipping.name || sessionAny.customer_details?.name || "Valued Customer",
          address1: address.line1,
          address2: address.line2 || undefined,
          city: address.city,
          state_code: address.state, // Stripe state code e.g. WA
          country_code: address.country || "US",
          zip: address.postal_code,
          email: sessionAny.customer_details?.email || undefined,
          phone: shipping.phone || sessionAny.customer_details?.phone || undefined,
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
          console.error("Printful Order Error:", JSON.stringify(printfulData));
          // Return 500 with Printful detail so Stripe / logs show the exact reason
          return NextResponse.json(
            { 
              error: "Failed to create Printful order", 
              printful_code: printfulData.code, 
              details: printfulData.result || printfulData.error 
            }, 
            { status: 500 }
          );
        }
        
        console.log("Printful order created successfully:", printfulData.result.id);
      } catch (error) {
        console.error("Failed to call Printful API:", error);
        return NextResponse.json({ error: "Failed to communicate with Printful" }, { status: 500 });
      }
    } else {
      console.warn("Skipping Printful order creation - missing variant or address details:", {
        syncVariantId,
        hasShipping: !!shipping,
        address
      });
    }
  }

  return NextResponse.json({ received: true });
}
