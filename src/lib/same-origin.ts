/** Next's internal URL may use localhost; validate against the incoming Host. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin"),
    host = request.headers.get("host");
  if (!origin || !host) return false;
  return origin === new URL(request.url).protocol + "//" + host;
}
