/** Milliseconds remain the stored unit; strings accept seconds, m:ss or h:mm:ss. */
export function parseSwimTime(value: string | number | null | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
  if (!value?.trim()) return undefined;
  const parts = value.trim().split(':');
  if (parts.length > 3 || parts.some(p => !/^\d+(?:\.\d+)?$/.test(p))) return undefined;
  if (parts.slice(0, -1).some(p => p.includes('.'))) return undefined;
  if (parts.length > 1 && Number(parts.at(-1)) >= 60) return undefined;
  if (parts.length === 3 && Number(parts[1]) >= 60) return undefined;
  return Math.round(parts.reduce((total, part) => total * 60 + Number(part), 0) * 1000);
}

export function formatSwimTime(ms: number | null | undefined, empty = '—'): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return empty;
  const centiseconds = Math.round(ms / 10);
  const seconds = centiseconds % 6000 / 100;
  const minutes = Math.floor(centiseconds / 6000);
  return minutes ? `${minutes}:${seconds.toFixed(2).padStart(5, '0')}` : seconds.toFixed(2);
}
