export const WORKSHARE_PATH = "/tools/workshare";

export function worksharePath(path = "") {
  return `${WORKSHARE_PATH}${path ? `/${path.replace(/^\/+/, "")}` : ""}`;
}

export function isWorkshareRoute(segments: string[] = []) {
  const path = segments.join("/");
  return ["", "login", "guest", "logs", "jobs", "admin/families", "admin/roster", "admin/settings"].includes(path)
    || (segments.length === 3 && segments[0] === "admin" && segments[1] === "families" && !!segments[2]);
}
