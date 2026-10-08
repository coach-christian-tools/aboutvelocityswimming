# Admin Audit — Cutter Coach (Admin Surface)

**Date:** 2026-09-23
**Scope:** `/tools/swim-resources/admin/*` routes, `/api/admin/*`, `src/features/swim-resources/components/admin/*`, plus the shared libs they own (`lib/server/auth`, `lib/chatbot/*`, `lib/services/import-tools`, `lib/services/chatbot-conversations`, `lib/utils/*`, `lib/events`, `types/schema`) and the `/tools/swim-resources/attendance` module as it diverges from admin.
**Method:** 4 parallel file-by-file audits (CRUD cluster, chatbot stack, insights cluster, dashboard/import/attendance/zombie sweep) + manual spot-verification of all HIGH findings. ✅ = re-verified in source.

Supersedes the admin-relevant parts of `AUDIT.md` (that audit is stale: `/api/admin/import` no longer exists; `/tools/swim-resources/attendance/admin` is now auth-gated via `src/app/attendance/admin/layout.tsx`; the dead components it flagged were deleted).

---

## Findings table (sorted by severity)

| ID | Sev | Cluster | File:line | Issue |
|----|-----|---------|-----------|-------|
| H1 | HIGH | CRUD | athletes/page.tsx:111,266,664 · goals/page.tsx:159,355,645 | "All Statuses" filter deletes the `status` URL param (the `'all'` sentinel) and falls back to default `'active'` — the option is non-functional. |
| H2 | HIGH | CRUD | AthleteViewer.tsx:255-260,279,308 | Blur-save writes `dob: currentDobString` which is `''` whenever a DOB part is missing or stored DOB unparseable — every field's `onBlur` can silently wipe DOB. |
| H3 | HIGH | CRUD | athletes/page.tsx:446-485 · AthleteModal.tsx:274-287 | Add-Athlete modal collects `swimcloudId` but `handleCreateAthlete` drops it (no key in payload). |
| H4 | HIGH | Import | import/page.tsx:145,153,161,219,229-232 | Crash on alias match when swimmer-info missing; `new Date(t.date).toISOString()` throws (fallback dead); `Date.now()` athlete IDs duplicate athletes; fabricated dob/ageGroup/gender pollute record boards; sequential per-row round trips. |
| H5 | HIGH | Chatbot | chatbot/page.tsx:707-769,411-436,313-334 · tools.ts:125-128 · chatbot-conversations.ts:65-81 | Abort mid-tool-loop persists dangling `tool_calls` (protocol 400 on all later messages); Stop doesn't resolve a pending `clearCollection` confirmation (destructive op can run after cancel; concurrent loops write cross-conversation); confirmPhrase gate is model-bypassable; fire-and-forget saves can land out of order; mid-stream error events swallowed; 1 MiB doc limit silently stops persistence. |
| H6 | HIGH | Import | import-tools.ts:548-561 · StatsView.tsx:183 | Chatbot-invokable `bulkUpsertAttendance` writes flat `AttendanceEntry` docs into the `attendance` collection that all attendance UIs read as session-shaped `{records}` → StatsView throws. |
| H7 | HIGH | Attendance | admin/attendance/page.tsx:192,300 · AttendanceView.tsx:164,174 · StatsView.tsx:127-131 | `groupOverride` stored in two incompatible encodings (admin comma-list vs public `'All'/'None'/single`); each UI misreads the other; StatsView only matches single. |
| H8 | HIGH | SwimsDB | swimsdb/page.tsx:131-141 | Filtered queries need composite indexes; no `firestore.indexes.json` in repo → `FAILED_PRECONDITION` unless hand-created. Default view silently truncated to 500 fastest swims. |
| H9 | HIGH | CRUD | AthleteViewer.tsx:93-99 · athletes:204,807 · goals:265,553 · athlete-fields.ts:8 | `normalizeAthleteStatus` can never return `'taking_break'` (maps to `'inactive'`) → "On Break" stat always 0, dead branches everywhere; attendance's `locationToStatus` disagrees. |
| H10 | HIGH | Analysis | analysis.ts:13-24 · standards-transformer.ts:38-49 | `formatSwimMs(119999)` → `"1:60.00"` (seconds round to 60 without carry). Duplicated in `formatStandardMsToTime`. |
| M1 | MED | CRUD | AthleteViewer.tsx:93-99,273-330,390 · AthleteModal.tsx:61-65 | Three disagreeing status/location mappings; `handleChipStatusChange` passes `location`/`currentGroup` overrides that `handleSave` ignores (dead params). |
| M2 | MED | CRUD | AthleteViewer.tsx:244-245,324-330 | Email/phone can never be cleared (guarded spread skips `contact`, legacy top-level written as `''`); copies diverge. |
| M3 | MED | Roster | roster/page.tsx:527-546,693-890 | Notes debounce race resurrects old group notes key on rename/delete within 700 ms; side effects inside `setState` updater; timer not cleaned on unmount. |
| M4 | MED | CRUD | roster:440-478 vs athletes:197-237 · AthleteViewer.tsx:469-472,227 | Duplicated fetch/normalize blocks drift (gender `''` vs `'M'`, aliases synthesized only on one); group overview keys by raw `currentGroup.name` → counts land off-grid; group `<select>` value can match no option. |
| M5 | MED | Roster | roster/page.tsx:515-524,766-775,858-867,429-433 | Reorder has no rollback/error surface; rename/delete reset every member's `assignedAt` (destroys tenure); notes migration overwrites localStorage state and is never persisted. |
| M6 | MED | CRUD | athletes/page.tsx:173-260 | Fetch effect lacks the cancellation guard roster has (setState after unmount). |
| M7 | MED | Dashboard | admin/page.tsx:176-186,304-307,165-170 | SCM times counted into "SCY" cards; "active team records" derived by untrimmed name matching; sequential awaits (54-60); Download-All unbounded double scan, no guard (241-272). |
| M8 | MED | Import | import-tools.ts:567-577,605-615,630-659,99-110,473,490 · import/page.tsx:267 | `bulkUpsertStandards`/`bulkUpsertMeets` never chunk (>500 ops throws); `executeGenericBatchWrite` accepts deletes against ANY collection (chatbot-invokable) while `clearCollection` allowlists 9 and omits `results` (which the import page still writes); `isActiveRoster` hardcoded true. |
| M9 | MED | Attendance | admin/attendance/page.tsx:185-206,160-182,18,797/837/904,92-108 | Saved `groupOverride` silently ignored on first event selection (stale-ref effect); reload clobbers optimistic taps; guest IDs collide (`guest_${Date.now()}`); non-null `events.find(...)!` crashes; roster load has no error handling; save failures only `console.error` (public view has a banner). |
| M10 | MED | Analysis | goals/page.tsx:216-220 · AnalysisView.tsx:238-265 | Goals page scans entire `swims` collection per load just to count; AnalysisView scans whole attendance collection per selected athlete. |
| M11 | MED | Standards | standards/page.tsx:543,603-607,566-573 · transformer.ts:57 | Age chips omit `18&U` (used by bundled champ set → unselectable cuts); `disabledTiers` never resets on event change; dead `!selectedEvent` branch; unused `React` import. |
| M12 | MED | Analysis | TrendsPanel.tsx:150-163,256 · RankingsPanel.tsx:83,100-101 | "N excluded (DQ/NS)" always zero (same filter both sides); "This season" is actually the selected swim's season. |
| M13 | MED | Analysis | records:212-217 · goals:178-208 · standards:122-152 · athletes:127-170 | Resize effects re-subscribe window listeners on every mousemove and can persist a one-frame-stale width (ref + mount-only effect needed). |
| M14 | MED | Tools | firestore-cleaner.ts:16-53 | Firestore `Timestamp`/`GeoPoint` instances flattened into plain `{seconds,nanoseconds}` maps — latent shape corruption. |
| M15 | MED | Attendance | admin/attendance vs AttendanceView:300 vs 174 · db.ts:38,203-215 | Dynamic vs static group list (public ignores `roster_metadata`); `'Alumni'` location is not in `LocationType` (type lie); admin list lacks AM/PM disambiguation for same-named events; sorting divergence. |
| M16 | MED | Analysis | standards/page.tsx:543 · transformer.ts:99-104,142 | Transformer fabricates `50_FR_SCY` cuts from garbage event names instead of skipping; `gender !== 'Female'` silently → Male. |
| M17 | MED | Chatbot | MarkdownRenderer.tsx:21-35,555-698 · page.tsx:582 | Whole markdown re-parsed per SSE token; inline parser re-runs all regexes per match (O(n²)); smooth-scroll per update. |
| M18 | MED | Chatbot | AdminLoginFooter.tsx:62-65,19-32 | Login errors all swallowed (popup-blocked indistinguishable from network failure); `getRedirectResult` can setState after unmount. |
| M19 | MED | CRUD | athletes/page.tsx:114-117 | `parseInt` URL params never NaN/clamp-checked (`?page=abc` → `slice(NaN,NaN)` → empty table). |
| M20 | MED | Import | import-tools.ts:397-461 | `recomputeAllAthleteBests` never deletes stale bests (subcollection grows stale projections forever). |
| L1 | LOW | CRUD | roster:1174-1176 vs athletes:311-323 | Tier colors computed by different rules per page (roster lacks alumni special-case). |
| L2 | LOW | CRUD | AthleteViewer.tsx:342 · roster:365,535 · athletes:170 | Timers not cleared on unmount; resize effect re-subscribes per mousemove. |
| L3 | LOW | Dashboard | admin/page.tsx:135-142 | `timeToSeconds` mishandles `h:mm:ss` ("1:02:15.00" → ~1 s); `parseInt` without radix. |
| L4 | LOW | Attendance | admin/attendance/page.tsx:75 | Drag resize has min but no max. |
| L5 | LOW | Layout | admin/layout.tsx:106,112 | Duplicate `Target` icon for Goals and Import. |
| L6 | LOW | Chatbot | MarkdownRenderer.tsx:655-692 | Markdown links lack `http(s)` scheme allowlist; escaped `\|` not honored in tables; italic regex false-positives on `snake_case`. |
| L7 | LOW | Chatbot | api route:5-6,63-64,94 | Un-idiomatic named exports from route module; `model` unvalidated from client; error can return HTTP 200 when body null. |
| L8 | LOW | Chatbot | page.tsx:379-381 · MarkdownRenderer:377 | `setTimeout`s never cleared on unmount. |
| L9 | LOW | Attendance | AttendanceView.tsx:258-261 | Guest add resets only last name (first persists). |
| L10 | LOW | Analysis | analysis.ts:129-131 | `isoDaysAgo` uses UTC while everything else is local (window shifts a day in UTC-negative timezones). |
| L11 | LOW | Analysis | TrendsPanel.tsx:53 | Unparseable meet dates collapse to epoch (planted at chart far-left). |
| L12 | LOW | Records | records/page.tsx:461,150-156 | Age-group badge mangles `'Open'`→"O"/`'Masters'`→"ALL"; cached course not validated. |
| L13 | LOW | CRUD | AthleteViewer.tsx:24-31 etc. | Misc: unused icon imports (athletes page), redundant `teamUnifyId` assignment, dead toggle-off branch, case-sensitive duplicate-group checks. |

