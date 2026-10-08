# Parallel Agent Batches — Cutter Coach Audit Remediation

Companion to `AUDIT.md`. The 15 findings are partitioned into **4 disjoint batches** so 4 agents can work simultaneously without file conflicts. Each batch block below is a self-contained prompt — paste one per agent.

## File-ownership map (the conflict boundary)

| Batch | Owns (exclusive write access) | Findings |
|-------|-------------------------------|----------|
| 1 | `src/app/attendance/**` | F2, F3, F6, F7, F9 (part), F10, F5 (GroupManager part) |
| 2 | `src/app/admin/athletes/page.tsx`, `src/app/admin/page.tsx`, `src/app/admin/roster/page.tsx`, `src/features/swim-resources/components/admin/AthleteViewer.tsx` | F5, F11, F12 |
| 3 | `src/app/api/admin/import/route.ts`, `src/app/admin/import/page.tsx`, `src/features/swim-resources/lib/services/import-conversations.ts`, `src/features/swim-resources/lib/services/import-tools.ts`, `src/features/swim-resources/lib/utils/attachment-parser.ts` | F1, F4, F13, F14 |
| 4 | `package.json`, `package-lock.json`, dead files listed below | F8, F15 |

No file is owned by two batches. `src/features/swim-resources/lib/utils/firestore-cleaner.ts`, `src/features/swim-resources/lib/firebase.ts`, `src/features/swim-resources/types/schema.ts`, and `next.config.ts` are **read-only** for all batches.

## Suggested sequencing

- Launch Batches 1–3 simultaneously (highest value first: Batch 1).
- Launch Batch 4 last or in parallel — it is independent, but it rewrites `package-lock.json`, so nothing else should run `npm install` concurrently.
- After all four land: run the integration check at the bottom, then merge.

---

## Batch 1 — Attendance app hardening

```
You are fixing defects in the attendance feature of a Next.js 16 + Firebase 12 app.

RULES: You may ONLY modify files under src/app/attendance/**. Do not touch any other
file (other agents are working in parallel). Do not commit. Read AUDIT.md (sections
F2, F3, F6, F7, F9, F10 and the GroupManager part of F5) for full evidence.

Findings to fix, in priority order:

F3 (HIGH) — Lost updates in attendance writes.
  src/app/attendance/components/AttendanceView.tsx:135-170: every tap reads the whole
  `records` map from the render closure and rewrites it via saveAttendance(), and
  src/app/attendance/services/db.ts:41-55 does setDoc(..., {merge:true}) which is a
  SHALLOW merge — so the entire `records` map is overwritten. Two concurrent coaches
  silently lose each other's marks. The awaited saves also have no catch, so failures
  surface as unhandled rejections while the optimistic UI shows success.
  FIX: in db.ts add a per-athlete update path, e.g.
    setAttendanceStatus(eventId, date, athleteId, status)  ->
      updateDoc(docRef, { ['records.' + athleteId]: status, eventId, date })
    (create the doc first with setDoc merge if it doesn't exist; same for guests via
    'guests.<id>.status'). Update all handlers in AttendanceView.tsx to use it and to
    derive new state from the setAllAttendance(prev => ...) callback instead of the
    render closure. Wrap writes in try/catch and revert optimistic state on error.

F2 (HIGH) — /attendance/admin has no auth check.
  src/app/attendance/admin/page.tsx renders AttendanceView/GroupManager/StatsView
  directly. /attendance (src/app/attendance/page.tsx:13-44) has the onAuthStateChanged
  gate that checks email ends with '@velocity-swimming.com'. Extract that gate into a
  reusable component/hook (e.g. src/app/attendance/components/RequireAuth.tsx) and wrap
  the admin dashboard with it, preserving the current redirect behavior.

F6 (MEDIUM) — GCal failures render as "No events found."
  src/app/attendance/gcal.ts:22-25 and :40-43 swallow !res.ok and return []. Callers
  render "No events found." (AttendanceView.tsx:391-392) / "No attendance records
  found." (StatsView.tsx:241-243), which is indistinguishable from a rest day.
  FIX: return a discriminated result (e.g. { events } | { error: string }) and render
  a distinct error state with a Retry button in AttendanceView and StatsView.

F7 (MEDIUM) — No pagination on Calendar API.
  src/app/attendance/gcal.ts:19,27 and :38,46 never send maxResults and never follow
  data.nextPageToken (default cap 250 events). StatsView.tsx:64 fetches a range
  spanning the whole history. FIX: loop on nextPageToken (and/or maxResults=2500).

F10 (MEDIUM) — Two incompatible Athlete schemas in one collection.
  src/app/attendance/types.ts:7-15 is flat (firstName/lastName/group/location, no
  aliases/status) but the public profile queries where('aliases','array-contains',name)
  (src/app/athlete/[name]/page.tsx:30 — read-only reference, do not edit) and the
  canonical schema is src/features/swim-resources/types/schema.ts:7-53 (read-only reference).
  FIX: make GroupManager's addAthlete/updateAthlete path (via services/db.ts) write the
  canonical shape: nested name{first,last,preferred}, currentGroup{id,name,assignedAt},
  status, aliases (["First Last","Last, First", preferred variants]), metadata, plus the
  legacy flat fields for backward compatibility. Reuse the alias-building approach from
  src/app/admin/athletes/page.tsx:446-450 as a reference (read-only).

F9 part (MEDIUM) — Unbounded reads for stats.
  src/app/attendance/services/db.ts:57-60 getAllAttendance() scans the whole
  collection; StatsView.tsx calls it on every mount and every Refresh tap.
  FIX: add getRecentAttendance(daysBack = 14) using
  query(attendanceCol, where('date','>=',format(subDays(today,daysBack),'yyyy-MM-dd')))
  and switch StatsView to it. Keep getAllAttendance exported for other callers.

F5 part — GroupManager delete (GroupManager.tsx:80-86) has the same optimistic-update-
  without-rollback problem: snapshot prev state and restore it in catch.

VERIFICATION:
  npx tsc --noEmit        # must introduce no new errors
  npx eslint src/app/attendance
  Manual: sign in flow for /attendance/admin; take attendance; toggle a guest; check stats.
```

