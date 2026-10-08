# Collection pilot — October 6, 2026

The local implementation is verified. The approved Firebase cutover is complete: 178 public profiles were backfilled, the tested rules were deployed, and both generations of assistant history were deleted. The coach has since applied 28 roster changes, nine meet additions and three result corrections. All 40 canonical records match their saved receipts, and the shared best-time/record refresh has completed. No schedule is enabled. The pilot has not passed its complete acceptance gate yet. The matching frontend is available locally; no hosted frontend was published.

## Collected and reconciled

| Area | Evidence and preview | Remaining work |
| --- | --- | --- |
| Regional opportunities | IES, SWAT, Cougar Aquatics and Manta Ray calendars checked for October 6–January 4. Thirteen opportunities found; nine official packets support nine meet additions. Four opportunities are held. | Confirm three conflicting deadlines, missing packets/venues and Velocity eligibility. A separate APEX–TTSC inquiry is an unconfirmed prospect. |
| Roster | Verified Velocity coaching login. Full non-deleted TeamUnify export: 1,180 memberships, including historical accounts. Reconciled against 178 canonical athletes. Preview: 196 observations, 28 changes and 14 conflicts; six new identities are also held. | Resolve duplicate historical/current memberships, six identities without external IDs, two blank membership values and one unmatched database athlete. Missing records never trigger inactivation. |
| Results | Five active swimmers across Seniors and Juniors, with public SwimCloud identities verified against club, name/alias, export DOB and training group. Actual event pages support three legacy round corrections. Preview: five observations, three changes, no conflicts; two race dates held. | Obtain exact race days for two multi-day meets and reconcile complete race histories. No PB snapshot was converted into an invented history. |
| Coaching email | Connected account verified as `coachchristian@velocity-swimming.com`. Relevant announcements and revisions read. Official Sprint Shootout CL2/HY3 ZIP and 42-page summary downloaded. Two sampled results corroborated. Revised Cougar and Very Scary PDFs match the current website packets byte for byte. | Remaining races in the official result file are not reconciled. The older result-file query found no matching attachments. Mailbox coverage is partial, not an exhaustive inbox scan. |

The roster export contained no populated SwimCloud-ID values and no usable TeamUnify-ID column. Existing unambiguous name/alias plus DOB matches were used where external identity was absent. Unmatched non-active historical memberships were retained in the capture instead of becoming new athletes. Original XLSX, UTF-8 CSV, public captures, official files, private review batches and checkpoints are all in ignored `backups/imports/` storage.

### Useful conflicts the pilot caught

- VAN Trick-or-Treat: calendar deadline field October 14; description/packet October 16.
- CAST Fall Splash: calendar deadline field November 4; description/packet November 1.
- SWAT Winter: calendar deadline field November 25; description/packet November 24.
- Cougar's October 5 email says three individual entries per day; the attached revised PDF still says per session. September 30 email identifies Sunday event-order errors in the packet. Event schedules and limits are not imported.
- Very Scary is November 7–8, following a date change. CAST is November 13–15. Stable meet identities must survive these revisions.
- SWAT Fall uses SCM and Winter uses SCY at the same facility. Velocity's Christmas meet venue is Moses Lake, distinct from the club's Wenatchee home.
- The PNS eligibility inquiry bounced. The APEX–TTSC thread has only the outgoing inquiry. Neither establishes host acceptance.
- The old Manta Ray domain failed its certificate check. Its official GoMotion calendar worked; the warning was not bypassed.
- The official shootout summary labels separate quarter/semi/final stages as Finals, while SwimCloud categorizes the event results as swim-offs. Stable result IDs distinguish those performances; the source distinction is visible for review.

