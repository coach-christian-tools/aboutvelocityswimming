# Velocity Swimming

The public website and Swim Resources share one Next.js app and one npm installation. Use Node 24 (`nvm use`), then `npm ci` and `npm run dev`. The website is at `/`; open Swim Resources from `/tools` or directly at `/tools/swim-resources`.

Swim Resources includes the imported coaching portal, public times/standards, attendance, reviewed imports, and evidence-maintenance tools. Its code is isolated under `src/features/swim-resources`; scripts and tests are grouped under their own `swim-resources` directories. The separate website/resource root layouts preserve their existing styles and themes, with full page loads when crossing between them.

See [the migration record](docs/swim-resources/MIGRATION.md) for the source snapshot, local data continuity, route mapping, and validation. See [the resource developer guide](docs/swim-resources/README.md) and [fresh dataset workflow](docs/swim-resources/FRESH-DATASET.md) for collection and Firebase emulator commands. Run all maintenance commands from this repository root.

Use `.env.example` for a new synthetic environment; do not overwrite an existing `.env.local`. The local migration retains commerce settings and uses the current Swim Resources dataset. Secrets and private evidence remain ignored.

Checks: `npm run verify` runs strict migrated-code lint, global TypeScript, commerce and resource regression tests, and a production build with private-file checks. `npm run test:rules` runs the Firestore/Storage emulator suite (Firebase CLI 15.30.2 and Java 21+). `npm run lint` still checks the whole website and includes its pre-existing lint findings.

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

## Workshare

The family and administrator portal now lives at `/tools/workshare`, using the
existing Workshare Firebase project. See [setup and verification](docs/workshare/README.md)
and the [production cutover runbook](docs/workshare/DEPLOYMENT.md).
