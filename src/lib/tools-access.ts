// Temporary access restriction while the tools are being prepared for release.
export function isToolsAdmin(
  email: string | null | undefined,
  verified: boolean,
) {
  return (
    verified && email?.trim().toLowerCase() === "christiancutter02@gmail.com"
  );
}

export function isToolsPage(pathname: string) {
  return pathname === "/tools" || pathname.startsWith("/tools/");
}

export function isToolsApi(pathname: string) {
  return [
    "/api/data",
    "/api/workshare",
    "/api/times",
    "/api/collection",
    "/api/swim-resources",
  ].some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}
