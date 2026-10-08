This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Store checkout and fulfillment

Set these server environment variables before running the store:

- `PRINTFUL_API_KEY`: store-scoped Printful token with product read and order read/write access.
- `STRIPE_SECRET_KEY`: Stripe secret key for the intended test or live environment.
- `STRIPE_WEBHOOK_SECRET`: signing secret for the webhook endpoint in that environment.
- `SITE_URL`: canonical public origin, for example `https://your-domain.com`. Set this in production so checkout redirects do not depend on request headers. Local development falls back to the request origin.

Configure Stripe to deliver `checkout.session.completed` and
`checkout.session.async_payment_succeeded` to `/api/webhook`.

Checkout reads the selected product and variant from Printful on the server;
only synced, non-ignored variants with a valid USD retail price are purchasable.
The current shipping policy remains USD 5 to the US, Canada, or Great Britain.

Paid **live** sessions create orders with `confirm=1`, submitting them for
Printful fulfillment and charging the configured Printful billing method.
Stripe test sessions never create Printful orders. The success page verifies
payment status but does not claim shipping or fulfillment completion.

Fulfillment hashes the Checkout Session ID into a stable Printful `external_id`.
Printful enforces uniqueness within the store, so repeated events, concurrent
workers, and timeouts recover the same order. Existing drafts with that reference
are confirmed; submitted orders are reused. Failed, canceled, or on-hold orders
return a webhook error and require investigation in Printful. Missing shipping
information and provider outages also return errors so Stripe can retry.

Before rollout, reconcile any previously paid sessions and existing Printful
orders manually. Orders created by the old implementation have no stable external
reference; replaying those historical events can create another order.

Run the isolated commerce regression suite with `npm run test:commerce`.
It mocks provider responses and never creates real payments or orders.

Provider references: [Printful Orders API](https://developers.printful.com/docs/#tag/Orders-API)
and [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment).
