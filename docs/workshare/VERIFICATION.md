# Workshare migration verification

Verified on 2026-10-08 against the combined local working tree, including the
existing Swim Resources migration and calendar changes.

## Completed checks

| Check | Result |
| --- | --- |
| Workshare scoped ESLint | Passed, no warnings |
| Repository Next.js route generation and TypeScript | Passed |
| Workshare Functions TypeScript compilation | Passed |
| Workshare unit tests | 10 passed: hour accounting, historical credit, email normalization, reminder/DST windows, route boundaries |
| Workshare emulator suite | 16 passed, including the integrated browser scenario |
| Commerce tests | 12 passed |
| Swim Resources unit tests | 110 passed |
| Swim Resources scoped ESLint | Passed |
| Swim Resources Firestore/Storage rules tests | 19 passed |
| Calendar checks | 7 tests passed in each of three time zones |
| Combined `npm run build` | Passed, including the private-artifact check |
| Local production-build browser checks | Passed on desktop and mobile |
| `git diff --check` | Passed |

The Workshare emulator browser scenario covers family and administrator access,
denied administrator routes for families, invitations, single-use redemption,
revocation, replacement, cancellation, sign-out, OTP custom-token verification,
password sign-in, deep links, refresh, browser history, calendar/CSV downloads,
mobile navigation, and navigation between Tools, Swim Resources, and Workshare.
It also checks private-page metadata and uncaught browser errors. OTP email delivery
is mocked; verification uses the actual emulated callable.

The production-build browser check used a separate `.next-workshare-test` output
directory to avoid another process replacing the shared `.next` files. It checked
the login screen, desktop/mobile layout, Tools navigation, `noindex`, and an unknown
route's HTTP 404. This was a local production build, not a Vercel deployment.

Swim Resources' normal emulator ports were already occupied by another running
task. Its unchanged rules assertions passed with a temporary Vitest transform
substituting Firestore 8188 and Storage 9299, with separate hub/logging/websocket
ports. Existing emulator services were left running.

## Existing repository findings

Full-repository ESLint still reports 21 errors and 9 warnings in unchanged files.
There are no Workshare lint findings. Errors are in `scratch.js`,
`src/components/InstagramFeed.tsx`, `Leadership.tsx`, `VelocityInAction.tsx`,
`YouthDevelopment.tsx`, and `src/sanity/client.ts`. Warnings are in existing footer,
hero, lightbox, and product gallery components. These findings were not suppressed.

The dependency audit still reports existing Next.js/Sanity dependency-chain
advisories (25 production advisories at verification time). Dependency upgrades
outside the migration were not applied.

## Production status

- Both `www.aboutvelocityswimming.com` and `aboutvelocityswimming.com` were added
  to the existing `velocityworkshareportal` Firebase Authentication authorized
  domains. Existing domains and provider settings were retained.
- Workshare's public Firebase configuration is available locally under its
  dedicated environment-variable prefix.
- Functions source and Firestore rules are byte-identical to the source project.
  No Functions/rules deployment, account migration, record rewrite, or additional
  reminder schedule was performed.
- Vercel deployment is pending: the connected account receives HTTP 403 for the
  target project, and the local CLI has no authenticated account.
- Consequently, Vercel environment configuration, staging, fixture-based live
  verification, promotion, canonical-URL checks, and production runtime-log
  inspection have not been performed. Live Google sign-in and OTP email delivery
  also remain to be checked after deployment.

Continue with [the production cutover procedure](./DEPLOYMENT.md) once authorized
Vercel access is available. The production smoke-test script creates isolated,
tagged fixtures and cleans them up; it has not run against production during this
migration.
