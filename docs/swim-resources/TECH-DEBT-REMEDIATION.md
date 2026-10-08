# Tech debt remediation — 2026-10-05

This is a historical validation record. Ptolemy was subsequently removed from the local application on 2026-10-06; use [the import workflow](IMPORT-WORKFLOW.md) for the current release and history-cleanup sequence.

The audit’s actionable code findings have local fixes and regression coverage. Privacy enforcement on a live project still requires publishing public profiles, deploying the rules, and releasing the updated frontend. No live database, deployment or Git history was changed during this work.

## Findings and disposition

| Finding | Local change | Evidence and remaining work |
| --- | --- | --- |
| Private athlete documents were publicly readable | Private root documents are coach-only. Public pages use a separate allowlisted projection; updates publish both atomically. | `firestore.rules`, `src/features/swim-resources/lib/domain/athlete.ts`, `src/features/swim-resources/lib/services/athletes.ts`; actual rules emulator tests. **Release required.** |
| Vulnerable dependencies | Next / its lint configuration upgraded to 16.3.8, Firebase packages updated, transitive gRPC/UUID versions constrained, Vitest updated. | Production audit is clean. **Upstream development advisory remains**, described below. |
| Athlete export tracked in Git | Removed `db_athletes.json` from the versioned tree, preserved its local copy in ignored `backups/`, ignored future exports and backups. | **Historical copies remain until a coordinated history cleanup.** No names or DOBs copied into tests or reports. |
| Bulk athlete upserts erased omitted demographics and duplicated retries | Shared canonicalization preserves DOB, gender, nested contact siblings, group tenure and creation metadata. Existing legacy/canonical names resolve to the same identity; ambiguous matches reject. New import identities are stable across simultaneous retries. | `src/features/swim-resources/lib/services/athletes.ts`, `src/features/swim-resources/lib/services/import-tools.ts`; tests cover omitted fields, legacy names, repeated/concurrent imports and ambiguity. |
| Chat import template emitted an invalid swim schema | Prompt requests canonical fields and actual ages/meet data. All swims validate before writes. Generic writes to athlete/swim/projection collections are blocked. | `src/features/swim-resources/lib/chatbot/protocol.ts`, `src/features/swim-resources/lib/domain/swim.ts`; malformed-batch regression tests. |
| Imports/deletions left stale best times and records | HTML imports refresh projections. Rebuilds replace event maps, delete vanished boards and prune bests even after an athlete’s final swim is deleted. Empty swim clears also repair old projections. | `src/features/swim-resources/lib/services/swim-projections.ts`; last-swim deletion and stale-board tests. Rebuild live projections after release. |
| Canonical status disagreed with legacy location | Attendance and records derive status from the shared normalizer; canonical status wins. Athlete writes remove legacy mirrors. Roster edits publish canonical data and public projections together. | `src/features/swim-resources/lib/domain/athlete.ts`, `src/app/attendance/services/db.ts`, roster persistence; migration normalizes existing status. |
| Chat history exceeded one Firestore document and swallowed failures | Summary documents contain no message history. Messages have a size check and their own documents. Revision publication prevents incomplete saves from replacing readable history. Ordered queues recover after failure; UI exposes retries and disables sending when history failed to load. | `src/features/swim-resources/lib/services/chatbot-conversations.ts`; >1 MiB history, later-chunk failure, legacy migration, queue recovery and deletion tests. Oversized individual messages reject clearly. |
| Lint debt and no regression/CI gate | All lint errors and warnings removed without disabling rules. Added TypeScript, Vitest, actual Firestore permission tests and GitHub Actions gates. | `package.json`, `tests/`, `.github/workflows/verify.yml`. |
| Duplicate time formatting produced `1:60.00` | Shared parser/formatter rounds to centiseconds before splitting minutes. Import, analysis, standards, meet and Swimcloud consumers reuse it. | `src/features/swim-resources/lib/domain/swim-time.ts`; minute/hour carry and invalid-input tests. |

Follow-up cleanup also removed unused patch scripts and backup source files, centralized group formatting, removed obsolete Vite environment handling, replaced the starter README, added safe emulator configuration and maintenance-script targeting, and split meet state, chat protocol/tool rendering, and roster note editing out of their large views. These views still have substantial presentation markup; the extraction does not claim that their entire design has been rewritten.

Browser verification found an additional meet-save bug: blank optional fields were sent as `undefined`, which Firestore rejects. Meet persistence now cleans the payload, clears optional values when removed, preserves unrelated metadata/creation time and validates dates. Its service has a regression test.

## Validation

