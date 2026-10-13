// Decode only the shape represented by the defaults; malformed shared links
// must not put null arrays or objects into filter controls.
function matchesShape(value: unknown, fallback: unknown): boolean {
  if (Array.isArray(fallback))
    return (
      Array.isArray(value) && value.every((item) => typeof item === "string")
    );
  if (typeof fallback === "object" && fallback !== null)
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      Object.entries(fallback).every(([key, sample]) =>
        matchesShape((value as Record<string, unknown>)[key], sample),
      )
    );
  if (typeof fallback === "number")
    return (
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    );
  return typeof value === typeof fallback;
}

export function readTimesSelection<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    const value: unknown = typeof fallback === "string" ? raw : JSON.parse(raw);
    return matchesShape(value, fallback) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeTimesSelection<T>(
  url: URL,
  key: string,
  value: T,
  fallback: T,
) {
  if (JSON.stringify(value) === JSON.stringify(fallback))
    url.searchParams.delete(key);
  else
    url.searchParams.set(
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    );
  return `${url.pathname}${url.search}${url.hash}`;
}
