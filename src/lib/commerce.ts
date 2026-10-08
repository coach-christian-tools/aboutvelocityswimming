import { createHash } from "node:crypto";
import type Stripe from "stripe";

export class CommerceError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

type Fetch = typeof fetch;
interface Order { id: number; external_id: string; status: string }

async function printful<T>(path: string, key: string, request: RequestInit = {}, fetcher: Fetch = fetch): Promise<T> {
  const response = await fetcher(`https://api.printful.com${path}`, {
    ...request,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok || data.code !== 200) {
    // Do not expose provider payloads (which may contain customer information).
    throw new CommerceError("Printful request failed", response.status === 404 || data.code === 404 ? 404 : 502);
  }
  if (!data.result) throw new CommerceError("Printful returned an invalid response");
  return data.result as T;
}

function positiveId(value: unknown): number {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new CommerceError("Invalid product or variant ID", 400);
  }
  return Number(value);
}

export async function checkoutParams(form: FormData, origin: string, key: string, fetcher: Fetch = fetch): Promise<Stripe.Checkout.SessionCreateParams> {
  const productId = positiveId(form.get("product_id"));
  const variantId = positiveId(form.get("sync_variant_id"));
  const product = await printful<{
    sync_product: { id: number; is_ignored: boolean };
    sync_variants: { id: number; synced: boolean; is_ignored: boolean; name: string; retail_price: string; currency: string }[];
  }>(`/store/products/${productId}`, key, {}, fetcher);
  const variant = product.sync_variants?.find((item) => item.id === variantId);
  if (product.sync_product?.id !== productId || product.sync_product.is_ignored || !variant?.synced || variant.is_ignored) {
    throw new CommerceError("This product variant is unavailable", 400);
  }
  if (variant.currency !== "USD" || !/^\d+(\.\d{1,2})?$/.test(variant.retail_price)) {
    throw new CommerceError("Product price is not configured for USD checkout");
  }
  const amount = Math.round(Number(variant.retail_price) * 100);
  if (!Number.isSafeInteger(amount) || amount < 50 || !variant.name) {
    throw new CommerceError("Invalid product price or name");
  }
  return {
    payment_method_types: ["card"],
    mode: "payment",
    shipping_address_collection: { allowed_countries: ["US", "CA", "GB"] },
    shipping_options: [{ shipping_rate_data: {
      type: "fixed_amount",
      fixed_amount: { amount: 500, currency: "usd" },
      display_name: "Standard shipping",
      delivery_estimate: { minimum: { unit: "business_day", value: 5 }, maximum: { unit: "business_day", value: 7 } },
    } }],
    line_items: [{ price_data: { currency: "usd", product_data: { name: variant.name }, unit_amount: amount }, quantity: 1 }],
    metadata: { sync_variant_id: String(variantId), product_id: String(productId) },
    success_url: `${origin}/store/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/store`,
  };
}

export function orderReference(sessionId: string) {
  // Stable, short reference shared across workers, events, and retries.
  return createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
}

const submittedStatuses = new Set(["pending", "inreview", "inprocess", "partial", "fulfilled"]);

export async function fulfillSession(session: Stripe.Checkout.Session, key: string, fetcher: Fetch = fetch) {
  // Printful has no sandbox: never place real orders for Stripe test payments.
  if (!session.livemode || session.payment_status !== "paid") return;
  if (session.mode !== "payment" || session.status !== "complete") throw new CommerceError("Invalid checkout session", 500);
  const variantId = positiveId(session.metadata?.sync_variant_id);
  const shipping = session.collected_information?.shipping_details;
  const address = shipping?.address;
  if (!shipping?.name || !address?.line1 || !address.city || !address.postal_code ||
      !address.country || !["US", "CA", "GB"].includes(address.country) ||
      (["US", "CA"].includes(address.country) && !address.state)) {
    throw new CommerceError("Missing required shipping information", 500);
  }
  const reference = orderReference(session.id);
  const path = `/orders/@${reference}`;
  async function lookup() {
    try { return await printful<Order>(path, key, {}, fetcher); }
    catch (error) {
      if (error instanceof CommerceError && error.status === 404) return null;
      throw error;
    }
  }
  let order = await lookup();
  if (!order) {
    try {
      // Printful enforces external_id uniqueness; never use update_existing.
      order = await printful<Order>("/orders?confirm=1", key, {
        method: "POST",
        body: JSON.stringify({
          external_id: reference,
          recipient: {
            name: shipping.name, address1: address.line1, address2: address.line2 || undefined,
            city: address.city, state_code: address.state || undefined, country_code: address.country,
            zip: address.postal_code, email: session.customer_details?.email || undefined,
            phone: session.customer_details?.phone || undefined,
          },
          items: [{ sync_variant_id: variantId, quantity: 1 }],
        }),
      }, fetcher);
    } catch (error) {
      // Recover a concurrent creation or an order accepted before a timeout.
      order = await lookup();
      if (!order) throw error;
    }
  }
  if (order.status === "draft") {
    try {
      order = await printful<Order>(`${path}/confirm`, key, { method: "POST" }, fetcher);
    } catch (error) {
      const recovered = await lookup();
      if (!recovered || !submittedStatuses.has(recovered.status)) throw error;
      order = recovered;
    }
  }
  if (order.external_id !== reference || !submittedStatuses.has(order.status)) {
    throw new CommerceError("Printful order requires attention", 500);
  }
  return order.id;
}
