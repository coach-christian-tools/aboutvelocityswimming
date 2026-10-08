export const PRIVATE_IMPORT_HEADERS = { 'Cache-Control': 'private, no-store' };

/** Local files are never published by a production deployment or served anonymously. */
export async function authorizePreparedImports(request: Request): Promise<Response | null> {
  if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname)) {
    return Response.json({ available: false }, { status: 404, headers: PRIVATE_IMPORT_HEADERS });
  }
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return Response.json({ error: 'Sign in to view prepared imports.' }, { status: 401, headers: PRIVATE_IMPORT_HEADERS });
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_ATTENDANCE_FIREBASE_PROJECT_ID;
  if (!projectId || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return Response.json({ error: 'Prepared imports require the configured coaching account.' }, { status: 503, headers: PRIVATE_IMPORT_HEADERS });
  }
  try {
    // Hosted requests never need the local-only Admin SDK or its dependencies.
    const [{ getApps, initializeApp }, { getAuth }] = await Promise.all([
      import('firebase-admin/app'), import('firebase-admin/auth'),
    ]);
    const name = 'prepared-imports-' + projectId;
    const app = getApps().find(app => app.name === name) ?? initializeApp({ projectId }, name);
    // Signature, expiry and project audience are checked by the Firebase SDK.
    const claims = await getAuth(app).verifyIdToken(token);
    if (claims.email_verified !== true || !claims.email?.endsWith('@velocity-swimming.com')) {
      return Response.json({ error: 'A verified Velocity coaching account is required.' }, { status: 403, headers: PRIVATE_IMPORT_HEADERS });
    }
    return null;
  } catch {
    return Response.json({ error: 'Sign in again to view prepared imports.' }, { status: 401, headers: PRIVATE_IMPORT_HEADERS });
  }
}
