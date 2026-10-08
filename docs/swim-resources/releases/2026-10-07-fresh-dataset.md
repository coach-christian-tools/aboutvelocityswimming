# October 7 fresh dataset release

The user authorized the release after refreshing Firebase CLI authentication. Production data is now isolated in `coach-cutter-ptolemy / velocity-v2`, a native Standard database in `nam5` with deletion protection enabled. Authentication remains in the existing project.

## Archive and rollback

The original database was exported with all subcollections, including documents beneath missing parents. Three exports agreed on 4,407 documents across the root collections and 57 populated subcollections. The complete fingerprint is `01816748c9ca1abc8e54f28ebfc9612bcf28ad7b5fdc24f00e619f8717867b6c`.

The exact manifest was restored in an empty disposable emulator database and reproduced that fingerprint. No Firebase or GCS file references were found in the exported records. Separately, 81 existing local import artifacts, comprising 77 distinct byte captures, were preserved and verified by downloading the private cloud copies. Archived captures are retained as historical material and never promoted to freshly verified evidence.

The private bucket is `coach-cutter-ptolemy-private-evidence`, with uniform bucket-level access, enforced public-access prevention, object versioning and no automatic retention deletion. Immutable evidence has attachment disposition and no Firebase download tokens. Anonymous Firebase and GCS archive downloads returned 403. Storage rules permit only verified Velocity coaches to read archives and deny client writes. Firestore rules and indexes were deployed only to `velocity-v2`; the original rules release remains unchanged.

Private manifests and detailed verification reports live under `backups/releases/2026-10-07/`. The database archive lives under `backups/archives/coach-cutter-ptolemy/(default)/archive_1791400179884/` and the corresponding private `legacy-archives/` cloud prefix. None of these artifacts belongs in a frontend release or version control.

## Initial population

| Collection | Records |
| --- | ---: |
| Teams | 2 |
| People / contacts | 9 |
| Venues | 3 |
| Upcoming meets | 3 |
| Documents | 5 |
| Sources | 9 |
| Field-scoped bindings | 45 |

The 22 business records were accepted through the authenticated client's reviewed Import workflow, in dependency order: Velocity identity, directory and venues, meets, documents, then backlinks. Sources include freshly captured official Velocity pages, authoritative meet packets retrieved from work email, current official standards PDFs, a minimal private correction-email excerpt, and the user's manual team identity/ownership declaration. Both original and revised Cougar Fall Fury PDFs remain available as exact revisions. Each import has receipts and evidence history.

A live recheck of the official home page confirmed three existing field scopes without changing facts or fact-change dates. Retrieval alone is never fact verification. A regression exposed mixed manual/external evidence losing the external check date; the fix preserves field origins and successful dates regardless of evidence order. A subsequent reviewed check of all 22 records repairs their provenance without changing stored facts or fact-change dates. Earlier receipts remain intact.

## Deliberately incomplete data

The current roster was populated in the GoMotion follow-up below. September registration emails and the archived export were not accepted as current membership evidence. New verified races have not been imported, so bests and records remain empty. Historical results, attendance, goals, film sessions and analytics remain in the original archive.

The current USA Swimming motivational and Western Zone Sectionals PDFs are document records. Structured standard sets remain empty until their required effective and expiration dates are verified. The Very Scary packet's printed deadline timezone is ambiguous; only its date was imported. The later Fall Fury email corrects an older entry-file limit and leaves possible final-heat splitting undecided. These questions remain open in Import review items; no event schedule or qualification claims were invented.

## GoMotion roster and committee follow-up

After the user signed in to GoMotion, the Active, non-deleted member view supplied a fresh 119-account export. Only nine roster fields were selected. Medical information, parent contacts, addresses, financial details and account notes were excluded. The original XLSX and a lossless CSV transcription were retained privately with content hashes. The XLSX reports an incorrect worksheet dimension; extraction checked its full 120 rows, including the header, rather than trusting that dimension.

The member table supplied stable GoMotion IDs, corroborated against a member detail heading and its Copy ID control. Exact name, roster group and membership location matched all 119 accounts to the export, including a person with separate staff and swimmer memberships. Six staff accounts and nine unregistered swimmers were excluded from the fresh athlete population. No membership status changed in GoMotion.

Five reviewed Import batches accepted 104 swimmers: 102 marked In Water and two on leave of absence. Each new athlete has the verified member ID, real date of birth, gender, current group, source-supported status and the user's manually approved Velocity ownership. Canonical aliases and group-assignment metadata are generated by the existing persistence service. Public profiles contain only the established projection fields; source captures and private roster fields remain outside those projections.

The committee follow-up added six contacts and two supporting documents, with eight reviewed link updates connecting the committee to the Very Scary and Christmas Open meets. Only relevant private email excerpts and the committee attachment were archived. Unconfirmed timing and lane proposals remain review questions; existing meet dates, deadlines, sanction and venue facts were preserved.