## Zombie code (all verified unreferenced)

**Dead files/pages**
- `src/features/swim-resources/lib/events.ts` — entire module dead (zero imports anywhere in src).
- `/tools/swim-resources/admin/results` (`admin/results/page.tsx`) — zombie route: not in nav, no links. Its component `SwimResultsBrowser` is kept (still used by `/times`).
- `/tools/swim-resources/admin/events` (`admin/events/page.tsx`) — 6-line `redirect('/admin/standards')`; nothing links to it.

**Dead exports/symbols**
- `firebase.ts`: `practiceSessionsCol`, `goalsCol`, `meetsCol`, `analyticsSnapshotsCol` — never imported.
- `attendance/services/db.ts`: `triggerSync` (onSnapshot-promise machinery, no callers) + its `sync_requests` timeout leak.
- `AthleteModal`: entire `initialData`/"Edit Athlete" path dead (only caller passes no `initialData`); dead branch can set `taking_break` which neither select offers.
- `AthleteViewer`: `formatDob` export, bare `Athlete` type import, `TierColorTheme.border` field.
- `athletes/page.tsx`: unused icon imports (`Filter`, `UserCheck`, `Users`, `GripVertical`).
- `lib/utils/analysis.ts`: `seasonLabel` fully dead; `parseEventCode`, `ageGroupRange`, `STROKE_ORDER`, `STROKE_LABELS`, `ParsedEventCode`, `AthleteLike`, `ROUND_LABELS` exported but internal-only (and duplicated privately in records/Trends/Rankings/goals — `formatGroup` exists in ~5 places).
- `goals/page.tsx`: dead `ROUND_LABELS` + `STANDARD_BADGES` constants.
- Dead env fallbacks: all `process.env.VITE_*` clauses in `firebase.ts` and `gcal.ts` (never exist under Next).
- Type-level zombies: `AttendanceRow.kind` written-never-read; `'pending'` member of tool-call status union never assigned; `StreamedTurn.finishReason` computed never read (its absence means truncated tool-JSON executes with `_rawArguments` and reports success).

