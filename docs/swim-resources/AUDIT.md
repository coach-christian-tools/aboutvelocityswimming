# Repo Audit: Cutter Coach — Correctness & Efficiency

## Phase 1 — Map the territory

**Stack:** Next.js 16.2.4 (App Router, Turbopack) + React 19.2.4, TypeScript 5 (strict, passes clean), Tailwind CSS v4, Firebase 12 (Firestore + Auth, Google provider), `xlsx` 0.18.5, date-fns, lucide-react. npm package manager. No DB besides Firestore; no server ORM — all Firestore access is client-side via the JS SDK. Deployment target: Vercel (per README scaffold); no Docker/CI config present.

**Entry points:** 1 server route (`src/app/api/admin/import/route.ts`, a Gemini proxy); frontend routes: `/` (stub), `/times`, `/athlete/[name]`, `/standards/{usa,champ}`, `/tools/swim-resources/attendance` + `/tools/swim-resources/attendance/admin` (the live attendance product), `/tools/swim-resources/admin/*` (roster, athletes, standards, import are real; goals/film/analysis/records/attendance stubs). Scripts: `scripts/swim-resources/*.mjs` (standards import, swimmer cleanup).

**Hot paths** (determined by route wiring + which pages contain real functionality vs. stubs):

1. `/tools/swim-resources/attendance/admin` → AttendanceView (coach tap-to-take-attendance, writes to Firestore + reads GCal per date change)
2. `/standards/usa` + `/standards/champ` (public standards tables, Firestore `onSnapshot`)
3. `/athlete/[name]` (public profile, Firestore query)
4. `/tools/swim-resources/admin/roster` + `/tools/swim-resources/admin/athletes` (heavy CRUD)
5. `/api/admin/import` (AI import agent loop)

`/` and `/times` are under-construction stubs.

**Analysis blockers:** Firestore security rules, Cloud Functions (a `sync_requests` trigger is implied by `src/app/attendance/services/db.ts:62-89`), and the Google Cloud Console key restrictions are all outside the repo — several auth findings are conditional on them. No tests exist. A prod build couldn't be run (read-only audit), so bundle numbers are estimates from dependency sizes.

---

## Findings table (sorted by impact ÷ effort)

| ID | Severity | Area | File:line | One-line issue | Est. impact | Est. effort |
|----|----------|------|-----------|----------------|-------------|-------------|
| F1 | HIGH | Security | src/app/api/admin/import/route.ts:18-21 | Unauthenticated Gemini proxy falls back to a public API key | Open API-cost abuse endpoint | XS |
| F2 | HIGH | Security | src/app/attendance/admin/page.tsx:9 | Attendance admin UI has zero auth check | Full attendance CRUD for anonymous users if rules allow | XS |
| F3 | HIGH | Correctness | src/app/attendance/components/AttendanceView.tsx:135-170 | Non-atomic read-modify-write of whole `records` map | Lost attendance marks with 2+ concurrent coaches | S |
| F4 | HIGH | Data loss | src/app/admin/import/page.tsx:614-647 | Base64 attachments persisted inside Firestore conversation docs | Silent chat-history loss; >1MiB doc writes fail | S |
| F5 | MEDIUM | Correctness | src/app/admin/athletes/page.tsx:504-551 | Optimistic updates never roll back on Firestore failure | UI shows saved data that isn't in DB | S |
| F6 | MEDIUM | Correctness | src/app/attendance/gcal.ts:22-25 | GCal fetch failure swallowed → empty list rendered as "No events found" | Coaches skip attendance on API/quota errors | XS |
| F7 | MEDIUM | Correctness | src/app/attendance/gcal.ts:19,27 | No `maxResults`/pagination on events.list (250 default cap) | Stats history silently truncated after ~1 season | XS |
| F8 | MEDIUM | Security | package.json:22 (`xlsx@^0.18.5`) | SheetJS 0.18.5 has known prototype-pollution + ReDoS CVEs | Malicious XLSX compromises admin browser | S |
| F9 | MEDIUM | Efficiency | src/app/attendance/services/db.ts:57-60 | `getAllAttendance()` full collection scan, read on every stats view | Unbounded Firestore read cost/latency over time | M |
| F10 | MEDIUM | Correctness | src/app/attendance/types.ts:7 vs src/features/swim-resources/types/schema.ts:1 | Two incompatible `Athlete` shapes written to same collection | Attendance-created athletes have no `aliases` → public profile 404s | S |
| F11 | LOW | Efficiency | src/app/admin/roster/page.tsx:732-748 | Group rename/delete does N sequential `updateDoc` round trips | Slow ops; partial state on mid-loop failure | S |
| F12 | LOW | Efficiency | src/app/admin/page.tsx:54-60 | Independent Firestore fetches awaited sequentially | ~2× dashboard load latency | XS |
| F13 | LOW | Efficiency | src/features/swim-resources/lib/services/import-tools.ts:88 | `inspectCollection` reads the full collection just to count | Whole-collection read per inspected collection | XS |
| F14 | LOW | Correctness | src/app/admin/import/page.tsx:754-762 | `saveConversation()` side effect inside `setState` updater | Double writes under StrictMode; fragile | S |
| F15 | LOW | Hygiene | src/features/swim-resources/components/RecordsView.tsx:1 | ~2,100 lines of dead components (`RecordsView`, `BestTimesView`, `TeamRecordsView`, `AnalysisView`, `Card`, `StaticHeader`) | Repo cruft, confusion | XS |

