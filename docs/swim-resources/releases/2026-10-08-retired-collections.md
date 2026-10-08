# October 8 active collection retirement

The user retired Goals, Film Sessions and stored Records. The active `coach-cutter-ptolemy / velocity-v2` model no longer registers `goals`, `film_sessions` or `records`. They are absent from collection viewers, the data map, relationship links, ownership/backfill scopes and maintenance filters. Their root and descendant client reads/writes are denied by the deployed Firestore rules. The old Goals page is removed; the old Records route opens Swims and preserves athlete selection while discarding obsolete layout parameters.

Imports and guarded reversal rebuild athlete best times only. The stored record-board writer and unused schema types were removed. Receipts, selected apply, recovery flags and the shared projection lease remain intact. Swims are the canonical source for future calculated team records; this release does not add a team-record calculation interface. Existing public performance placeholders are preserved.

All three retired collections had zero records, missing-parent document paths, subcollections, linked provenance and bindings before release. No database deletion or migration was necessary. Historical data remains in the original database and private archive.

## Release

The production build also publishes the previously local evidence maintenance page and Inland Empire team viewer columns/filters. Deployment `dpl_DpnCJ9JpCB4vF5fZcg3sSmG5Ww4c` was built with the existing production configuration, staged without custom-domain cutover, checked and then promoted. Both `cutter.coach` and `www.cutter.coach` resolve to that exact READY deployment. The unique URL is `https://cutter-coach-yk56gsnh6-coachchristian-7668s-projects.vercel.app`.

The reviewed source manifest has fingerprint `1bc20a0b26be1d530c3babd6cecee8ea2b35c402e85cdb1c2d82b24335329bd5`. A separate source upload excluded Git metadata, local environment files, credentials, captures, backups and tests. No environment variables changed.

Only the named database rule release changed, to ruleset `2442c645-fd16-4b64-bc9f-362e15de207c`. The original database ruleset `4ee0c44c-1440-4f53-a86b-4bcb984aeb2d` and private Storage ruleset `62b9b330-fa23-470b-96a9-0a3c043c38f4` retain their exact prior release pointers. A database-specific temporary deployment configuration prevented accidental deployment to the original database.

The prior frontend `dpl_EiLcpLiqUTTpdb5U631ULrrChUgD` remains available for rollback by promotion without rebuilding. A full retirement rollback also requires republishing the preserved prior fresh-database ruleset `ff504098-97e6-4f80-88ac-2fb6891a72f0`; restoring the frontend alone intentionally does not reopen retired collections. Private release checkpoints are under ignored `backups/releases/2026-10-08/`.

## Verification

`npm run verify` passed all 88 tests in 11 files, lint, type checks, the production build and private artifact exclusion. `npm run test:rules` passed all 19 Firestore/Storage emulator tests. Synthetic checks cover rejected retired collection/document paths, denied coach reads/writes including descendants, preserved historical backfill exclusions, redirects and best-time refresh without reading or writing stored records.

Staged/live HTTP checks confirmed the fresh database shell, maintenance and map routes, the Records redirect, retired viewer not-found signals, and 404 responses for local prepared imports, environment files and private manifests. Next.js can stream not-found and redirect signals with HTTP 200; checks inspect the actual signals and rendered browser result. Live anonymous retired-collection requests returned 403, while the public standards collection returned 200.

The existing signed-in Velocity session loaded the live 21-collection index, maintenance filters and 27-node map without the retired collections. The Records redirect preserved an exact athlete filter and removed the layout parameter. The retired Goals viewer rendered the not-found page locally. Browser checks used the actual default viewport and a temporary 1280-pixel tab. The browser's requested 375-pixel override did not change its actual viewport, so this release does not claim a new 375-pixel check; the earlier shared-viewer phone checks remain documented in the October 7 releases.

Independent before/after exports each include 2,982 documents and all subcollections, with matching fingerprint `99fb0923fead9324e80f6b832c821190eb17561288193375278a536c7cae65c9`. No stored facts, evidence history, receipts or populated collection counts changed during deployment and viewing.

No commit, push, historical data deletion or original-database cutover is part of this release.
