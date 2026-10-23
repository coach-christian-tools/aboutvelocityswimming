# Collection readiness and proposed commit guard

Status: Christian approved local implementation/testing and the whole catalog.
The implementation and recovery notes are in `docs/collection-race-guard.md`.
The investigation below records the original readiness findings; the initial
missing-export and Docker-access gaps have since been addressed locally. No live
migration, deployment, import, or campaign has been performed.

## Baseline availability

The current staff meet queue exposes **Export selected requests**. The checked-in
implementation exports saved meet requests and catalog/participation metadata;
it does not export the five canonical collections needed by the race preparer.
The existing collection viewer reads at most 100 records per page. No complete,
consistent raw baseline export was found in the supported staff UI. The browser
tool timed out during the selected-request download attempt; no completed export
file was obtained. No credential extraction, browser storage inspection, hidden
endpoint requests, or manual API calls were used as a substitute.

A fresh complete baseline has therefore **not** been obtained. The retained
October 13 snapshot remains explicitly old and unattested. It must not be relabeled
complete or fresh. A supported exporter must provide full private raw `teams`,
`meets`, `athletes`, `swims`, and `relay_results`, exact counts, project, capture
time, and evidence that pagination and consistency checks completed.

## Requested meet versus retained parser pilot

At read-only inspection, the signed-in live queue reported 940 catalog meets,
78 with confirmed IES evidence, one requested meet, and 940 unfinished imports.
The request is **2026 Wenatchee Invite**, September 26, 2026, observed, SCY, at
James Elwyn Aquatics Center. Priority is 50; acquisition is Downloaded, import
state is Prepared, team coverage is Partial, and the queue reports zero imported
individual swims for this catalog identity. No selection or workflow record was
changed.

Exactly one of the retained 940 catalog rows matches its title/date:
`usa-observed-ie-4cf11ac598b0e1f2b74e47a6`. The retained entry lists:

- Official observed-meet listing:
  <https://www.gomotionapp.com/team/wzielsc/page/events/ies-observed-meets>
- Full result PDF:
  <https://www.gomotionapp.com/wzielsc/UserFiles/Image/QuickUpload/mm8results2colnotstd_089932.pdf>
- Result ZIP labeled **VS | YYST**:
  <https://www.gomotionapp.com/wzielsc/UserFiles/Image/QuickUpload/meet-results-2026-wenatchee-invite-girls-season--26sep2026-002_039139.zip>

The live request explicitly retains two blockers: 77 PDF individual results
outside the VS/YYST archive, and school-team/member identity reconciliation for
16 PDF relays. Confirmed IES participation by Velocity and Yakima does not make
that club-filtered archive a full-meet dataset. Visiting and school competitors
remain in the requested scope. Those counts are saved queue statements, not a
new independent extraction or validation of the PDF in this investigation.

The local reviewed parser pilot is a different meet: June 4, 2025 Velocity
Distance Progressive. Its 81 HY3/CL2 rows reconcile to 68 clean proposals, 13 held
rows, and two additional split-detail holds. It tests the adapter; it does not
fulfill the Wenatchee request. Its 21-team record file is a computed local
candidate inventory, with no official-website comparison or complete historical
IES audit.

## What the checked-in database currently guarantees

`private.review_collection` in
`supabase/migrations/20261013224305_time_standards_review.sql`:

1. Requires verified staff, takes the shared `velocity-records` advisory lock,
   and locks the batch row.
2. Compares the stored before-image for each listed read path.
3. Applies ordered writes with dependency checks in the same transaction, then
   records the decision and rebuilds affected projections.

There is also a unique `swims_external_result_idx` on non-null
`(externalResult.namespace, externalResult.id)`, plus primary keys and a unique
batch fingerprint. These reject identical canonical/source IDs or exact repeated
proposals in their respective scopes.

They do **not** establish cross-alias identity or performance uniqueness. For
example, two staged batches may propose the same performance under different
swim IDs and different source IDs. Approving A changes neither B's different
absent target path nor its unchanged athlete/meet reads. B can subsequently pass
the listed-read checks even though the advisory lock serializes both approvals.
The external-result index does not collide when those source IDs differ. A local
full-inventory hash only detects changes at the time it is checked.

This is a finding about the checked-in implementation. Additional production
constraints have not been introspected through another access route. Actual
deployed behavior and concurrency must be verified before launch.

## Database change proposed before unattended live execution

A client-only recheck cannot close the window between checking and committing.
The following requires a reviewed database migration, not an untested client
promise:

1. Add a private, indexed identity-claim registry keyed by source namespace and
   stable member hash, referencing the canonical athlete. Multiple reviewed
   source aliases may reference one person; one source identity cannot claim
   multiple people. Claim evidence and reviewer attribution stay private. Team,
   LSC, and meet-time affiliation are not person identity keys.
