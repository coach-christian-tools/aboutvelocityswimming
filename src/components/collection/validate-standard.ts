/** Shared by the collector and tests; the database independently enforces these rules. */
export function validateStandard(value: unknown, id?: string): void {
  const obj = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw new Error("Standards require objects at each matrix level");
    return v as Record<string, unknown>;
  };
  const set = obj(value);
  for (const key of [
    "id",
    "name",
    "governingBody",
    "seasonYears",
    "effectiveDate",
    "expirationDate",
    "sourceUrl",
  ])
    if (typeof set[key] !== "string" || !(set[key] as string).trim())
      throw new Error(`Standard requires ${key}`);
  if (id && set.id !== id)
    throw new Error("Standard ID must match its record path");
  if (!["motivational", "championship"].includes(String(set.category)))
    throw new Error("Invalid standard category");
  if (!/^https?:\/\/[^\s]+$/.test(String(set.sourceUrl)))
    throw new Error("Official source URL required");
  for (const key of ["effectiveDate", "expirationDate"]) {
    const date = String(set[key]);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new Error("Invalid standard date");
  }
  if (String(set.effectiveDate) > String(set.expirationDate))
    throw new Error("Standard dates are reversed");
  let count = 0;
  for (const [course, genders] of Object.entries(obj(set.cuts))) {
    if (!["SCY", "SCM", "LCM"].includes(course))
      throw new Error("Invalid course");
    for (const [gender, ages] of Object.entries(obj(genders))) {
      if (!["F", "M", "Mixed"].includes(gender))
        throw new Error("Invalid gender");
      for (const [age, events] of Object.entries(obj(ages))) {
        if (!age.trim()) throw new Error("Age group required");
        for (const [event, data] of Object.entries(obj(events))) {
          if (
            !new RegExp(
              `^[1-9][0-9]*_(FR|BK|BR|FL|IM|FR-R|MED-R)_${course}$`,
            ).test(event)
          )
            throw new Error("Event and course must match");
          const tiers = obj(data).cutsByTier;
          if (!Array.isArray(tiers) || !tiers.length)
            throw new Error("Event requires cutsByTier");
          const seen = new Set();
          for (const value of tiers) {
            const cut = obj(value);
            if (
              typeof cut.tierName !== "string" ||
              !cut.tierName.trim() ||
              seen.has(cut.tierName)
            )
              throw new Error("Invalid or duplicate tier");
            seen.add(cut.tierName);
            if (
              !Number.isInteger(cut.timeMs) ||
              Number(cut.timeMs) <= 0 ||
              Number(cut.timeMs) > 2147483647
            )
              throw new Error("Cut requires positive integer milliseconds");
            count++;
          }
        }
      }
    }
  }
  if (!count) throw new Error("Standard requires at least one cut");
}