---

## Batch 2 — Admin roster / athletes / dashboard

```
You are fixing defects in the admin CRUD pages of a Next.js 16 + Firebase 12 app.

RULES: You may ONLY modify these files:
  src/app/admin/athletes/page.tsx
  src/app/admin/page.tsx
  src/app/admin/roster/page.tsx
  src/features/swim-resources/components/admin/AthleteViewer.tsx
Do not touch any other file (other agents are working in parallel; note that
src/app/attendance/**, src/app/admin/import/*, src/features/swim-resources/lib/services/* are owned by other
agents). Do not commit. Read AUDIT.md (F5, F11, F12) for full evidence.

F5 (MEDIUM) — Optimistic updates never roll back.
  src/app/admin/athletes/page.tsx:504-551: handleUpdateAthlete/handleDeleteAthlete
  apply state first, then catch only console.error's — UI shows saved data that isn't
  in Firestore, and AthleteViewer.tsx:342 even flashes "Saved".
  FIX: snapshot the previous state inside the updater, restore it in catch, and
  surface a visible error (banner/toast). Mirror the same pattern for the group
  rename/delete loops in roster/page.tsx (732-748, 786-803): if any batch fails,
  revert the affected athletes and show an error.

F11 (LOW) — N sequential round trips for group rename/delete.
  src/app/admin/roster/page.tsx:732-748 and :786-803 loop
  `for (const athlete of affected) { await updateDoc(...) }`. The repo already has the
  correct pattern in src/features/swim-resources/lib/services/import-tools.ts:448-457 (read-only reference):
  chunk writes into writeBatch batches of <=450 and await batch.commit() per chunk.
  Apply that here.

F12 (LOW) — Independent awaits serialized.
  src/app/admin/page.tsx:54-60 awaits athletes then results (no dependency) —
  parallelize with Promise.all.
  src/app/admin/athletes/page.tsx:175-255 awaits meta -> athletes -> attendance;
  the attendance fetch (line ~249) is independent of the athletes fetch — run the
  athletes+attendance fetches concurrently (meta -> athletes must stay ordered only if
  you keep the current structure; athletes and attendance are independent).
  src/app/admin/roster/page.tsx:396-421: meta then athletes — leave ordered (athletes
  processing depends on nothing from meta, so these may also be parallelized if safe).

Optional: the getAllAttendance call in admin/athletes/page.tsx:249 is part of the
unbounded-read finding F9, but the primary fix lives in another batch — leave the call
as-is unless a windowed variant already exists when you run.

VERIFICATION:
  npx tsc --noEmit        # must introduce no new errors
  npx eslint src/app/admin
  Manual: rename a roster group, drag an athlete between groups, delete an athlete,
  load /admin dashboard.
```

---

## Batch 3 — Import / AI pipeline