Current population after these imports:

| Collection | Records |
| --- | ---: |
| Teams | 2 |
| People / contacts | 15 |
| Venues | 3 |
| Upcoming meets | 3 |
| Documents | 7 |
| Athletes | 104 |
| Public profiles | 104 |
| Sources | 19 |
| Field-scoped bindings | 284 |

Roster facts and member identities use separate source scopes, with 75 and 29 swimmer bindings per scope, staying below the reconciliation limit of 100. The 208 scoped unchanged observations accepted no fact changes. Source checks and record provenance retain exact capture pointers, field coverage and separate check/change dates. Private captures, review manifests, prepared batches and verification reports live under `backups/imports/coach-cutter-ptolemy/velocity-v2/followup-20261007/` and remain excluded from Git and frontend uploads.

Live verification matched every proposed roster field and accepted evidence pointer, confirmed complete receipts for all eight follow-up batches, and checked committee relationships and preserved meet facts. All 11 new capture entries downloaded with matching hashes and no public download tokens. Anonymous private athlete and archive requests returned 403. Public projections passed their field allowlist; swims, bests, records, standards and historical coaching collections remain empty. The fresh dataset fingerprint is `2e06666b63dcc404ffeb4f362f1f2a3b36182ecf4cdb8b9bca9e1c7c5035e58e`.

Browser checks covered the 100/4 pagination split, exact athlete lookup, a two-row leave-of-absence filter that resets pagination, evidence dates, an empty best-time subcollection, and desktop/mobile layouts. These were data-only updates to the deployed database; the prior 80-test verification and 17 emulator rule tests remain the application integration checkpoint. No frontend rebuild or deployment was needed for this follow-up.

A checkpoint after viewing and Refresh compared all 2,316 stored documents and collection-group counts against that fingerprint. No records changed and no counted documents were added or removed.

## Evidence maintenance follow-up

The manually invoked October 7 standards checks downloaded the official motivational and Western Region Sectionals PDFs again. Both hashes matched the earlier verified archive bytes. Reconciliation accepted two unchanged document observations, advanced only their covered field/scope verification dates and retained fact-change dates. Exact effective/expiration dates remain unverified. The Sectionals document has separate spring and summer tables, different meet dates and inconsistent printed summer time notation (including `58:61` for men 100 Fly SCM); neither validity dates nor questionable values were guessed. Structured standards remain empty.

Seven evidence-linked review questions were added to four private provenance records: motivational validity, Sectionals validity, Sectionals printed notation, Very Scary deadline zone, Very Scary start time, lane/session format, and Fall Fury final-heat splitting. The final-heat question references the October 5 correction email; the original packet and tentative October 6 planning correspondence remain exact separate evidence. No meet dates, deadlines, sanctions, roster, race, contact or venue facts were changed. Questions are audit annotations, never accepted fact observations; immutable events retain their history.

The local `/tools/swim-resources/admin/maintenance` page uses the existing verified-coach gate and authenticated collection viewer read service. Sources and provenance load at most 100 documents per cursor page; URL collection filters query Firestore, while attention/search are explicitly confined to loaded rows. It links records, provenance, checks, disagreements and reviewed Import. Due external checks exclude manual declarations; failed checks and open questions survive success, imports and guarded reversal. No privileged browsing endpoint, scheduler, new public evidence, database migration or rules change is introduced.

Private source-check bundles, question manifests, captures and verification are under `backups/imports/coach-cutter-ptolemy/velocity-v2/maintenance-20261007/`. Live checks confirmed 523 existing business/state/configuration documents unchanged, both cloud capture hashes valid without public download tokens, and all seven questions present with unchanged fact dates. A repeated question preview reported zero changes. This follow-up changes local frontend source only; it has not been deployed, committed or pushed. The original database and deployment remain available.

The integration checkpoint passed `npm run verify` (87 tests, lint, TypeScript and production build) and `npm run test:rules` (18 Firestore/Storage emulator tests). Browser checks covered source-level missing-verification notices, empty attention results and collections, collection/attention URL filters with pagination resets, invalid allowlist filters and recovery, question detail/capture links, Refresh, desktop/mobile layouts and visible keyboard focus with horizontal table scrolling. A subsequent live read-only fingerprint check confirmed all 664 source/provenance documents and the same 523 business/state/configuration documents unchanged; source/provenance counts remained 19/645.

## Inland Empire club directory follow-up

The subsequent [Inland Empire directory import](2026-10-07-inland-empire-teams.md) adds all 19 currently listed clubs, with 20 linked published coach contacts and freshly archived evidence. Teams are now 19, people 33, sources 41 and field-scoped bindings 342. Existing athletes, public profiles, meets, venues and documents were preserved. The data is live; new LSC/club-code viewer columns and filters remain local until a frontend release.

