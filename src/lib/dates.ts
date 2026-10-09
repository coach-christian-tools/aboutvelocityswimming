export const TEAM_TIME_ZONE = "America/Los_Angeles";
export const teamDate = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TEAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export const formatTeamDate = (
  date: Date,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
) =>
  new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: TEAM_TIME_ZONE,
  }).format(date);
/** Resolve a Pacific wall-clock input, including daylight saving changes. */
export function teamWallTime(date: string, time = "00:00"): Date {
  const [year, month, day] = date.split("-").map(Number),
    [hour, minute] = time.split(":").map(Number);
  const wallTime = Date.UTC(year, month - 1, day, hour, minute);
  let utc = wallTime;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TEAM_TIME_ZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    }).formatToParts(new Date(utc));
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    utc +=
      wallTime -
      Date.UTC(
        +values.year,
        +values.month - 1,
        +values.day,
        +values.hour,
        +values.minute,
      );
  }
  return new Date(utc);
}