**Known-good (checked, clean)**
- `/api/admin/chatbot` auth (Firebase ID token verify via `lib/server/auth.ts`) and SSE pass-through are correct.
- `EventSelector`, `AthleteViewer`, `AthleteModal`, `UnderConstruction`, `FlipLogo`, `AdminLoginFooter`, `AthleteBestTimes`, `cleanFirestoreData`, `standards-transformer` exports — all alive.
- `components/admin/analysis/*` all consumed by `/tools/swim-resources/admin/analysis` via `AnalysisView`; no orphaned panels.
- Batch writes correctly chunked at 450 (except M8); roster drag-and-drop closure handling is deliberate.
- `/tools/swim-resources/attendance/admin` is now auth-gated (previous audit's F2 resolved).

## Remediation status (2026-09-23)

Executed in two parallel waves with disjoint file ownership, followed by central verification. **`npx tsc --noEmit` clean · `npm run lint` at baseline (all 20 remaining errors pre-date this work; net −2 warnings) · `npm run build` passes.**

| Items | Status |
|-------|--------|
| H1, H2, H3, H9, M1, M2, M4, M6, M19, L13, L2(AthleteViewer), listed CRUD zombies | ✅ Fixed (A) |
| M3, M5, L1(roster), notes migration, roster timers | ✅ Fixed (B) |
| H4, H6, M8, M20, M14 (+ import page restructured to batched read/write phases) | ✅ Fixed (C) |
| H7, M9, M15, L4, L9, gcal pagination/error, `triggerSync` + gcal `VITE_*` zombies | ✅ Fixed (E) |
| H1(b), H8 (+ new `firestore.indexes.json` wired into `firebase.json`), H10, M7, M10, M11, M13(records/goals/standards), M16, L3, L10-L12, analysis/transformer zombies, deleted `src/features/swim-resources/lib/events.ts`, `/tools/swim-resources/admin/results`, `/tools/swim-resources/admin/events` | ✅ Fixed (F) |
| H5, M17, M18, L5-L9, finishReason zombie (chatbot cluster) | ✅ Fixed (D, partially agent + manual: confirmPhrase removed & banner always required, ordered write queue, 1 MiB truncation, SSE error surfacing + multi-line/final-flush + throttled live text, abort-safe tool-result synthesis, truncation detected via `finish_reason`, re-entrancy guard, mount-race guard, route model allowlist + 502, MarkdownRenderer memo/link-allowlist/table-pipes/italic fix, AdminLoginFooter error codes, timer cleanups, redundant rename write removed) |
| firebase.ts dead collection exports, ThemeToggle `collapsed` prop, `firebase.ts` `VITE_*` dead env fallbacks | ✅ Fixed (wave 2) |
| L7-client ghost-delete ("unsaved conversation can't be deleted") | ✅ Verified unfounded — `deleteDoc` is idempotent in the Firestore JS SDK; no fix needed |
| M15d admin-vs-public roster sort order | Deferred (cosmetic) |
| Pre-existing repo lint errors (20) | Out of scope — all present before remediation |

Note: `bulkUpsertAttendance` now writes session-shaped docs (`records.${athleteId}` field-path merges) compatible with the attendance UIs; first recompute after deploy will purge stale athlete bests and set `isActiveRoster` correctly.