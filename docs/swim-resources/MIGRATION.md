# Coach Cutter → Swim Resources

Migrated October 8, 2026 from the neighboring `coach-cutter` checkout at commit `3d5faed3f10c64da9864a58a5d5456fd93fe86f5` (`shift to data collection only`). This imports the current source snapshot, not its Git history. The source repository is preserved.

## Application and routes

The website and Swim Resources share one Next.js installation, server and production build. Existing website pages live in the `(site)` route group. The `(swim-resources)` group has its own root layout, CSS, metadata, and theme preference, preserving the imported interface. The original `/icon.svg` and `/opengraph-image` URLs remain available. The share image is served by a static route and referenced explicitly by the website metadata, so the independent tool layouts do not inherit an incorrectly resolved localhost image. Crossing between root layouts performs a full document navigation; Tailwind and global theme rules do not leak into the website. Other tools may have their own root layouts.

| Before, on the standalone app | Here |
| --- | --- |
| `/` | `/tools/swim-resources` |
| `/admin` and descendants | `/tools/swim-resources/admin` and descendants |
| `/attendance` and descendants | `/tools/swim-resources/attendance` and descendants |
| `/times` | `/tools/swim-resources/times` |
| `/standards/usa`, `/standards/champ` | Same suffix beneath `/tools/swim-resources` |
| `/athlete/[name]` | `/tools/swim-resources/athlete/[name]` |
| `/api/admin/imports/prepared` | `/api/swim-resources/admin/imports/prepared` |
| Root public assets | `/swim-resources/…` |

Internal navigation and assets use `src/features/swim-resources/lib/routes.ts`. Legacy admin redirects retain their query handling under the new prefix. The Tools card opens the retained landing screen; a return link goes back to Tools. Attendance retains the source application's redirect to its read-only collection viewer. This migration does not add new attendance behavior or redesign the screens.

The Firebase client uses the named app `velocity-swim-resources` so another tool's Firebase initialization cannot select its project accidentally. Collection names, document IDs, schemas, authorization rules, receipts, evidence semantics, and reviewed-write safeguards are preserved.

## Code and tools

| Concern | Location |
| --- | --- |
| Components, domain logic, Firebase services, types, standards data | `src/features/swim-resources/` |
| Collection and maintenance commands | `scripts/swim-resources/` |
| Unit/service and emulator rules tests | `tests/swim-resources/` |
| Developer guides and historical release/audit records | `docs/swim-resources/` |
| Browser extensions | `extensions/swim-resources/` |
| Images and icons | `public/swim-resources/` |
| Firebase rules, indexes and emulator configuration | Repository root |

Run commands from this repository root with Node 24:

```sh
nvm use
npm ci
npm run dev
npm run verify
npm run test:rules
node scripts/swim-resources/prepare-import.mjs --help
node scripts/swim-resources/collect-sources.mjs --help
```

`npm run verify` checks migrated-code lint, global TypeScript, the root regression command, and the production build/private-artifact check. `npm run lint` remains available for website-wide lint. The original website's baseline is **21 errors and 9 warnings**, recorded before this migration; these unrelated findings were not silenced.

The destination framework remains Next.js **16.2.12** and React **19.2.4**. Added dependencies share the root npm lockfile. Source dependency overrides are retained. The calendar added concurrently uses native `node-ical` loading through `serverExternalPackages`, avoiding a Temporal/BigInt bundling failure in the combined production build. Separately packaged Firebase functions stay outside frontend TypeScript checking.

For emulator UI development, use the synthetic settings in the root `.env.example` in a separate local environment; do not overwrite existing credentials. Start Auth, Firestore and Storage, then load rules for the named database:

```sh
firebase emulators:start --config firebase.emulators.json --project demo-cutter-coach --only firestore,auth,storage
FIRESTORE_EMULATOR_HOST=127.0.0.1:8088 node scripts/swim-resources/load-emulator-rules.mjs --project demo-cutter-coach --database velocity-v2
```

Firebase CLI 15.30.2 and Java 21+ are required for rule tests. The local prepared-file endpoint intentionally does not accept unsigned emulator authentication; use JSON input to exercise synthetic import review. Its authenticated filesystem behavior is covered by isolated endpoint tests.

