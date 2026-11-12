# Velocity Imports

Use the local Puppeteer session to navigate to the source and save the download or structured result capture directly to disk. Keep the capture and its manifest in the ignored `backups/` directory. The local uploader parses files, computes or verifies their hashes, and writes pending rows to Supabase. Its terminal output contains counts, a short list of exception reasons, and the review link.

## Stage a capture

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `VELOCITY_COLLECTOR_TOKEN` in `.env.collection.local`. A Knowledge-scoped token stages catalog meets. A Times-scoped token stages operational meets and results. Split mixed inputs into two manifests when using a token with only one scope. Use the exact Supabase project reference in the manifest, or `local:aboutvelocityswimming` for the local database.

```sh
npm run collection:import -- backups/my-import/capture.json --dry-run
npm run collection:import -- backups/my-import/capture.json
```

`--dry-run` parses the files and reports the planned requests with zero database calls. Add `--local-report backups/my-import/normalized.json` to retain normalized candidates and parser exceptions for inspection. Use a new report filename for each run. If an upload is interrupted, rerun the same manifest to reuse the same capture and skip rows already received.

For browser captures, save a manifest such as the following. Artifact paths are relative to the manifest.

```json
{
  "version": 1,
  "project": "local:aboutvelocityswimming",
  "captures": [
    {
      "format": "structured",
      "file": "rows.json",
      "sourceUrl": "https://example.org/meet/42",
      "capturedAt": "2026-11-11T20:00:00Z",
      "coverage": "partial",
      "sourceScope": "Meet results for one visiting club"
    }
  ]
}
```

`rows.json` contains a `rows` array. Each item has `kind`, `id`, and the existing canonical record `data` object.

```json
{
  "rows": [
    {
      "kind": "meet",
      "id": "example-meet-42",
      "locator": "meet/42",
      "data": {
        "name": "Example Invitational",
        "startsOn": "2026-11-10",
        "endsOn": "2026-11-10"
      }
    }
  ]
}
```

Supported kinds are `catalog_meet`, `meet`, `swim`, and `relay`. Include a source row ID or line label as `locator` when available. A known issue can be recorded as a `blocker`. For a Times row, add linked `prerequisites` in the same `{kind,id,data}` format for new `team`, `athlete`, or `venue` records. Use an existing meet ID or include a separately selectable `meet` row. Keep raw membership identifiers, dates of birth, and signed download URLs in the local capture. Use stable source IDs or digests and public-facing source URLs in normalized records.

For a saved Inland Empire event array, use `"format": "ies-catalog"` and a `cutoff` in ISO date format. The existing catalog parser converts eligible listings to pending catalog meets. Catalog coverage describes the supplied listings. Result and participation coverage have their own fields.

## Stage paired HY3/CL2 results

Use the existing [race source manifest and reviewed mappings](./collection-races.md) for the meet selection. The additive command reuses the checksum, exact B1 match, companion pairing, dated team mapping, stable member digest, split and relay checks. It uses explicit canonical meet and athlete mappings as references for the database to verify. Archive coverage remains partial. Individual lead-offs and reviewed catalog date corrections use the existing review workflow.

```sh
npm run collection:import -- backups/my-import/sources.json --mappings backups/my-import/mappings.json --dry-run
npm run collection:import -- backups/my-import/sources.json --mappings backups/my-import/mappings.json
```

## Review and pilot

Open Velocity Imports and select meets or swims. The page checkbox covers the visible page. **Select all matching** freezes the matching rows when clicked. The approval preview lists blockers and linked records such as newly introduced swimmers and teams. Use **Batch review and history** for corrections and legacy imports.

For a pilot, process the same saved meet archive against equivalent test databases. Record the browser acquisition time once. Compare preparation, request bytes, time until rows appear in the queue, time to load the review page, and time from approval to Times visibility. Count model tokens from the session that performs the same acquisition and review task. Verify the selected results in Times, best times, team records, and Archive, and check that the unselected results remain private. Keep the existing workflow available while running the pilot.

### Local pilot results

On one saved HY3/CL2 archive, median local preparation across three runs was 1,037 ms on the legacy path and 125 ms on the new path. The legacy preparer read a 68.5 MB baseline. The new preparer read the capture and mappings, producing 80 candidates in a 339 KB request and four parser exceptions.

Rollback-only runs of the same 80 candidates against an isolated database gave these median results. The legacy comparison stages and approves prerequisites before results. Review time is the database query time. The new review payload contains the first page of each table.

| Database step | Legacy | Pending rows |
| --- | ---: | ---: |
| Stage | 14 ms | 89 ms |
| Load review data | 2 ms / 41 KB | 17 ms / 19 KB |
| Prepare approval preview | — | 56 ms |
| Publish | 99 ms | 169 ms |

The browser smoke test used synthetic rows and verified frozen selection, linked-record approval, and retry after a lost response. A production pilot still needs browser acquisition and end-to-end model token measurements before the production workflow changes.

For rollout, apply the import queue migration before deploying the new review page. Legacy proposals and receipts remain available in Batch review and history. If the app is rolled back, retain the private queue tables so staged rows and approval receipts are available after redeployment.