---

## Finding details

### F1 — Unauthenticated Gemini proxy on `/api/admin/import`

**What's wrong.** The route has no auth check and falls back to publicly-usable env keys:

```ts
// src/app/api/admin/import/route.ts:15-21
const apiKey =
  customApiKey?.trim() ||
  headerKey?.trim() ||
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY ||
  process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
```

`.env.local` sets `NEXT_PUBLIC_GOOGLE_API_KEY`, and there is no middleware (verified: no `middleware.ts` anywhere). The admin gate lives only in a client component (`src/app/admin/layout.tsx:56-62`).

**When it bites.** Anyone who can reach the deployment can POST `{"messages":[...]}` and get free `generateContent` calls billed to the server key (Gemini API enabled on that key) — unbounded quota/cost drain.

**The fix.** Delete the two env fallbacks (line 20-21) so the route only relays a caller-supplied key, or verify a Firebase ID token before proxying (Firebase Admin SDK, or a tokeninfo round-trip) — the key should never serve anonymous traffic.

**Confidence.** CONFIRMED (code path + env var present). Whether the key actually has Generative Language API enabled is outside the repo — that's the only unknown gating severity.

### F2 — `/tools/swim-resources/attendance/admin` renders with no authentication

**What's wrong.** `src/app/attendance/admin/page.tsx` (59 lines) directly renders `AttendanceView/GroupManager/StatsView` with no `onAuthStateChanged` check — unlike `/tools/swim-resources/attendance` (`src/app/attendance/page.tsx:14-44`) and `/tools/swim-resources/admin` (`src/app/admin/layout.tsx:56-62`), which at least redirect clients. Navigation to `/tools/swim-resources/attendance/admin` bypasses the gate entirely. Note the gate on `/tools/swim-resources/admin` itself is client-side only — every "protection" here is cosmetic if Firestore rules are permissive.

**When it bites.** Anyone typing `/tools/swim-resources/attendance/admin` gets the full attendance UI; whether they can read/write depends on rules not in this repo.

**The fix.** Extract the auth-gate from `src/app/attendance/page.tsx` into a shared guard (layout or hook) around `attendance/admin`, and (the real fix) enforce `request.auth.token.email.matches('.*@velocity-swimming.com')` in `firestore.rules` — which need to be added to the repo.

**Confidence.** CONFIRMED that the check is absent; impact SUSPECTED pending rules review.

### F3 — Lost updates in attendance writes (non-atomic read-modify-write)

