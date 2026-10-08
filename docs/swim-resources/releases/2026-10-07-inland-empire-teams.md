# October 7 Inland Empire club directory

The user requested all Inland Empire Swimming teams. The live `coach-cutter-ptolemy / velocity-v2` dataset now contains all 19 clubs published in the current [official IES club directory](https://www.gomotionapp.com/team/wzielsc/page/clubs/club-directory), checked October 7, 2026. This is directory completeness, not an assertion that unrelated results databases or historical club lists represent current registrations.

Seventeen teams were added; Velocity Swimming and Cougar Aquatics were enriched. Each has a published LSC code, club code, listed service area and current website. Published club email, phone and mailing address were included where supplied. Twenty directory-listed coach contacts are linked to their clubs: 18 new people and two existing Velocity coaches. Existing roles, phone numbers and other contact relationships were preserved. Ownership is explicit for other clubs; the Velocity default does not assign their coaches to Velocity.

| Club code | Club |
| --- | --- |
| ATOM | Atomic Swim Club |
| BST | Baker YMCA Swim Team |
| CAST | Coeur d' Alene Area Swim Team |
| COUG | Cougar Aquatics |
| EAST | Ellensburg Area Swim Team |
| LGSC | La Grande Swim Club |
| LCN | Lewis Clark Neptunes |
| MRA | Manta Ray Aquatics |
| PSA | Pendleton Swim Association |
| SHRK | Sandpoint Sharks |
| SC | Spokane Club Aquatics Team |
| SSS | Spokane Sea Serpents |
| SWAT | Spokane Waves Aquatic Team |
| TCCC | Tri Cities Channel Cats |
| VAN | Vandal Aquatic Club |
| VS | Velocity Swimming |
| WWSC | Walla Walla Swim Club |
| YRA | Yakima Riverforge Aquatics |
| YYST | Yakima YMCA Swim Team |

## Evidence and import

The directory and all 19 current websites were captured freshly and retained privately with immutable hashes. Website evidence verifies the URL and club identity only; it does not claim to verify staff, roster or venue facts. The directory-linked Lewis Clark Neptunes website timed out and the old Sandpoint Sharks Wix page returned 404. Their failed checks remain preserved. Current official replacements were independently retrieved and verified before importing the working URLs. The two old source definitions are disabled, and current field bindings use the replacements.

Three evidence-required Import batches were previewed and applied through the authenticated coaching client in dependency order: teams, people, then team contact links. The batches produced 58 applied receipts: 55 fact changes and three unchanged confirmations, with zero conflicts. The 22 new source definitions include 20 active sources and two disabled superseded sources. Fifty-eight field-scoped bindings connect the directory and websites to the imported records; no source priority was invented.

An unchanged reconciliation of those 58 observations accepted no additional fact changes and reported no held claims or failures. Check dates and fact-change dates remain separate. Prior receipts and evidence history remain intact. Private captures, prepared batches, source/binding manifests and verification reports are under `backups/imports/coach-cutter-ptolemy/velocity-v2/inland-empire-teams-20261007/`, excluded from Git and frontend releases.

## Viewer and validation

The local shared team viewer has LSC, club code, listed location, website and club-email columns and exact field filters. The team model validates codes and contact fields. The data map and entity documentation describe the fields. Service-area labels and mailing addresses do not create venues or invented pool coordinates.

The integration checkpoint passed `npm run verify`: lint, TypeScript, 88 tests in 11 files, production build and private artifact exclusion. `npm run test:rules` passed 18 Firestore/Storage emulator tests. Synthetic tests cover club fields, invalid codes/contact values and allowlisted LSC/club-code filters.

Live verification checked every proposed field and evidence pointer, all 58 receipts, all 20 archived capture hashes and absence of public download tokens. It compared 506 unrelated stored documents with the prior verified baseline and found no changes. Population is now 19 teams, 33 people, 41 sources and 342 bindings. The existing 104 athletes, 104 public profiles, three venues, three meets and seven documents remain intact. Structured standards, swims and records remain empty.

Browser checks confirmed all 19 clubs in the LSC filter, exact club-code filtering with pagination reset, team-to-coach relationships, accepted evidence and separate dates, Refresh, desktop layout and a 375-pixel phone layout without page overflow. A subsequent read checkpoint found all 52 team/person documents unchanged, with the same 19/33 counts.

The data is live in the named production database. The added viewer columns, filters and local maintenance page have not been deployed. No frontend deployment, Firestore/Storage rules deployment, original database change, commit or push was performed for this request.

The viewer columns, filters and maintenance page were subsequently published in the [October 8 collection-retirement release](2026-10-08-retired-collections.md).