The standards exporter uses the colocated tracked CSV and JSON; it requires Python with pandas. The old `get_times.mjs` helper is retained under `scripts/swim-resources/legacy/`, with its separate Playwright requirement documented. It is not part of the app or the evidence-backed import workflow. The companion extension retains its message protocol and adds the website's exact production origins; foreign window messages and misleading hostname matches are rejected.

## Local data and environment

The destination's existing commerce configuration was retained. Required Firebase and Google Calendar web settings were merged privately; unused OpenRouter credentials and obsolete `VITE_*` variables were not imported. As selected for this migration, the local tool targets:

- Project: `coach-cutter-ptolemy`
- Database: `velocity-v2`
- Evidence bucket: `coach-cutter-ptolemy-private-evidence`

The source checkout's environment had still selected the original default database and bucket, despite newer release documentation. The named database/bucket selection above is deliberate. No database records, cloud settings, deployed rules, authorized domains or CORS were changed. No frontend was deployed.

Two existing September 11 backup exports were copied into ignored `backups/` and verified byte-for-byte. The available billing export, scratch captures and historical CORS file were retained privately under `backups/legacy-coach-cutter/`. Copied private files have mode `0600`, with containing directories `0700`.

**Missing locally:** this source checkout had no project-qualified prepared imports, recent evidence captures, or release archives described in its October release records. Those historical documents are retained as context, not proof that their local files exist here. No missing material was reconstructed or downloaded. Future staging uses `backups/imports/<project>/<database>/` from this repository root.

Git ignores, upload exclusions, production tracing exclusions and the post-build private-artifact check cover the imported private files. No `.git`, `node_modules`, `.next`, service-account credential, or separate deployment link was imported. The source's default-project `.firebaserc` was not copied; maintenance commands still require explicit project/database targets. The historical wildcard CORS file is private reference material and is not a deployment configuration.

## Validation and remaining baselines

Completed checks:

- Clean root dependency installation; manifest and lockfile agree.
- 110 unit/service/migration tests, including native script loading, route/query preservation, extension origins, prepared-endpoint access protections, and Firebase app isolation.
- All 12 existing commerce regression tests.
- 19 Firestore/Storage emulator permission and workflow tests, including public/private boundaries, immutable captures, imports, reconciliation, receipts, reversal, and archive restoration.
- Strict migrated-code lint with zero warnings, global TypeScript, production build, and production file-trace exclusion of private data.
- Browser checks in a disposable copy using demo Firebase: desktop and 390-pixel mobile navigation, separate themes/styles, back navigation and refresh, anonymous coach gate, synthetic Google sign-in, collection filters and document routes, maintenance URL/search state, attendance redirects, public times/standards and athlete empty states. No page errors or horizontal page overflow in the completed checks.
- Browser JSON import review: preview made no writes and selected no rows; explicit apply changed the synthetic record and saved a receipt; guarded reversal restored the original record and marked the receipt reversed. The local prepared-file endpoint still rejects anonymous/emulated requests; signed-file access is tested through isolated SDK fixtures, without weakening its restrictions.
- Production HTTP checks: website/tool pages and original icon/share-image URLs return 200, the website share-image metadata uses its canonical HTTPS origin, the prepared-file endpoint returns private/no-store 404 in production, and streamed legacy redirects retain encoded identities and the new prefix.
- All mapped source application/support files accounted for; Firebase configuration/rules and copied backup exports match the source. Source Git status remains clean.

All verification writes use disposable demo Firebase projects; live data is untouched. Desktop/mobile screenshots and synthetic browser fixtures were kept in temporary local test storage, not in Git or public assets. The original website-wide lint findings and historical dependency advisories below remain separate from the passing migration checks.

The initial production dependency audit found **25** flagged packages (10 moderate, 14 high, 1 critical), compared with **27** (10 moderate, 16 high, 1 critical) in the original website lockfile. No newly flagged package names were introduced at that checkpoint. Existing Next.js/Sanity dependency findings remain; resolving them requires a separate dependency update, including the framework version deliberately retained here. CI reports the audit in a non-blocking step while lint, types, regression tests, build/private-file checks and emulator rules remain required.

Historical source audit/release claims describe that source snapshot and its earlier environment; they do not certify the combined website. Hosted sign-in/domain/CORS configuration and deployment remain separate release work.
