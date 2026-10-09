import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Instant } from '../../src/lib/instant.ts'
import { postingHours, completedHours, volunteerLogs } from '../../src/features/workshare/lib/hours.ts'
import { normalizeEmails } from '../../src/features/workshare/lib/families.ts'
import { reminderWindow } from '../../src/lib/reminder-window.ts'
import type { Posting, Registration, ManualHour } from '../../src/features/workshare/types/index.ts'

const post: Posting = {
  id: 'shift', title: 'Timing', type: 'General', date: Instant.fromMillis(0),
  status: 'Open', positions: { min: 1, desired: 2, max: 3 }
}
const registration: Registration = {
  id: 'registration', postingId: post.id, familyId: 'family',
  assignee: { name: 'Volunteer', isGuest: false }, status: 'Complete'
}

test('untimed completed shifts have matching totals and log credit', () => {
  assert.equal(postingHours(post), 1)
  assert.deepEqual(completedHours([registration], { shift: post }, []), { general: 1, event: 0 })
  assert.equal(volunteerLogs([registration], { shift: post }, [])[0].hours, 1)
})

test('invalid durations cannot subtract earned credit', () => {
  assert.equal(postingHours({ ...post, startTime: Instant.fromMillis(3600000), endTime: Instant.fromMillis(0) }), 0)
})

test('historical snapshots survive posting changes or removal', () => {
  const awarded = { ...registration, shiftSnapshot: post }
  const edited = { ...post, type: 'Event-Specific' as const, startTime: Instant.fromMillis(0), endTime: Instant.fromMillis(7200000) }
  assert.deepEqual(completedHours([awarded], { shift: edited }, []), { general: 1, event: 0 })
  assert.deepEqual(completedHours([awarded], {}, []), { general: 1, event: 0 })
  assert.equal(volunteerLogs([awarded], {}, [])[0].title, 'Timing')
})

test('incomplete and pending shifts do not show awarded hours', () => {
  const incomplete = { ...registration, status: 'Incomplete' as const }
  const pending = { ...registration, status: 'Pending' as const }
  assert.deepEqual(completedHours([incomplete, pending], { shift: post }, []), { general: 0, event: 0 })
  assert.equal(volunteerLogs([incomplete, pending], { shift: post }, []).length, 1)
  assert.equal(volunteerLogs([incomplete], { shift: post }, [])[0].hours, 0)
  assert.equal(volunteerLogs([pending], { shift: post }, [], true).length, 1)
})

test('manual adjustments count in the correct pool', () => {
  const entry: ManualHour = { id: 'manual', familyId: 'family', date: Instant.fromMillis(0), hours: 2.5, type: 'Event-Specific' }
  assert.deepEqual(completedHours([registration], { shift: post }, [entry]), { general: 1, event: 2.5 })
})

test('emails are normalized and deduplicated', () => {
  assert.deepEqual(normalizeEmails(' Parent@Example.com, parent@example.com, , other@example.com '), ['parent@example.com', 'other@example.com'])
})

test('reminders target two calendar days ahead in Pacific time', () => {
  const window = reminderWindow(new Date('2026-10-09T01:00:00Z')) // October 8 in Pacific time
  assert.equal(window.start.toISOString(), '2026-10-10T07:00:00.000Z')
  assert.equal(window.end.toISOString(), '2026-10-11T07:00:00.000Z')
})

test('reminder window covers the 23-hour spring DST day', () => {
  const window = reminderWindow(new Date('2026-03-06T08:00:00Z'))
  assert.equal(window.start.toISOString(), '2026-03-08T08:00:00.000Z')
  assert.equal(window.end.toISOString(), '2026-03-09T07:00:00.000Z')
})

test('reminder window covers the 25-hour autumn DST day', () => {
  const window = reminderWindow(new Date('2026-10-30T07:00:00Z'))
  assert.equal(window.start.toISOString(), '2026-11-01T07:00:00.000Z')
  assert.equal(window.end.toISOString(), '2026-11-02T08:00:00.000Z')
})
