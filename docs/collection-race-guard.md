# Race identity guard and private baseline export

Approved scope: every listed catalog meet, every swimmer including visiting
teams, historical meet-date affiliation, and separate IES record audits.
This implementation is local and uncommitted. No live migration or campaign has
run. Apply the migration and verify deployment only after the promised review.

## Exact migration

`supabase/migrations/20261014180000_race_identity_and_private_baseline.sql`
adds four private tables, a nullable `collection_batches.canonical_revision`,
indexed identity lookups, canonical-write triggers, staging/approval revision
checks, and the staff-only `private_race_baseline_page` RPC.

No canonical records, legacy claims, pending decisions, or receipts are
backfilled, merged, deleted, or automatically approved. Existing pending Times
batches that write canonical race collections have no revision and require a
fresh proposal. Holding/declining them remains available.

The shared advisory lock covers all supported canonical write paths, including
staff commits, collection approvals, and direct service-role table writes.
Triggers maintain a monotonic revision for the five canonical collections,
athlete-name people, training-group names, evidence records, catalog entries, and private identity mappings. Unique
private claims are the final conflict arbiter. Approval validates all incoming
stable claims before the first canonical write; facts, claims, revisions,
projections, and the review receipt commit or roll back together.

Member namespaces/digests identify a canonical person independently of club/LSC.
Reviewed aliases may map many source IDs to one person; one source ID cannot map
to two people. Result identity uses canonical athlete/team, meet, date, event,
course, round, relay squad/category when applicable, and a reviewed occurrence
token. Verified relay lead-offs also identify their parent relay and remain separate
from individual starts, even at equal times. The existing parent/member/flat-start
SQL validation still applies. Time, status, age, and current club are observations, not person identity.
An unambiguous first P/F occurrence uses `single`. Alternate starts and ambiguous
S/TT rounds require explicit reviewed occurrence evidence. Unclaimed legacy
overlaps fail closed. No name/time merge or coarse unconditional uniqueness rule
collapses legitimate repeated starts.

The file-only preparer emits `baseline-identity-audit.json` before any live work.
Conflicts and legacy overlaps need evidence review; this migration does not
repair them. The parser preserves unsupported DNF holds, NS/DFS/DQ distinctions,
relay totals, and lead-off eligibility review.

## Export and full-catalog preparation

Verified staff see **Download private race baseline** in `/tools/review`.
The existing authenticated session is used; no credentials are included. The
RPC checks staff itself, fixes its search path, allows only bounded known
collections, and grants no private-table access. Anonymous, family, and collector
access is denied. Responses use private/no-store headers.

The browser collects every page of all five canonical collections, private
identity mappings, and the entire meet catalog. Start/end revision and counts
must agree. Changed, duplicate, truncated, oversized, or incomplete pages produce
no completed file. Keep downloaded private artifacts under ignored `backups/`.

`collection:races catalog-scope` creates the all-meet source manifest with
pending-acquisition receipts. It does not download sources, mark missing results
unavailable, or import anything. Whole-catalog preparation/staging reject omitted
meet IDs. Pilots are explicitly labeled and do not fulfill the campaign.

After **each** approved canonical batch, export and prepare again. Unrelated
canonical changes and alias additions deliberately stale remaining batches.
Existing collectors without an identity guard receive a new server-revision
fingerprint when restaging after canonical changes; unchanged restaging within one
revision still returns the same batch. Never edit a revision to bypass that check.
Unclaimed legacy nonidentity corrections work through the supported upsert and
collection approval paths without inventing historical occurrence claims.
There is no automatic approval or
multi-day schedule in this change.

## Validation and recovery

Run Node 24, synthetic seed, `npm test`, `npm run test:database`, both existing CI
browser workflows, `npm run test:baseline:browser`, and local advisors. The new
DB suite covers competing external IDs, direct service-role writes, concurrent
alias changes, stale preparation/staging, exact rollback, distinct rounds/courses
and starts, unresolved legacy facts, complete pagination, and access denial.

The Mini test stack uses a separate Supabase project ID and volume; the saved
`aboutvelocityswimming` database is never mounted. No reset or volume deletion
is required. Raw CLI logs stay private because startup/status can contain local
keys. Verification results are retained separately from source-controlled docs.

Before any live application, retain a verified private baseline/backup and
review the identity audit, pending batch inventory, migration hash, index-build
cost, and lock window. Creating indexes and attaching triggers can briefly block
writers; a busy database may require a maintenance window. Do not bypass a lock
or retry blindly if migration application fails.

A failure inside migration/approval rolls back that transaction. This migration
is additive and can remain installed if the UI deployment is rolled back;
older pending race batches will safely refuse approval. A schema rollback needs
a separately reviewed forward recovery migration restoring the preceding
stage/review definitions and removing the new triggers. Retain claim tables and
review history for audit; do not drop/delete data or reset a database to recover.
Re-export and reprepare after recovery. No automatic destructive down migration
is provided.
