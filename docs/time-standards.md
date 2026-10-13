# Time Standards

Velocity Times → Time Standards displays published `standards` records with one exact cut per event. Filters come from each edition's matrix. No cut is converted or inferred. Editions outside their validity dates remain selectable and are labeled Upcoming or Expired. Legacy standards pages remain available.

## Collect and review

Use Node 24. Download the official source and retain its SHA-256 and capture evidence. Prepare one **complete edition** per record. Verify all table columns, course labels, age groups, genders and relay rows before staging. An unknown value is not a zero time: leave it unresolved and do not stage an incomplete replacement.

For the current USA Swimming age-group PDF (pdfplumber required):

```sh
python3 scripts/collection/extract-motivational.py official.pdf record.json
node --env-file=.env.collection.local scripts/collection/prepare-standards.mjs record.json record.json.evidence.json batch.json
node --env-file=.env.collection.local scripts/collection/stage.mjs batch.json
```

The extractor supports the verified October 10, 2025 revision of the 2024–2028 age-group document. It rejects unexpected rows, missing columns and duplicate events. For other standards, prepare the same `StandardSet` JSON with source URL, edition dates and an evidence JSON containing `sourceSha256` and `method`; do not reuse this PDF-specific parser blindly.

Preparation reads the current public record and includes its full baseline. Staging requires `coverage: complete`, explicit baseline reads, official source metadata, and valid cuts. The server checks freshness at staging and approval. Existing batch limits are 1–100 records and 2 MB; split by complete editions, never by partial matrices at the same record path.

Review at `/tools/review` under Velocity Times. Expand a standards record to inspect added/changed/removed cuts and raw metadata; expand source evidence for the capture and coverage. Approval publishes atomically. Hold and decline do not publish. The standards table trigger also validates direct writes. Existing database projection refreshes `standard_cuts` automatically. A standards-only approval avoids rebuilding unrelated athlete bests; Times rankings read the current benchmark dynamically.

## Initial collection, October 13, 2026

- USA Swimming age-group motivational PDF: 304 event/age/course rows, 3,648 cuts, all three courses, both genders, five age groups, six tiers and published relays. PDF and extraction evidence are in `research/time-standards-2026-10-13/`.
- Inland Empire's official time-standards page lists 2027 Junior, Short Course and Long Course Championships with blank standards cells. No current local championship cuts can be verified there. Do not substitute 2026 meets or the separate Western Zone qualifying standards. Recheck the official page when new standards are published.

## Verification

```sh
npx vitest run tests/swim-resources/time-standards.test.ts
node --test tests/standards.integration.mjs
# Local app at port 3001; override via STANDARDS_TEST_URL if needed:
node scripts/collection/standards-browser-check.mjs
```

Database and browser checks refuse hosted databases, use synthetic editions, and clean up their records. Apply the standards migration locally first. Production staging requires the migration to be applied to the configured Supabase project; staging itself never approves or publishes.

Initial production batch: `bcacf495-71df-42ac-9049-7468daec72eb` (pending; no approval performed). Standards baseline lookups use the standards primary key, avoiding scans of unrelated race records.