**What's wrong.** Every mutation reads the whole `records` map from the render closure and rewrites it wholesale:

```ts
// src/app/attendance/components/AttendanceView.tsx:154-168
const current = attendance.records[athleteId] || 'unmarked';
...
const newRecords = { ...attendance.records, [athleteId]: next };
...
await saveAttendance(selectedEventId, dateStr, newRecords, ...);
```

and `saveAttendance` replaces the top-level `records` field (`src/app/attendance/services/db.ts:54`, `setDoc(..., { merge: true })` — merge is shallow, so the whole map is overwritten). Two coaches taking attendance simultaneously (this is a multi-coach tool): both read version N, the second write silently discards the first's marks. The same pattern applies to `handleGroupSelectionChange` (:122) and guest taps (:138-152). The `await saveAttendance(...)` calls also have no `catch` — a failed write is an unhandled rejection with the UI showing the optimistic state as truth.

**When it bites.** Any two writers to the same event doc (two coaches, phone + laptop), or a tap racing a re-render within one frame.

**The fix.** Write per-athlete field paths so writes commute: `await updateDoc(docRef, { ['records.' + athleteId]: next, eventId, date })` (create via `setDoc` merge if missing), and compute the new state from `setAllAttendance(prev => ...)` instead of the closure. Wrap in try/catch with a revert.

**Confidence.** CONFIRMED by code shape; the concurrency trigger is the standard multi-client case this app is designed for.

### F4 — Base64 attachments stored in Firestore conversation documents

**What's wrong.** `userMsg` carries full `attachments` (which include `base64Data` for PDFs/images, `src/features/swim-resources/lib/utils/attachment-parser.ts:204-228`) and the whole conversation is persisted:

```ts
// src/app/admin/import/page.tsx:614-620, 647
const userMsg: ChatMessage = { ..., attachments: currentAttachments, ... };
...
saveConversation(workingConv);
```

`saveConversation` writes the entire message array into one doc (`src/features/swim-resources/lib/services/import-conversations.ts:87-99`). Additionally, folder attachments are stringified with **no size cap** (`src/features/swim-resources/lib/utils/attachment-parser.ts:311` — `JSON.stringify(combinedDocs, null, 2)`), while single files are capped at 300KB (line 188).

**When it bites.** One screenshot/PDF >~750KB → every subsequent `saveConversation` exceeds Firestore's 1MiB doc limit; the error is swallowed (`import-conversations.ts:100-102` catches and only logs), so the chat silently stops persisting. Folder imports of Firestore backups blow the same limit immediately.

**The fix.** Strip `base64Data`/`textSnippet` from attachments before persisting (keep them in memory only): `saveConversation({ ...conv, messages: conv.messages.map(m => ({...m, attachments: m.attachments?.map(({base64Data, textSnippet, ...rest}) => rest)})) })`, and cap the folder snippet like the single-file path.

**Confidence.** CONFIRMED (limit is 1,048,576 bytes; payloads unbounded).

### F5 — Optimistic admin edits never roll back on failure

**What's wrong.**

```ts
// src/app/admin/athletes/page.tsx:527-535
} catch (err) {
  console.error(`Failed to update athlete ${athleteId}:`, err);
}
```

