export function scopedClasses(styles: Record<string, string>, value: string) {
  return value
    .split(/\s+/)
    .map((name) => styles[name] ?? name)
    .join(" ");
}
