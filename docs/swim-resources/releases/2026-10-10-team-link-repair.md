# Times team names and athlete links — October 10, 2026

The hosted Supabase dataset contained 1,165 published results across 12 valid operational teams. Times displayed stable team IDs as labels. All 224 athlete records had missing `teamId` values because the collected athlete proposals omitted the affiliation; result records retained it. No athlete had conflicting team IDs among published results.

Applied `20261010150533_repair_times_team_names` to project `hgsghjqefynhbavmkehv`. Public race projections now include only the canonical team name alongside the existing team ID. Future race publication and team renames maintain that label. Private team records and their other fields remain protected. Race-time affiliations were preserved.

The frontend now renders team names in results and alphabetized filter options while continuing to filter by stable IDs. This source change has not been deployed.

Prepared and staged 224 athlete updates using their stable IDs and latest approved race affiliation. Updates preserve existing athlete fields, person identity, name and training group, and include dated `teamAffiliation` evidence with `currentRegistrationVerified: false`. Unattached entries remain Unattached. These are last recorded affiliations, not independent verification of current club registration.

The following batches are pending staff review at `/tools/review`:

- `e68a29cf-02c3-456e-bbf4-b155564e20de`: 100 athlete corrections.
- `0d595a3c-c9e9-4b30-b23b-f05d59e600dd`: 100 athlete corrections.
- `cd1722cc-2a15-438d-8e4c-304103a431f0`: 24 athlete corrections.

Private proposal files are in ignored `backups/team-repair-2026-10-10/` with mode 0600. Staff approval uses the existing atomic review and stale-data checks. Athlete assignments have not been published.

Verification: all 1,165 hosted public results have team names; team-rename refresh and race-republication checks passed in transactions rolled back afterward. Six Times unit tests, TypeScript checks and targeted ESLint passed. Security advisors reported no findings for the changed private trigger functions; existing project advisories remain outside this repair.