## Frontend release

This workspace's `.env.local` explicitly targets `velocity-v2` and the private evidence bucket. Its original configuration is preserved privately for rollback. The existing database remains available; rollback sets `NEXT_PUBLIC_FIRESTORE_DATABASE_ID=(default)` and rebuilds the frontend with its original Storage settings.

The intended hosted destination is `https://cutter.coach`, which redirects to `https://www.cutter.coach` on Vercel. Both exact origins are configured for Firebase authentication and private Storage reads. Existing authorized domains and CORS entries were preserved, and bucket public-access prevention remains enforced.

DNS confirms that `www.cutter.coach` points to `072190ac6d9f52cf.vercel-dns-017.com`, and the live response includes Vercel server/request headers. The existing Firebase project's only Hosting site has no releases or custom domains and returns 404. Its Firebase backend is independent of the current Vercel frontend hosting.

The hosted cutover is live. After the user authenticated the Vercel CLI with the Velocity account, the existing domains were verified against team `coachchristian-7668s-projects` (`team_YD6V0nc3tnozNNfWvgcYwfl1`) and project `cutter-coach` (`prj_4YFnOHzmFZQy8PwNoSCXYuGyWGmq`). The separately connected Yahoo account could not access this project and was not used for release actions.

Production-only primary Firebase configuration and `NEXT_PUBLIC_FIRESTORE_DATABASE_ID=velocity-v2` were added to the owning project; existing settings, preview/development variables and legacy environment entries were retained. Node 24 built the reviewed uncommitted source, uploaded manually without Git deployment metadata. No commit or push was made. The source manifest fingerprint is `7840e19b07c9a0143d6a1a3256b836e24b2b515e25895be30bbaac47f90de038`, covering 94 allowlisted files.

Deployment `dpl_EiLcpLiqUTTpdb5U631ULrrChUgD` is READY at `https://cutter-coach-7dq93plng-coachchristian-7668s-projects.vercel.app`; its build took approximately 19 seconds. It was staged with the production environment, verified, and promoted to both existing domains. The apex returns a 307 redirect to `https://www.cutter.coach/`. Both live aliases resolve to this exact deployment.

An earlier, unpromoted staging build exposed an eager Firebase Admin Auth dependency failing inside the hosted local-import route. The Auth SDK now loads only after the local-development access guards pass. A regression test confirms a production request returns 404 without loading that SDK; the staged and live endpoints return `{"available":false}`. Legacy route tests account for Next.js streaming redirects instead of requiring an HTTP 307 response in every context.

The previous actual live deployment, `dpl_HASScRenssM8ENKcrEvVfuexUEfi` (`cutter-coach-f2w9e6yuy-coachchristian-7668s-projects.vercel.app`), is preserved for immediate rollback by promotion without rebuilding. Its deployment identity, original project settings and environment metadata are saved privately. A rebuilt rollback must use the preserved original Firebase configuration; changing only the database ID would leave the newly added primary Storage configuration in effect.

Local browser checks passed for collection filtering, loaded-row search, keyboard document navigation, nested revisions, readable provenance with separate dates, raw JSON, empty roster and public standards views, desktop layouts and a 375-pixel phone layout without page overflow. A verified coaching session downloaded the revised packet and confirmed its checksum. The earlier packet revision remains available. Public performance pages retain their existing under-construction state, with no old records populated. A `.vercelignore` now excludes private local data from source uploads; the production build also verifies that private files are absent from its runtime traces.

`npm run verify` passed with 80 tests, lint, type checking and a production build, including the hosted-route regression. `npm run test:rules` passed all 17 Firestore/Storage emulator tests. A subsequent export confirms that the original database still matches the archived fingerprint exactly.

Exporting the fresh database after browser viewing and Refresh reproduced its 357-document fingerprint, confirming that those actions performed no writes. Local and hosted production runtimes reject unauthenticated private viewers before they mount. Hosted checks confirm the fresh database banner, public standards empty state, and 404 responses for `.env.local`, private release manifests and prepared-import endpoints. The reviewed production source and manifest remain privately saved, excluding captures, credentials, local environment files and historical exports. Runtime error queries for the released deployment returned no entries; no Vercel drains are configured.

The user confirmed successful Velocity sign-in and collection loading on the custom domain. The agent browser's separate sign-in attempt returned `auth/network-request-failed`; the Auth configuration API returned 200 with both exact custom domains authorized. Hosted public views and the unauthenticated admin gate passed desktop and 390-pixel phone checks without page overflow. Authenticated filtering, document views and private archive downloads were exercised on localhost against the same production database and bucket; those detailed interactions were not repeated by the agent on the custom domain.

No commit, push, database deletion or historical data migration is part of this release.