- `npm run verify`: lint with zero warnings, TypeScript, regression tests and production build.
- `npm run test:rules`: actual Firestore emulator tests for anonymous/coach access, verified email/domain checks, safe public writes, and private chat descendants.
- `npm audit --omit=dev --audit-level=high`: production dependency gate.
- Local browser: home, synthetic public athlete profile, authenticated athlete nickname/status editing, meet creation/event editing, and roster/chat UI checks. All writes use `demo-cutter-coach` Auth/Firestore emulators. No live login or paid-model call.

The final validation record is listed at the end of this report.

## Unpatched development dependency

The full dependency audit reports five high-severity package entries from one advisory, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): `braces` and the packages depending on it (`micromatch`, `fast-glob`, `@next/eslint-plugin-next`, `eslint-config-next`). The advisory and registry currently provide no patched `braces` release. This dependency is confined to development lint tooling in this application; it is not in the production dependency tree. Its deeply nested pattern input can terminate a Node process.

Keep the current supported Next lint configuration, run tooling only on trusted repository patterns, and inspect full audit results when updating dependencies. Replace the affected chain when a compatible patched release becomes available. The production audit stays a hard CI gate; the full development audit is not described as clean. Downgrading `eslint-config-next` to version 14 or hiding the advisory is not a fix.

## Real-environment release checklist — pending approval/execution

1. Select the exact Firebase project and frontend environment. Review a dry run: `node scripts/swim-resources/migrate-public-profiles.mjs --project <id>` with authorized Admin credentials. Check counts and resolve incomplete names; the script reports no athlete identities. Account for external import/sync writers that are not present in this repository: they also need to maintain `public_athletes` safely.
2. Schedule the cutover and pause athlete edits/imports from old clients while taking a private backup and publishing profiles. Apply with `--project <id> --apply --confirm-project <id>`. The migration writes a local backup with owner-only permissions. Retain it securely for rollback; do not commit it.
3. Prepare the updated frontend deployment. Deploy rules with `firebase deploy --project <id> --only firestore:rules`, then promote the matching frontend promptly. Old public pages read `athletes` and will fail once the new rules are active; new pages cannot read profiles under the old rules. Coordinate these steps in one cutover rather than deploying rules in isolation.
4. Validate anonymous access: private athlete get/list must fail; safe public profiles, bests and standards must load. Validate verified coach CRUD, roster group moves and saved chat history. Confirm deployment public environment variables point to the selected project and emulator mode is disabled.
5. Rebuild best times/records with the authorized coach tool. Review existing ledger data separately: the fixes do not infer/correct historical fabricated ages, duplicates or invalid imports automatically. Confirm representative profiles and record boards against known swims.
6. Resume edits only after the release passes. For rollback, retain a frontend that understands `public_athletes` and message subcollections. Do not restore the old public-read rule on private athlete documents. Old chat code cannot read migrated message storage; use the fixed persistence service in any rollback.

## Historical export cleanup — pending separate approval

The original export’s local copy is preserved in ignored `backups/db_athletes.json`. The current diff removes the tracked copy, but earlier commits, clones and any remote copies can still contain it. Coordinate removal with repository owners: securely back up required work, rewrite the export path across relevant refs using an appropriate history-cleaning tool, review the sanitized result, and explicitly approve any force push. Collaborators must replace affected clones; deleting the current file alone is insufficient. No history rewrite or force push was performed here.

## Final validation record

All checks below passed locally on 2026-10-05 with Node 24.21.0:

- `npm run verify`: zero lint errors/warnings; TypeScript passed; **28 regression/maintenance tests passed** across three files; Next.js 16.3.8 production build passed for all 21 pages/routes.
- `npm run test:rules`: **5 Firestore permission tests passed**, and the isolated emulator shut down cleanly.
- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilities**. The full audit retains the five development package entries from the single unpatched advisory above.
- `git diff --check`: passed. The original athlete export is preserved locally, ignored by Git and restricted to owner read/write permissions.
- Browser and actual emulator data: public profile and bests rendered; nickname/status edits preserved DOB and synchronized only safe public fields; meet creation with empty optional fields saved; paired events and the rounded `2:00.00` cut persisted; roster filtering/note editing rendered; legacy chat history loaded; the import template used `bulkUpsertSwims` without the generic-write bypass. No browser errors appeared after reloading the corrected meet code. Browser and dev/emulator processes were stopped afterward.
- Maintenance migration dry run against synthetic emulator data completed and reported counts/field names only. Maintenance script help and missing/mismatched write-target checks passed without connecting to live services.

Hosted Firebase configuration, external sync writers, live-data migration, paid-model execution, Storage uploads and remote deployments were not validated or changed. The local fixes and evidence are ready for release review; those boundaries remain explicit.
