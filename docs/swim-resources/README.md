# Swim Resources (migrated from Cutter Coach)

Velocity Swimming’s coaching portal: shared read-only Firestore admin viewers, reviewed data imports, public best times/standards, and a separate attendance app. Built with Next.js 16, React 19, TypeScript and Firebase.

## Local development

Use Node 24 (`.nvmrc`) and install the locked dependencies:

```sh
nvm use
npm ci
cp .env.example .env.local
```

The example configuration uses a `demo-` Firebase project and local Auth/Firestore emulators. Keep existing real-environment configuration separate; do not overwrite it when switching environments. Emulator mode requires `localhost` or `127.0.0.1` and refuses a real project ID.

Install Firebase CLI 15.30.2 and Java 21 or later, then use two terminals:

```sh
firebase emulators:start --config firebase.emulators.json --project demo-cutter-coach --only firestore,auth,storage
```

```sh
npm run dev
```

Emulator data is synthetic and temporary unless explicitly exported. Auth runs on port 9099 and Firestore on 8088. Storage uses port 9199. Load named database rules with `scripts/swim-resources/load-emulator-rules.mjs` before using `velocity-v2`; see the fresh-dataset guide. Google Calendar is not emulated. Never use real athlete data in emulator fixtures. Public Firebase web settings use `NEXT_PUBLIC_FIREBASE_*`; the older `NEXT_PUBLIC_ATTENDANCE_FIREBASE_*` names remain a compatibility fallback. `VITE_*` settings are no longer supported.

Collection happens in Codex. The application validates structured batches and applies only coach-selected changes. There is no embedded AI client, paid model configuration, or chatbot API route. See [the import workflow](IMPORT-WORKFLOW.md) and [pilot status](COLLECTION-PILOT.md).

## Checks

```sh
npm run verify       # migrated-code lint, TypeScript, both test suites, production build
npm run test:rules   # isolated demo Firestore/Storage emulators; requires Firebase CLI and Java
npm audit --omit=dev --audit-level=high
```

`test:rules` starts/stops its own emulator; stop any emulator using port 8088 first. GitHub Actions runs these checks with Node 24 and synthetic Firebase settings. Unit/service tests use fixtures, never a live project. Emulator rules tests exercise actual public and coach permissions.

The source project recorded a clean production dependency audit on 2026-10-05; that historical result does not certify this combined application. The development audit still reports the unpatched `braces` advisory through Next’s lint plugin; details and its review conditions are in [the remediation report](TECH-DEBT-REMEDIATION.md). Do not use `npm audit fix --force` to downgrade Next’s lint configuration across major versions.

## Data boundaries

- `athletes/{id}` contains private demographics, contact details, groups and coach notes. Only verified `@velocity-swimming.com` coaches can access it.
- `public_athletes/{id}` contains an explicit public projection: ID, first/last/preferred name, aliases and optional Swimcloud ID. Public profile pages query this collection.
- `athletes/{id}/bests` and `standards` remain public. Other application collections are coach-only.
- Athlete CRUD uses `src/features/swim-resources/lib/services/athletes.ts` to preserve omitted fields and publish both documents in one transaction. Roster batch edits use the same canonicalization and safe projection.
- Swim imports require actual race metadata and verified demographics. They rebuild best times and record boards, replacing stale maps and deleting vanished projections. Reviewed batches validate each row before applying selected changes.
- Import receipts, review acknowledgments, and refresh state are coach-only. Receipts preserve previous values; guarded reversal refuses to overwrite later edits.
- Retired `chatbot_conversations` and message descendants deny new writes. The cleanup script permanently removes inline and descendant history after checking the deployed write barrier.

Use domain helpers for names/status/groups, calendar dates and swim times. Keep UI presentation separate from persistence. Admin collections use one read-only table/document viewer configured in `src/features/swim-resources/lib/domain/data-viewer.ts`; Import is the only admin write interface. Public pages and the separate `/tools/swim-resources/attendance` app retain their behavior. Use `/tools/swim-resources/admin/map` to explore collection relationships, storage roles and simplification candidates. See [the admin interface](UI-FOUNDATION.md).

For the original database, the bundled standards source is `src/features/swim-resources/lib/data/raw-standards.json`. Public standards pages and `scripts/swim-resources/import-standards.mjs` read that same file. To regenerate it from the tracked standards CSV, run `python3 scripts/swim-resources/export_standards.py` with pandas installed; review the JSON diff before importing. The exporter and import script resolve the data path relative to their own files.

## Connected information

`teams`, `people`, `venues`, `meets`, and `documents` use stable IDs and ordinary viewer links. People are private contacts; an optional `athleteId` connects a person to the canonical athlete profile. Documents link source URLs and entities; fresh immutable captures and revisions are stored privately in Firebase Storage. See [the entity model](ENTITY-MODEL.md).

Missing ownership on team-specific records resolves to `velocity-swimming` (Velocity Swimming). Host teams, venue identities, and outside contacts are separate facts and are never inferred from that ownership. Team equality filters query stored IDs, so existing records need the backfill before they appear in those filtered results.

## Maintenance and release

Maintenance scripts use the Admin SDK with Application Default Credentials or `--key <service-account.json>`. `--firebase-cli` can reuse an existing verified Velocity login with Firebase CLI 15.30.2. They require explicit `--project <id>` and `--database <id>`, default to a read-only dry run, and require `--apply`, `--confirm-project <id>` and `--confirm-database <id>` for writes. The roster script always stages JSON and refuses direct writes. Credentials and backups must stay outside version control.

```sh
node scripts/swim-resources/migrate-public-profiles.mjs --help
node scripts/swim-resources/update-roster.mjs --help
node scripts/swim-resources/cleanup-ptolemy.mjs --help
node scripts/swim-resources/import-standards.mjs --help
node scripts/swim-resources/backfill-entity-links.mjs --help
node scripts/swim-resources/delete-swimmers.mjs --help
```

The legacy profile migration publishes existing athletes’ public profiles in the original database. Use `--profiles-only` to leave private athlete documents untouched. Before a fresh release, follow [the separate release actions](FRESH-DATASET.md#separate-release-actions). A frontend deploy does not deploy Firestore rules. Deployment requires separate coach authorization.

Local athlete exports (`db_*.json`), billing exports, service-account keys and `backups/` are ignored. Removing an export from the current checkout does **not** remove earlier copies from Git history. Historical cleanup requires a coordinated, separately approved rewrite.

`AUDIT.md`, `AUDIT-ADMIN.md` and `BATCHES.md` are historical snapshots. Use the current remediation report and checks to assess this checkout.

Agents must read the installed Next.js guides in `node_modules/next/dist/docs/` before changing framework behavior, as specified in the repository root `AGENTS.md`.

## Fresh dataset

[The fresh dataset guide](FRESH-DATASET.md) covers named-database configuration, private evidence, manual collection/reconciliation, v2 imports, full archival/restoration and separate release gates. The [October 7 release record](releases/2026-10-07-fresh-dataset.md) tracks the provisioned production dataset and local cutover; hosted frontend cutover remains separate. No old records are copied into `velocity-v2`.
