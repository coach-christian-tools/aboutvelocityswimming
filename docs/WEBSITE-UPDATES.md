# Website update notices

Velocity now uses the same version-check approach as Champions Club, adapted to Next.js. It does not register a service worker or an offline application shell. There is no worker waiting to activate and no worker cache to purge.

## Build and release

Always use `npm run build`. `scripts/updates/build.mjs` generates one UUID and passes it to the complete Next.js build process. Next can evaluate its config in multiple workers, so generating random IDs directly in `next.config.ts` is not safe. The wrapper gives `.next/BUILD_ID`, the client bundle, the HTML `app-version` meta tag, and `/api/app-version` the same identity. Rebuilding the same commit makes a new identity. Starting or promoting the same built artifact does not.

Deploy the entire Next.js build together through the normal release process. No manual version bump is required. A bare `next build` fails with guidance to use the wrapper rather than producing mismatched versions.

The version endpoint is public, contains only the opaque build ID, and sends `Cache-Control: no-store, max-age=0`, `CDN-Cache-Control: no-store`, and `Vercel-CDN-Cache-Control: no-store`. Its requests use unique query strings, `cache: no-store`, no redirects, and a ten-second timeout. Next.js continues managing its HTML and content-hashed asset caching; the updater does not disable asset caching or change application/data caches.

## Browser behavior

Production clients check on opening, focus, return from the background, history restoration (`pageshow`), reconnecting, and every five minutes while visible and online. Checks are coalesced and throttled for ten seconds. The server ID is compared with the running client bundle, so rollbacks also trigger a notice. Invalid responses, HTML fallbacks, failures, and offline sessions leave the current page usable.

The notice offers **Update now** and **Later**. Later hides it for thirty minutes in that page. Update now opens a native accessible confirmation dialog, initially focused on **Keep working**. It explicitly warns that refreshing discards unsaved changes. Keep working or Escape dismisses the dialog without clearing fields or navigating.

**Refresh now** checks the current deployment again, then performs a full navigation to the same route with a unique `_velocity_update` query parameter. This bypasses stale HTML and the in-memory Next router cache. The parameter is removed when the new page mounts, preserving the other query parameters, hash, and Next history state. The success notice appears only if the requested build actually loaded. There is no automatic reload or automatic retry loop.

Cookies, local/session storage, IndexedDB, browser cache entries, and sign-in credentials are never cleared. The updater does not copy form values, credentials, or files into persistence.

## Safeguards for work in progress

A shared reference-counted hold prevents updating during overlapping saves or other protected operations. The updater checks holds both before and after the final metadata request. Successful navigation keeps the confirmation buttons locked until the page changes; returning through browser history releases the navigation latch.

Protected operations include:

- Entire shared data transactions, including reads before the write.
- Workshare invitation/callable actions.
- Sign-in initialization, password/Google sign-in, sending/verifying email codes, and sign-out.
- Collection review, moderation, and meet-queue mutations.
- Native store checkout submission, including duplicate-submit prevention.
- Attendance edits and saves, including failed saves that leave an unsaved draft.

This is not a universal draft-saving system. Other forms rely on the explicit discard warning, and the user must save them or choose Keep working. Updates never happen solely because a newer version was detected.

New async workflows should use `withUpdateHold(async () => { ... })` from `src/lib/update-safety.ts`. For existing React dirty/busy state, use `useUpdateBlocker(active)` from `src/hooks/useUpdateBlocker.ts`. Acquire synchronous holds at the start of mutation handlers when a race with navigation matters; release in `finally`. Redirecting operations retain their hold until navigation/history restoration.

## Verification

`npm run test:updates` covers deployment/rollback detection, coalescing/throttling, Later timing, offline/invalid responses, timeout aborts, disposal, lifecycle events, URL/history preservation, and concurrent/rejected holds. It is included in `npm test`.

For a real two-build browser regression:

1. Use Node 24. Run `npm run build` for build A.
2. Run `VELOCITY_TEST_BUILD=true npm run build` for build B.
3. Run `npm run test:updates:browser`.

The test starts two local Next servers and a local switchable proxy. All external browser requests are blocked. OTP failures are intercepted locally and never send email or reach Supabase. Tests cover desktop Chromium and Android Chrome emulation, including actual A-to-B navigation, Later, Cancel/Escape, offline/failed checks, pending OTP and an action beginning during the final update check, navigation locking, URL/filter/hash preservation, cookie/local/session/IndexedDB preservation, success confirmation, and no repeat prompt. Screenshots are written to the ignored `backups/update-verification/` directory.

The first rollout cannot notify an already-open tab that predates this feature. That tab needs an ordinary refresh once. Later releases are detected automatically. Sleeping/offline browsers check when they return online and foreground. A deployment-specific preview URL only sees its own deployment.

Before publishing, verify on the final production hostname that the meta ID matches the endpoint and `.next/BUILD_ID`, that the endpoint is uncached, and that an already-open prior release gets the notice. Physical iPhone Safari and installed home-screen behavior still require device checks; Chromium emulation is not Safari verification.

## Implementation check results

- Final secret scan, repository lint, TypeScript generation/checking, and all unit/regression suites passed, including the update monitor, auth-safety lifecycle, and checkout recovery tests.
- Two final production builds passed, including private-artifact checks. The local browser suite passed on both desktop Chromium and Android Chrome emulation, with matching build/HTML/endpoint IDs.
- `npm run verify` was run but could not complete its database stage: the installed Supabase CLI reported `No such container: supabase_db_aboutvelocityswimming`. No database assertions ran. The service already using the local API port was left untouched. Restore this repository's intended local stack before rerunning the database suite.
- At implementation-check time, no push or deployment had been performed. Production hostname, physical iPhone Safari, and home-screen checks are part of the release checklist.
