import { authorizePreparedImports, PRIVATE_IMPORT_HEADERS } from '@/features/swim-resources/lib/server/local-import-access';
import { listPreparedImports, readPreparedImport } from '@/features/swim-resources/lib/server/prepared-imports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = await authorizePreparedImports(request);
  if (denied) return denied;
  const file = new URL(request.url).searchParams.get('file');
  try {
    if (file !== null) return Response.json({ batch: await readPreparedImport(file) }, { headers: PRIVATE_IMPORT_HEADERS });
    return Response.json({ available: true, ...await listPreparedImports() }, { headers: PRIVATE_IMPORT_HEADERS });
  } catch {
    return Response.json({ error: file !== null ? 'This batch could not be opened. Refresh the prepared imports and try again.' : 'Prepared imports could not be loaded. Try refreshing the list.' }, { status: file !== null ? 404 : 500, headers: PRIVATE_IMPORT_HEADERS });
  }
}
