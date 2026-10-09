const TIME_ZONE = "America/Los_Angeles";

function midnight(year: number, month: number, day: number) {
  const wallTime = Date.UTC(year, month - 1, day);
  let utcTime = wallTime;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    }).formatToParts(new Date(utcTime));
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      +values.year,
      +values.month - 1,
      +values.day,
      +values.hour,
      +values.minute,
      +values.second,
    );
    utcTime += wallTime - represented;
  }
  return new Date(utcTime);
}

export function reminderWindow(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const target = new Date(
    Date.UTC(+values.year, +values.month - 1, +values.day + 2),
  );
  const next = new Date(target);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    start: midnight(
      target.getUTCFullYear(),
      target.getUTCMonth() + 1,
      target.getUTCDate(),
    ),
    end: midnight(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
    ),
  };
}

export function pacificEndOfDay(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const next = new Date(
    Date.UTC(+values.year, +values.month - 1, +values.day + 1),
  );
  return midnight(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
  );
}
