## Unified backend and collection

The website and tools use Supabase (`hgsghjqefynhbavmkehv`). Firebase-specific guides below describe the archived migration history, not the active runtime.

- `/tools/workshare`: private households and commitments. Members are independent of Times athletes.
- `/tools/times`: public approved Inland Empire athlete profiles and race history, including meets outside the region.
- `/tools/knowledge`: approved meet, organization, venue, and document entries with source links.
- `/tools/review`: staff-only evidence and before/after review. Approve, hold, or decline a bounded batch. Approval checks for stale data and applies all changes atomically.

Staff access requires a verified account and either an explicit user grant in `public.administrators` or a verified email listed in `private.administrator_emails`. Team email domains alone do not grant staff access. Collector tokens cannot grant permissions or publish records.

Use Node 24. For synthetic local development: start OrbStack/Docker, run `supabase start`, `npm run seed:local`, then `npm run dev:local`. The local wrapper uses the ignored `supabase/.env.local`; ordinary `npm run dev` uses the configured hosted backend. Never seed production.

Run `npm run verify` for lint, types, unit/database tests, and production build. Before `npm run test:browser`, run `node scripts/unified/import-fixture.mjs`. `npm run test:collection:browser` verifies collection → hold → approval → public display against local synthetic data.

Current-machine collection uses the ignored, mode-0600 `.env.collection.local` (project URL, publishable key, `VELOCITY_COLLECTOR_TOKEN`). Run `npm run collection:stage -- backups/<batch>.json`. Each batch has `division`, `scope`, `sourceUrl`, `capturedAt`, `coverage`, `evidence`, and 1–100 `writes` (`path` and proposed `after` object), limited to 2 MB. The server captures current values for review. Repeated identical proposals retain their earlier decision. Missing records in a partial scrape are never treated as deletions. Revoke a worker through `private.collection_workers.revoked_at`.

No recurring crawler or email reminder schedule is enabled by this setup. Collection scope is requested manually; authenticated source browsing runs on this machine. Mac Mini operation is deferred. Configure Supabase custom SMTP with Resend and the code templates in `supabase/templates/` before opening family email sign-in. Legacy Firebase data requires a verified import; creating the hosted schema does not transfer it automatically.

---

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
