import "server-only";

import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { gzip, gunzip } from "node:zlib";
import { unstable_cache } from "next/cache";
import { parseCalendar, validateCalendar } from "./calendar";
import { CALENDAR_FEED, monthDays } from "./calendar-shared";

const compress = promisify(gzip);
const decompress = promisify(gunzip);

// The raw ICS exceeds Next's 2 MB Data Cache limit. Store a compressed,
// validated snapshot shared by every month, including server-rendered pages.
async function fetchCalendarSnapshot() {
  const response = await fetch(CALENDAR_FEED, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Calendar returned ${response.status}`);
  const source = await response.text();
  await validateCalendar(source);
  const snapshot = {
    revision: createHash("sha256").update(source).digest("hex"),
    compressed: (await compress(source)).toString("base64"),
  };
  // Leave room for Next's cache metadata. A failed refresh must not replace
  // the last successful snapshot with an entry the cache cannot store.
  if (Buffer.byteLength(JSON.stringify(snapshot)) > 2 * 1024 * 1024 - 1024) {
    throw new Error("Calendar feed is too large to cache.");
  }
  return snapshot;
}

// Next includes the callback's source in its cache key. RSC and route-handler
// bundles rename that source differently. Binding gives it the same native
// function identity in both bundles; explicit, versioned keys identify the work.
const getCalendarSnapshot = unstable_cache(fetchCalendarSnapshot.bind(null),
  ["velocity-calendar-feed-v1", CALENDAR_FEED], { revalidate: 300 });

export async function getMonthEvents(month: string) {
  // Keep these cache calls sequential, not nested: Next bypasses the inner
  // unstable_cache when called from another cached callback.
  const snapshot = await getCalendarSnapshot();
  const readMonth = async () => {
    const source = (await decompress(Buffer.from(snapshot.compressed, "base64"))).toString("utf8");
    const days = monthDays(month);
    const from = new Date(`${days[0]}T00:00:00Z`);
    const to = new Date(new Date(`${days.at(-1)}T00:00:00Z`).getTime() + 2 * 86400000);
    return parseCalendar(source, from, to);
  };
  return unstable_cache(readMonth.bind(null),
    ["velocity-calendar-month-v2", snapshot.revision, month], { revalidate: 300 })();
}