```
You are fixing defects in the Gemini import pipeline of a Next.js 16 + Firebase 12 app.

RULES: You may ONLY modify these files:
  src/app/api/admin/import/route.ts
  src/app/admin/import/page.tsx
  src/features/swim-resources/lib/services/import-conversations.ts
  src/features/swim-resources/lib/services/import-tools.ts
  src/features/swim-resources/lib/utils/attachment-parser.ts
Do not touch any other file (other agents are working in parallel). Do not commit.
Read AUDIT.md (F1, F4, F13, F14) for full evidence.

F1 (HIGH) — Unauthenticated proxy falls back to a server API key.
  src/app/api/admin/import/route.ts:15-21: apiKey resolution includes
  process.env.GEMINI_API_KEY / GOOGLE_GENAI_API_KEY / NEXT_PUBLIC_GEMINI_API_KEY /
  NEXT_PUBLIC_GOOGLE_API_KEY, and there is no middleware — anyone can POST and drain
  the server key. FIX (minimal): remove the process.env fallbacks from the chain so the
  route only forwards a caller-supplied key (customApiKey or x-gemini-api-key header).
  If a server key must remain, first verify a Firebase ID token before proxying.

F4 (HIGH) — Base64 attachments persisted into Firestore conversation docs.
  src/app/admin/import/page.tsx:614-647 builds ChatMessage objects carrying full
  attachments (base64Data for PDFs/images from attachment-parser.ts:204-228) and
  saveConversation (import-conversations.ts:87-99) writes every message into ONE doc.
  Firestore's doc limit is 1,048,576 bytes; failures are swallowed
  (import-conversations.ts:100-102) so chats silently stop persisting. Also folder
  attachments are stringified with NO cap (attachment-parser.ts:311).
  FIX: strip base64Data and textSnippet from attachments before persisting (keep them
  in memory for the live API call), e.g. sanitize in saveConversation or at the
  call sites; and cap the folder JSON snippet in attachment-parser.ts the same way
  single files are capped at 300KB (line 188).

F14 (LOW) — Side effects inside setState updaters.
  src/app/admin/import/page.tsx (4 sites, e.g. 754-762): setCurrentConversation(prev
  => { ...; saveConversation(updated); return updated; }). Updaters must be pure;
  StrictMode double-invokes them -> duplicate Firestore writes.
  FIX: compute the updated conversation outside the updater, then
  setCurrentConversation(updated); saveConversation(updated);

F13 (LOW) — inspectCollection reads every document twice.
  src/features/swim-resources/lib/services/import-tools.ts:81-88: a limited sample query AND a full-collection
  getDocs just for size. FIX: use getCountFromServer(colRef) for the count (available
  in firebase/firestore v12) and keep the limited sample query.

VERIFICATION:
  npx tsc --noEmit        # must introduce no new errors
  npx eslint src/app/admin/import src/app/api src/lib
  Manual: open /admin/import, send a message with a small image attachment, reload —
  history should persist without base64; click "Collections" — counts still correct.
```

---

## Batch 4 — Dependencies & dead code

```
You are doing dependency hygiene and dead-code removal in a Next.js 16 app.

RULES: You may ONLY touch package.json, package-lock.json (via npm), and DELETE the
dead files listed below. Other agents are editing src/app/** in parallel — do not
modify any file under src/ except deleting exactly the files listed. Do not commit.

F8 (MEDIUM) — xlsx 0.18.5 has unpatched CVEs (CVE-2023-30533 prototype pollution,
CVE-2024-22363 ReDoS). npm's xlsx is frozen at 0.18.5; fixes only ship from SheetJS's
CDN. FIX:
  npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
API is compatible (the code uses XLSX.read / XLSX.utils.sheet_to_csv in
src/features/swim-resources/lib/utils/attachment-parser.ts — read-only reference).

F15 (LOW) — Dead components (import-graph verified, nothing imports them):
  src/features/swim-resources/components/RecordsView.tsx
  src/features/swim-resources/components/TeamRecordsView.tsx
  src/features/swim-resources/components/AnalysisView.tsx
  src/features/swim-resources/components/BestTimesView.tsx
  src/features/swim-resources/components/Card.tsx
  src/features/swim-resources/components/StaticHeader.tsx
Delete all six. Before deleting, re-verify zero imports with:
  grep -rn "RecordsView\|BestTimesView\|TeamRecordsView\|AnalysisView\|Card\|StaticHeader" src --include='*.tsx'
excluding the files themselves (AnalysisView/TeamRecordsView/BestTimesView import
FROM RecordsView — they are all being deleted together, that is expected).

VERIFICATION:
  npx tsc --noEmit        # must introduce no new errors
  npx eslint .
  node -e "console.log(require('./node_modules/xlsx/package.json').version)"  # expect 0.20.3
  npm run build           # final sanity
```

---

## Post-merge integration check (run once, after all batches land)

```
npx tsc --noEmit && npx eslint . && npm run build
```

Manual smoke test, in order:
1. `/tools/swim-resources/attendance/admin` — unauthenticated visit redirects to sign-in (Batch 1).
2. Take attendance from two browser windows simultaneously; both marks persist (Batch 1).
3. `/tools/swim-resources/admin/import` — send a chat with a PDF attachment, reload, history intact (Batch 3).
4. POST to `/api/admin/import` with no key header/body — expect 400, not a Gemini call (Batch 3).
5. Rename a roster group with several athletes — completes fast, no partial state (Batch 2).
```