Calendar sources: [IES](https://www.gomotionapp.com/team/wzielsc/page/events), [SWAT](https://www.gomotionapp.com/team/ieswat/page/events), [Cougar Aquatics](https://www.gomotionapp.com/team/waca/page/events), [Manta Ray Aquatics](https://www.gomotionapp.com/team/iesmlmr/page/events). Packet and exact event links are preserved on each private proposal. Email threads and attachment identities remain private.

## Verification

`npm run verify` passes lint, TypeScript, 47 regression tests and a production build. `npm run test:rules` passes eight tests against actual demo Firestore rules. The build has no chatbot API route. The Import page now lists all three locally prepared batches for verified coaches, survives page refreshes, and opens a batch directly into its read-only preview. The local read endpoint rejects anonymous/invalid accounts and is disabled in production; file tests cover symlinks, traversal, oversized/malformed captures and repeated reads.

Tests cover duplicate names and external IDs, filtered exports and omitted athletes, revised meet dates, conflicting deadlines, legacy result collisions, repeated swim-offs, course separation, DQs, stale previews, atomic interruption/retry, receipt reversal, unchanged observations and review acknowledgments, and failed/overlapping projection refreshes. Permission tests cover anonymous and unauthorized access, allowlisted public profiles, import audit privacy and the assistant write barrier. Recursive cleanup tests remove inline history, missing-parent messages and deeper descendants from both `chatbot_conversations` and its predecessor, `import_conversations`, while preserving coaching and unrelated message data. The eight permission/cleanup tests passed again before live cleanup.

Browser verification used synthetic data in isolated Auth/Firestore emulators: preview, selected apply, best-time/record refresh, unchanged repeat run, receipt loading and guarded reversal. After reversal, the original group and coach notes remained, the imported race and best projection were removed, receipts were marked reversed, and refresh state was complete. After the cutover, the missing-permission warning disappeared. The coach then applied the 40 selected real changes; all three batches and the shared projection state are complete. Saved receipts match the canonical data and preserve nonempty coaching notes/contact/goals; existing canonicalization normalizes empty legacy fields. Reopening the roster batch showed zero new changes and 14 remaining conflicts. The prepared list is available in the in-app browser as well as Chrome and survives reloads. Opening a batch loads its receipts and any pending refresh recovery automatically; no changes are preselected.

The verified Firebase target is `coach-cutter-ptolemy`; the refreshed CLI login uses the coaching account. After the cutover, all 178 public projections exactly matched the allowlisted profile service output. Anonymous client checks allowed public profiles, bests and standards, and denied private athletes, import audits, review markers and projection state.

Before/after fingerprints confirmed all 178 athletes, 1 meet, 1,272 swims, 1,253 results, 126 best projections, 3 attendance documents, 2 standards sets and 1 roster metadata document were unchanged. Cleanup removed 5 Ptolemy conversation paths and 9 predecessor import-assistant paths. A second inspection found zero paths and zero owned message documents in both collections. No history content was retained. Counts and verification reports are in ignored `backups/imports/` storage. Retired assistant preferences and the legacy browser API key are cleared on each browser's next admin visit.

## Timing and completion gates

The initial browser-collection wall-clock interval was 27 minutes 11 seconds, from 17:59:58 UTC to 18:27:10 UTC, including document interpretation, implementation adjustments and verification pauses. Active collection effort was not isolated. Human coaching review has not been timed. This onboarding run does not establish the ten-minute weekly review target.

Twenty-six source checkpoint comparisons stayed unchanged on an immediate repeat. Partial sources retain their previous successful cutoff; no complete mailbox cutoff was advanced. This verifies checkpoint behavior, not future site availability or collection accuracy over multiple weeks.

The remaining acceptance gates are:

1. Review the remaining held observations and confirm the refreshed best-time/record outputs against the relevant race evidence. Forty selected source-checked proposals have already been applied, and their refresh completed.
2. Resolve or explicitly keep the held observations, and perform a subsequent collection run without duplicate records or repeated unchanged review work.
3. Time a coach's weekly review separately from initial reconciliation and browser idle time. Enable weekday 8:00 a.m. Pacific collection only after accuracy, repeatability and the review target pass.

## Completed cutover and remaining release work

Following the coach's approval, the profile-only backfill, tested Firestore rules deployment, live permission smoke checks and permanent assistant-history cleanup completed on October 6. The cleanup script checked that the hosted rules exactly matched the tested local rules before deletion. The profile-only mode did not change private athlete documents. Coaching imports remain a separate review step.

No frontend deployment destination has been verified. The current repository has no local hosting link and no matching project was found in the connected Vercel team. Its older `coach-cutter` project points to a different repository and reports no live deployment; it must not be selected automatically. The matching frontend is currently verified locally. Confirm the intended frontend destination before publishing a hosted release. The local pilot can now use the matching local client with the deployed Firebase rules and profiles.

The exact cutover and cleanup safeguards are in [the import workflow](IMPORT-WORKFLOW.md#release-and-history-cleanup). The full map, pool and athlete-progress redesign is subsequent work described in [the design direction](DESIGN-DIRECTION.md).
