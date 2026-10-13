export const strokeColumns = [
  ["IM", "IM", "Individual Medley"],
  ["FL", "Fly", "Butterfly"],
  ["BK", "Back", "Backstroke"],
  ["BR", "Breast", "Breaststroke"],
  ["FR", "Free", "Freestyle"],
  ["DST", "Dist", "Distance Freestyle"],
] as const;

export function eventColumn(key: string) {
  const [distance, code] = key.split("_");
  const stroke = code?.replace("-R", "");
  return stroke === "FR" && Number(distance) > 200
    ? "DST"
    : code === "MED-R"
      ? "IM"
      : stroke;
}
export function compareEvents(a: string, b: string) {
  return (
    Number(a.includes("-R")) - Number(b.includes("-R")) ||
    Number(a.split("_")[0]) - Number(b.split("_")[0]) ||
    a.localeCompare(b)
  );
}
