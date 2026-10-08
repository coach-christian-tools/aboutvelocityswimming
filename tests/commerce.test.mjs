import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const { checkoutParams, fulfillSession, orderReference } = await import(pathToFileURL(process.env.COMMERCE_MODULE).href);

function response(result, code = 200) {
  return Response.json({ code, result }, { status: code });
}
function form() {
  const data = new FormData();
  data.set("product_id", "123");
  data.set("sync_variant_id", "456");
  data.set("price", "0.50");
  data.set("product_name", "Forged name");
  return data;
}
function product(overrides = {}) {
  return { sync_product: { id: 123, is_ignored: false }, sync_variants: [
    { id: 456, synced: true, name: "Real shirt / M", retail_price: "29.99", currency: "USD", ...overrides },
  ] };
}
function session(overrides = {}) {
  return { id: "cs_live_example", livemode: true, mode: "payment", status: "complete", payment_status: "paid",
    metadata: { sync_variant_id: "456" },
    collected_information: { shipping_details: { name: "Swimmer", address: {
      line1: "123 Example St", city: "London", postal_code: "SW1A 1AA", country: "GB", state: null,
    } } }, ...overrides };
}
function order(status = "pending") {
  return { id: 100, external_id: orderReference("cs_live_example"), status };
}

test("checkout ignores forged prices and names and fetches uncached product data", async () => {
  const params = await checkoutParams(form(), "https://example.com", "test-key", async (url, init) => {
    assert.equal(url, "https://api.printful.com/store/products/123");
    assert.equal(init.cache, "no-store");
    return response(product());
  });
  assert.equal(params.line_items[0].price_data.unit_amount, 2999);
  assert.equal(params.line_items[0].price_data.product_data.name, "Real shirt / M");
  assert.equal(params.success_url, "https://example.com/store/success?session_id={CHECKOUT_SESSION_ID}");
});
test("malformed IDs are rejected before contacting the provider", async () => {
  for (const id of ["456x", "-1", "0", "9007199254740993"]) {
    const data = form(); data.set("sync_variant_id", id);
    await assert.rejects(checkoutParams(data, "https://example.com", "key", () => assert.fail("Unexpected fetch")));
  }
});
test("unknown, unsynced, ignored, and invalid-price variants cannot be purchased", async () => {
  for (const invalid of [{ id: 999 }, { synced: false }, { is_ignored: true }, { retail_price: "NaN" },
    { retail_price: "29.99junk" }, { retail_price: "0" }, { currency: "EUR" }]) {
    await assert.rejects(checkoutParams(form(), "https://example.com", "key", async () => response(product(invalid))));
  }
});
test("provider errors fail checkout", async () => {
  await assert.rejects(checkoutParams(form(), "https://example.com", "key", async () => response(null, 503)));
});
test("unpaid and test sessions never create physical orders", async () => {
  const fetcher = () => assert.fail("Unexpected Printful request");
  await fulfillSession(session({ livemode: false }), "key", fetcher);
  await fulfillSession(session({ payment_status: "unpaid" }), "key", fetcher);
});
test("GB shipping without a state creates and confirms a uniquely referenced order", async () => {
  let calls = 0;
  await fulfillSession(session(), "key", async (url, init) => {
    calls++;
    if (init.method !== "POST") return response(null, 404);
    assert.equal(url, "https://api.printful.com/orders?confirm=1");
    const payload = JSON.parse(init.body);
    assert.equal(payload.external_id, order().external_id);
    assert.equal(payload.recipient.country_code, "GB");
    assert.equal(payload.recipient.state_code, undefined);
    assert.deepEqual(payload.items, [{ sync_variant_id: 456, quantity: 1 }]);
    return response(order());
  });
  assert.equal(calls, 2);
});
test("missing shipping, postal code, or US/CA state fails instead of acknowledging", async () => {
  for (const country of ["US", "CA", "GB"]) {
    const value = session(); value.collected_information.shipping_details.address.country = country;
    if (country === "GB") value.collected_information.shipping_details.address.postal_code = null;
    await assert.rejects(fulfillSession(value, "key", () => assert.fail("Unexpected fetch")));
  }
  await assert.rejects(fulfillSession(session({ collected_information: null }), "key"));
});
test("repeat fulfillment reuses a submitted order without posting", async () => {
  const fetcher = async (_url, init) => { assert.equal(init.method, undefined); return response(order()); };
  assert.equal(await fulfillSession(session(), "key", fetcher), 100);
  assert.equal(await fulfillSession(session(), "key", fetcher), 100);
});
test("a create timeout is recovered through the stable external ID", async () => {
  let lookups = 0;
  assert.equal(await fulfillSession(session(), "key", async (_url, init) => {
    if (init.method === "POST") throw new Error("Timeout after acceptance");
    return ++lookups === 1 ? response(null, 404) : response(order());
  }), 100);
});
test("concurrent workers cannot create two orders", async () => {
  let stored = null;
  let posts = 0;
  const fetcher = async (_url, init) => {
    if (init.method !== "POST") return stored ? response(stored) : response(null, 404);
    posts++;
    if (stored) return response(null, 400);
    stored = order(); return response(stored);
  };
  assert.deepEqual(await Promise.all([fulfillSession(session(), "key", fetcher), fulfillSession(session(), "key", fetcher)]), [100, 100]);
  assert.equal(posts, 2);
});
test("existing drafts are confirmed; a confirmation timeout can be recovered", async () => {
  let lookupCount = 0;
  assert.equal(await fulfillSession(session(), "key", async (url, init) => {
    if (init.method === "POST") {
      assert.ok(url.endsWith("/confirm")); throw new Error("Timeout");
    }
    return response(order(++lookupCount === 1 ? "draft" : "pending"));
  }), 100);
});
test("provider failures and orders requiring attention propagate for webhook retry", async () => {
  await assert.rejects(fulfillSession(session(), "key", async () => response(null, 503)));
  for (const status of ["failed", "canceled", "onhold", "unknown"]) {
    await assert.rejects(fulfillSession(session(), "key", async () => response(order(status))));
  }
  await assert.rejects(fulfillSession(session(), "key", async (_url, init) =>
    init.method === "POST" ? response(null, 503) : response(null, 404)));
});
