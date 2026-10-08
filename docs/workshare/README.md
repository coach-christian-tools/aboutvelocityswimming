# Workshare

The family and administrator portal is served by Next.js at `/tools/workshare`.
Its React Router routes and Firebase data model are preserved from
`velocityworkshareportal` (source commit `7671780`). The original repository and
Firebase deployment are retained for reference and rollback.

## Boundaries

- Frontend: `src/features/workshare`; browser-only entry point under the separate
  `(workshare)` root layout. Navigation between root layouts loads a fresh document,
  isolating public-site, Swim Resources, and Workshare styles.
- Backend: `firebase/workshare/functions`, with its original package lock and Node
  20 deployment runtime. The website uses the repository's Node 24 runtime.
- Production Firebase project: `velocityworkshareportal`, default Firestore database.
- Named browser Firebase app: `velocity-workshare`. This intentionally has a separate
  login session from Swim Resources and does not use its Firebase environment settings.
- Firestore rules, callable names, OTP behavior, and scheduled reminders are unchanged.
  Moving the source does not require a Functions or rules redeployment.

The base path supports the dashboard, `login`, `guest`, `logs`, `jobs`,
`admin/families`, `admin/families/:familyId`, `admin/roster`, and `admin/settings`.
Unknown paths return a 404 on direct requests. Invitations use
`/tools/workshare/guest#token=...`; never log invitation tokens. All Workshare pages
are marked `noindex`. Database rules and callable authorization enforce access;
route guards are only the user interface.

## Setup

```sh
nvm use
npm ci
npm ci --prefix firebase/workshare/functions
```

Set the `NEXT_PUBLIC_WORKSHARE_FIREBASE_*` web settings from `.env.example` in
`.env.local` and in the intended Vercel environment. These are public Firebase web
configuration, not server credentials. Existing Swim Resources and commerce settings
must be retained. Never put `RESEND_API_KEY` or administrator credentials in public
variables. Resend settings remain in the existing Firebase Functions environment.

`npm run dev` uses the explicitly configured backend, which may be production.
For isolated development use two terminals:

```sh
npm run emulators:workshare
npm run dev:workshare -- --port 3001
```

The development wrapper replaces Workshare's settings with emulator-only values.
The demo project is `demo-velocityworkshare`, with Auth on 9098, Firestore on 8089,
Functions on 5002, hub on 4402, and emulator logging on 4502. These do not overlap
Swim Resources. Emulator mode requires a demo project, a localhost browser, and a
development build. It refuses production use. Java 21+ is required for Firestore.

## Verification

See [the migration verification record](./VERIFICATION.md) for completed checks and
the remaining production cutover steps.

```sh
npm run verify:workshare
npx playwright install chromium
npm run test:workshare:emulators
npm test
npm run test:calendar
npm run build
```

The emulator suite checks callable authorization, privacy, invitation concurrency,
capacity, cancellation, verified-email requirements, and the browser's family/admin
flows. Browser checks include OTP custom-token verification (email delivery mocked),
downloads, mobile navigation, deep links, history, sign-out, and crossing tool layouts.
It starts a separate Next.js development build in `.next-workshare-test` on port 5179
and cleans up the server. Tests use synthetic data and send no email.

Workshare lint is independently enforced. The public site's previously existing
lint errors are not suppressed by this migration. Backend generated code and
backend dependencies are excluded from Next.js type checking and source uploads.

## Backend operations

Run only the intended operation from the repository root:

```sh
npm run build:workshare:functions
npm run deploy:workshare:functions
npm run deploy:workshare:rules
```

The deployment wrapper fixes both the configuration directory and production
project. It cannot deploy Firebase Hosting or the Swim Resources backend. Do not
run an unqualified Firebase deployment from the repository root for Workshare.

The retained `scripts/workshare/configure-invitation-endpoints.mjs --production`
script is an exceptional transport repair, not a migration step. It changes the
seven invitation service invoker configurations and can generate Cloud Run revisions;
use only when needed and authorized. Its handlers still enforce application access.