2. Add private source-race claims and reviewed canonical occurrence mappings.
   A claim binds a stable source result/occurrence to one canonical swim. Known
   cross-source aliases bind to that same occurrence. Canonical occurrence
   identity uses athlete, meet, event/course, date, round, source event identity,
   and a distinct start/occurrence identifier when needed. Time/status are
   observations, not identity keys. Do not impose a coarse unique constraint on
   athlete/event/date/round: repeated swim-offs and time trials must survive.
   Legacy overlaps or missing occurrence evidence must fail closed for review,
   rather than merge by name/time or allocate a second occurrence silently.
3. Add `private.validate_collection_identity_claims` and call it **after taking
   the existing advisory lock and before the first fact write**. Validate all
   incoming claims against current canonical rows, current claims, and every
   other write in the batch. Claim allocation and fact writes must be atomic.
   Unique claim constraints must be the final conflict arbiter. Protect other
   supported canonical write paths through the same validator/constraints;
   protecting only one UI or staging call is insufficient.
4. Add a private monotonic canonical-data revision covering all five exported
   collections. Every supported mutation must acquire the same lock and advance
   it. Bind prepared/staged race batches to the validated revision, and check it
   again inside approval under that lock. A stale revision requires a fresh
   export and preparation. This guards against canonical additions not named in
   a batch's path reads; it supplements identity claims rather than replacing
   them.
5. Provide a visible **Download private race baseline** staff action using
   existing authentication, with no credential export. A bounded paged read can
   capture revision/counts at start and end and discard/retry when they differ;
   do not mark changing pages consistent. Return only the five approved raw
   collections and export metadata into a private local file. Staff checks and
   current RLS remain in force. No anonymous/private table grants are needed.

Do not automatically backfill claims by names, times, or current club. First
report existing duplicate/conflicting stable claims and unresolved legacy
occurrences. Resolve them through reviewed evidence; preserve existing records,
pending batches, and receipts. Old pending Times batches without the new guard
contract need explicit revalidation, not silent grandfathering.

New claim/revision tables belong in the private schema and must not be exposed
through the Data API. Any necessary staff metadata function needs an explicit
staff check, fixed search path, narrowly scoped privileges, and permission tests.
No existing role should gain general private-table access.

## Required verification

- Local seed must complete under Node 24 against verified localhost services.
- Two concurrent approvals for one reviewed occurrence under different IDs:
  exactly one canonical race; the other rejects/holds atomically, with no partial
  profile, claim, receipt, or projection changes.
- Add a canonical alias/race after export and after staging: revision/claim
  checks must reject stale approval, not merely warn in the browser.
- Verify genuine distinct repeated rounds/starts, courses, NS/DFS/DQ handling,
  unsupported DNF holds, relays/lead-offs, and historical affiliations.
- Verify same-member/two-person conflicts, many-reviewed-aliases/one-person,
  legacy unresolved occurrences, idempotent retries, and all other write paths.
- Test staff-only private export, pagination/count completeness, revision changes
  during export, anonymous/family/collector denial, artifact privacy, and scope.
- Run the full database and browser suites and a normal production build, then
  complete the Wenatchee all-swimmer/PDF/relay reconciliation and staff pilot
  review before any live staging or unattended collection.

The previous build emitted `ENOTFOUND fonts.googleapis.com` for existing fonts;
that is an environment/network-resolution failure, not evidence of an importer
code defect. A later normal Turbopack retry stalled at compilation and was
stopped; its cause is unproven. No typography/network/security settings were
changed, and no successful full build is claimed.

## Docker access: supported approval path

Christian's own Terminal returned a successful empty `docker ps` table. Docker
is reachable there and there are no running containers. This does not grant the
task elevated access or establish that its earlier socket denial is resolved.

The executor supports standard per-command approval via
`exec_command(..., sandbox_permissions="require_escalated")`, reviewed by the
configured approval mechanism. The next minimal operation needing that approval
is the read-only Docker status command:

```sh
docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
```

Approval for that socket read does not authorize container startup. No such
Docker request/retry has been made during this investigation. Do not use sudo,
chmod, a different socket/context, or UI automation around the denial.

After separately authorizing local startup, the repository's CI uses
`supabase start -x studio,imgproxy,logflare,vector,supavisor`, followed by
`npm run seed:local` and `npm run verify`, with Node 24 on PATH. Startup may pull
container images and use disk; the Mini last had about 38 GiB free. Start/status
output may contain local keys, so execution must keep raw logs private and report
only non-secret status. Never seed the hosted target.
