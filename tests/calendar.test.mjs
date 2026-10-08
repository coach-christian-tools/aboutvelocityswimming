import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const { parseCalendar } = require(join(process.env.CALENDAR_MODULE_DIR, "calendar.js"));
const { monthDays, eventsOnDay, calendarDate } = require(join(process.env.CALENDAR_MODULE_DIR, "calendar-shared.js"));
const ics = (...events) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.map(event => `BEGIN:VEVENT\r\n${event}\r\nEND:VEVENT`).join("\r\n")}\r\nEND:VCALENDAR`;
const from = new Date("2026-10-01T00:00:00Z");
const to = new Date("2026-12-01T00:00:00Z");

test("recurrences keep Pacific practice times across DST and respect excluded dates", async () => {
  const events = await parseCalendar(ics("UID:practice\r\nDTSTART;TZID=America/Los_Angeles:20261026T170000\r\nDTEND;TZID=America/Los_Angeles:20261026T180000\r\nRRULE:FREQ=WEEKLY;COUNT=4\r\nEXDATE;TZID=America/Los_Angeles:20261109T170000\r\nSUMMARY:Seniors"), from, to);
  assert.deepEqual(events.map(event => event.start), ["2026-10-27T00:00:00.000Z", "2026-11-03T01:00:00.000Z", "2026-11-17T01:00:00.000Z"]);
  assert.deepEqual(events.map(event => event.startDay), ["2026-10-26", "2026-11-02", "2026-11-16"]);
});

test("modified practices replace the original and canceled instances are hidden", async () => {
  const events = await parseCalendar(ics(
    "UID:practice\r\nDTSTART;TZID=America/Los_Angeles:20261005T170000\r\nDTEND;TZID=America/Los_Angeles:20261005T180000\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nSUMMARY:Prep\r\nLOCATION:Pool A",
    "UID:practice\r\nRECURRENCE-ID;TZID=America/Los_Angeles:20261012T170000\r\nDTSTART;TZID=America/Los_Angeles:20261013T180000\r\nDTEND;TZID=America/Los_Angeles:20261013T190000\r\nSUMMARY:Prep moved\r\nLOCATION:Pool B",
    "UID:practice\r\nRECURRENCE-ID;TZID=America/Los_Angeles:20261019T170000\r\nDTSTART;TZID=America/Los_Angeles:20261019T170000\r\nDTEND;TZID=America/Los_Angeles:20261019T180000\r\nSTATUS:CANCELLED\r\nSUMMARY:Prep",
  ), from, to);
  assert.equal(events.length, 2);
  assert.equal(events[1].title, "Prep moved");
  assert.equal(events[1].startDay, "2026-10-13");
  assert.equal(events[1].location, "Pool B");
});

test("an override moved from outside the requested range is still included", async () => {
  const events = await parseCalendar(ics(
    "UID:moved\r\nDTSTART;TZID=America/Los_Angeles:20260901T170000\r\nDTEND;TZID=America/Los_Angeles:20260901T180000\r\nRRULE:FREQ=WEEKLY;COUNT=2\r\nSUMMARY:Practice",
    "UID:moved\r\nRECURRENCE-ID;TZID=America/Los_Angeles:20260908T170000\r\nDTSTART;TZID=America/Los_Angeles:20261002T170000\r\nDTEND;TZID=America/Los_Angeles:20261002T180000\r\nSUMMARY:Moved practice",
  ), from, to);
  assert.equal(events.length, 1);
  assert.equal(events[0].startDay, "2026-10-02");
});

test("all-day meets use inclusive displayed days and do not shift with host timezone", async () => {
  const events = await parseCalendar(ics("UID:meet\r\nDTSTART;VALUE=DATE:20261009\r\nDTEND;VALUE=DATE:20261012\r\nSUMMARY:Fall Meet"), from, to);
  assert.equal(events[0].startDay, "2026-10-09");
  assert.equal(events[0].endDay, "2026-10-11");
  assert.equal(eventsOnDay(events, "2026-10-10").length, 1);
  assert.equal(eventsOnDay(events, "2026-10-12").length, 0);
});

test("ongoing meets and explicit no-practice notices remain visible", async () => {
  const events = await parseCalendar(ics(
    "UID:ongoing\r\nDTSTART;VALUE=DATE:20260930\r\nDTEND;VALUE=DATE:20261003\r\nSUMMARY:Meet",
    "UID:notice\r\nDTSTART;VALUE=DATE:20261005\r\nSUMMARY:No practice",
    "UID:cancel\r\nDTSTART;VALUE=DATE:20261005\r\nSTATUS:CANCELLED\r\nSUMMARY:Practice",
  ), from, to);
  assert.equal(events.length, 2);
  assert.equal(events[0].endDay, "2026-10-02");
  assert.equal(events[1].title, "No practice");
});

test("calendar dates and month grids use the team timezone and full weeks", () => {
  assert.equal(calendarDate(new Date("2026-10-02T01:00:00Z")), "2026-10-01");
  const days = monthDays("2026-10");
  assert.equal(days.length, 35);
  assert.equal(days[0], "2026-09-27");
  assert.equal(days.at(-1), "2026-10-31");
  assert.equal(monthDays("2026-08").length, 42);
});

test("upstream HTML is rejected instead of appearing as an empty calendar", async () => {
  await assert.rejects(parseCalendar("<html>Sign in</html>", from, to), /Invalid calendar response/);
});
