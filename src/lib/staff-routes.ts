export function isStaffRoute(pathname: string) {
  return pathname === "/tools/review" || [
    "/tools/swim-resources/admin",
    "/tools/swim-resources/attendance/admin",
    "/tools/workshare/admin",
  ].some(path => pathname === path || pathname.startsWith(path + "/"));
}