`handleUpdateAthlete` and `handleDeleteAthlete` apply the optimistic state change first; on Firestore failure the UI keeps showing the new value forever (same in `GroupManager.tsx:80-86` delete, and roster group rename's per-doc loop). The AthleteViewer even flashes "Saved" (`AthleteViewer.tsx:342`).

**When it bites.** Any permission error (offline, rules change, quota) — coach believes edits/deletes succeeded.

**The fix.** Snapshot `prev` in the optimistic updater, restore it in the `catch`, and surface an error toast/banner.

**Confidence.** CONFIRMED.

### F6 — Calendar API failure masquerades as "No events found"

**What's wrong.**

```ts
// src/app/attendance/gcal.ts:22-25
if (!res.ok) {
  console.error('Failed to fetch events', await res.text());
  return [];
}
```

`AttendanceView` renders `No events found.` for an empty list (`AttendanceView.tsx:391-392`); `StatsView` similarly shows "No attendance records found." (`StatsView.tsx:241-243`). A bad/quota-exhausted API key looks identical to a rest day — a coach could conclude there's no practice and not take attendance.

**The fix.** Return a discriminated result (`{ events } | { error }`) and render a distinct retry state.

**Confidence.** CONFIRMED.

### F7 — Google Calendar list has no pagination (250-event default cap)

**What's wrong.** `gcal.ts:27` / `:46` return `data.items || []` with no `nextPageToken` handling and no explicit `maxResults`. The Calendar API defaults to 250 items. `fetchEventsForRange(minDate, today)` (`StatsView.tsx:64`) spans the entire attendance history (capped at Apr 20, 2026 launch).

**When it bites.** At ~5 events/week, roughly a year of history starts silently dropping the oldest days from stats.

**The fix.** Loop: `while (data.nextPageToken) { ...&pageToken=${token} }` (or set `maxResults=2500`, the hard max).

**Confidence.** SUSPECTED (cap is documented API behavior; exact overflow date depends on event volume).

### F8 — `xlsx@0.18.5` has unpatched CVEs

**What's wrong.** `package.json:22` pins `xlsx@^0.18.5`; installed version verified as 0.18.5. npm's `xlsx` is frozen at 0.18.5; fixes for CVE-2023-30533 (prototype pollution via sheet objects, fixed 0.19.3) and CVE-2024-22363 (ReDoS, fixed 0.20.2) ship only via SheetJS's CDN. The library parses user-supplied spreadsheets in the admin's browser (`attachment-parser.ts:151`).

**When it bites.** A crafted `.xlsx` opened in the Import tool can pollute prototypes in the admin origin.

**The fix.** Switch the install source: `npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (same API, no code changes needed).

**Confidence.** CONFIRMED (version verified on disk; CVEs are public record).

### F9 — Unbounded full-collection reads on hot paths

**What's wrong.**

```ts
// src/app/attendance/services/db.ts:57-60
export const getAllAttendance = async (): Promise<AttendanceRecord[]> => {
  const snapshot = await getDocs(attendanceCol);
```

called by `StatsView.loadData` on every mount **and** every "Refresh" tap (`StatsView.tsx:44-47, 230`); repeated again in `admin/athletes/page.tsx:249`; and the "Download All Data" button re-reads athletes + attendance (`admin/page.tsx:243-244`). The attendance collection grows ~1 doc/event/day forever.

**When it bites.** Each stats view downloads every attendance document ever created; latency and egress grow linearly with history (by next season, thousands of docs per view).

**The fix.** Query a window: `query(attendanceCol, where('date', '>=', format(subDays(today, 14), 'yyyy-MM-dd')))` — needs a single-field index on `date` (auto). For aggregate stats, `getCountFromServer` + per-window fetch.

**Confidence.** CONFIRMED pattern; growth rate inferred from schema.

### F10 — Two incompatible `Athlete` schemas in one collection

**What's wrong.** `src/app/attendance/types.ts:7-15` (flat: `firstName/lastName/group/location`, no `aliases`, no `status`) vs `src/features/swim-resources/types/schema.ts:7-53` (nested `name`, `currentGroup`, `aliases`). `GroupManager`'s `addAthlete` writes only the flat shape (`services/db.ts:14-18`), while the public profile requires aliases:

```ts
// src/app/athlete/[name]/page.tsx:30
where('aliases', 'array-contains', athleteName)
```

Admin-created athletes get `aliases` (`admin/athletes/page.tsx:446-450`); attendance-created ones don't.

**When it bites.** Any athlete added via the attendance Group Manager has no working profile page and lacks `status`, so roster filters bucket them as "active" by fallback only.

**The fix.** Make `GroupManager`'s write go through the canonical shape (reuse the alias builder from `admin/athletes/page.tsx:446`), or move attendance to shared helpers.

**Confidence.** CONFIRMED divergence; profile breakage for attendance-created athletes is CONFIRMED by the query on `aliases`.

### F11 — Roster group rename/delete: N sequential round trips

**What's wrong.** `roster/page.tsx:732-748` and `:786-803`: `for (const athlete of affected) { await updateDoc(...) }` — one write per athlete, sequentially, with per-doc `catch` that can leave the roster half-migrated. The codebase already uses `writeBatch` correctly elsewhere (`import-tools.ts:448-457`).

**The fix.** Collect `updateDoc` calls into chunks of 450 via `writeBatch` (mirroring `clearCollection` in the same repo).

**Confidence.** CONFIRMED.

### F12 — Independent awaits serialized on the admin dashboard

**What's wrong.** `admin/page.tsx:54-60` awaits athletes then results; `admin/athletes/page.tsx:175-255` awaits meta → athletes → attendance. The latter's attendance fetch depends on nothing. Also `roster/page.tsx:396-421` (meta → athletes).

**The fix.** `const [aSnap, rSnap] = await Promise.all([...])`.

**Confidence.** CONFIRMED (fetches have no data dependency between them).

### F13 — `inspectCollection` reads every document twice

**What's wrong.** `import-tools.ts:81-88`: first `getDocs(query(colRef, limit(n)))` for samples, then `getDocs(colRef)` — a full scan — just to get `size`. Ten collections → ten full scans per "Collections" click (`import/page.tsx:447-454`).

**The fix.** Use `getCountFromServer(colRef)` for the count (exists in firebase/firestore v12).

**Confidence.** CONFIRMED.

### F14 — Firestore writes inside `setState` updaters

**What's wrong.** Four occurrences like:

```ts
// src/app/admin/import/page.tsx:754-762
setCurrentConversation(prev => {
  const updated = {...};
  saveConversation(updated);   // side effect in updater
  return updated;
});
```

Updaters must be pure; under StrictMode they run twice → duplicate writes; ordering with other updaters is also unguaranteed.

**The fix.** Compute the next conversation outside (or in an effect keyed to it), then `setCurrentConversation(updated); saveConversation(updated);`.

**Confidence.** CONFIRMED.

### F15 — ~2,100 lines of dead components

**What's wrong.** `RecordsView.tsx` (728), `TeamRecordsView.tsx` (308), `AnalysisView.tsx` (377), `BestTimesView.tsx` (268), `Card.tsx`, `StaticHeader.tsx` are imported by nothing (grep-verified); `admin/records/page.tsx` and `admin/goals|film|analysis` return `null`. Not a bundle issue (route-level pruning drops them), but they reference an obsolete results schema and invite wrong-code edits.

**The fix.** Delete, or move to an `archive/` folder.

**Confidence.** CONFIRMED via import graph.

---

## Handled correctly in non-obvious ways (not flagged)

- The `VITE_*` env names work because `next.config.ts` explicitly re-exposes them via the `env` block (`next.config.ts:4-14`).
- `cleanFirestoreData` correctly preserves FieldValue sentinels and strips `undefined` (`firestore-cleaner.ts:26-33`).
- Roster notes HTML is escaped before name-bolding (`roster/page.tsx:113-138`).
- The roster notes editor deliberately skips DOM sync while the field has focus to protect the cursor (`roster/page.tsx:237`).
- Batch writes are correctly chunked at 450.

## Couldn't audit / need access

- Firestore security rules and the Cloud Function consuming `sync_requests` (not in repo — this gates the true severity of F2).
- Google Cloud key restrictions (API enablement/referrer limits) for F1/F8.
- The production deployment env (only `.env.local` present).
- No test suite exists to run.

## First three changes

1. Authenticate `/api/admin/import` and drop the server-side key fallback.
2. Switch attendance writes to per-field `updateDoc` with error handling.
3. Strip base64/snippets from persisted conversations and cap folder snippets.
