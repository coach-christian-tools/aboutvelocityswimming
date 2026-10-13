import type { TimesResponse } from "./times-api";
export const timesCache = new Map<string, TimesResponse>();
export let timesGeneration = 0;
export function clearTimesCache() {
  timesCache.clear();
  timesGeneration++;
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("ies-times-changed"));
}
export function timesBucket(now = Date.now()) {
  return Math.floor(now / 60000);
}
export function timesExpiry(bucket: number) {
  return (bucket + 1) * 60000;
}
