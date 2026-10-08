import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ImportBatch, ImportKind } from '@/features/swim-resources/lib/domain/import-batch';
import { authorizePreparedImports } from '@/features/swim-resources/lib/server/local-import-access';
import { listPreparedImports, readPreparedImport } from '@/features/swim-resources/lib/server/prepared-imports';
import { GET } from '@/app/api/swim-resources/admin/imports/prepared/route';

const sdk = vi.hoisted(() => ({ verify: vi.fn(), initialize: vi.fn() }));
vi.mock('firebase-admin/app', () => ({ getApps: () => [], initializeApp: sdk.initialize }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: sdk.verify }) }));

const request = (token?: string, hostname = 'localhost') => new Request('http://' + hostname + ':3000/api/swim-resources/admin/imports/prepared', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
const fixture = (id: string, kind: ImportKind): ImportBatch => ({
  version: 2, target: { project: 'synthetic-project', database: 'velocity-v2' }, id, collectedAt: '2026-10-06T17:00:00Z',
  sources: [{ id: 'source', name: 'Synthetic fixture', revisionId: 'a'.repeat(64), checkId: 'check', kind: 'document', reference: 'fixture:source', collectedAt: '2026-10-06T17:00:00Z', coverage: 'partial', scope: 'Synthetic records only' }],
  rows: [{ id: 'row', kind, verified: true, sourceIds: ['source'], data: { id: 'synthetic' }, evidence: [{ sourceId: 'source', revisionId: 'a'.repeat(64), checkId: 'check', checkedAt: '2026-10-06T17:00:00Z', fields: ['id'], context: 'Synthetic', excerpt: 'Synthetic' }] }], unresolved: [],
});
let directory: string;
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'synthetic-project'); vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '');
  sdk.verify.mockResolvedValue({ email: 'coach@velocity-swimming.com', email_verified: true });
  directory = await mkdtemp(join(tmpdir(), 'cutter-prepared-test-'));
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); vi.unstubAllEnvs(); });

describe('prepared import access', () => {
  it('denies anonymous and invalid tokens before returning file metadata', async () => {
    const anonymous = await GET(request());
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('cache-control')).toBe('private, no-store');
    expect(sdk.verify).not.toHaveBeenCalled();
    sdk.verify.mockRejectedValue(new Error('Synthetic invalid or expired token'));
    expect((await GET(request('invalid'))).status).toBe(401);
  });
  it('requires a verified Velocity coach and verifies against the configured project', async () => {
    for (const claims of [{ email: 'other@example.com', email_verified: true }, { email: 'coach@velocity-swimming.com', email_verified: false }]) {
      sdk.verify.mockResolvedValue(claims);
      expect((await authorizePreparedImports(request('signed-fixture')))?.status).toBe(403);
    }
    sdk.verify.mockResolvedValue({ email: 'coach@velocity-swimming.com', email_verified: true });
    expect(await authorizePreparedImports(request('signed-fixture'))).toBeNull();
    expect(sdk.verify).toHaveBeenLastCalledWith('signed-fixture');
    expect(sdk.initialize).toHaveBeenLastCalledWith({ projectId: 'synthetic-project' }, 'prepared-imports-synthetic-project');
  });
  it('does not publish local batches in production, over a remote host, or through unsigned emulator auth', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect((await GET(request('signed-fixture'))).status).toBe(404);
    vi.stubEnv('NODE_ENV', 'development');
    expect((await GET(request('signed-fixture', 'example.com'))).status).toBe(404);
    vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099');
    expect((await GET(request('unsigned-emulator'))).status).toBe(503);
    expect(sdk.verify).not.toHaveBeenCalled();
  });
});

describe('local prepared import files', () => {
  it('lists all batch types across reads and opens the exact original without modifying it', async () => {
    for (const kind of ['athlete', 'meet', 'swim'] as const) await writeFile(join(directory, kind + '.json'), JSON.stringify(fixture(kind, kind)));
    const first = await listPreparedImports(directory);
    expect(first.batches.map(batch => batch.label)).toEqual(['Regional meet opportunities', 'Roster updates', 'Swimmer results']);
    expect(first.batches.every(batch => batch.observations === 1)).toBe(true);
    expect(await listPreparedImports(directory)).toEqual(first);
    const original = await readFile(join(directory, 'athlete.json'), 'utf8');
    expect(await readPreparedImport('athlete.json', directory)).toEqual(fixture('athlete', 'athlete'));
    expect(await readFile(join(directory, 'athlete.json'), 'utf8')).toBe(original);
  });
  it('rejects path traversal and symlinks, and reports malformed, oversized and nonregular JSON files', async () => {
    await writeFile(join(directory, 'valid.json'), JSON.stringify(fixture('valid', 'athlete')));
    await writeFile(join(directory, 'bad.json'), 'not json');
    await writeFile(join(directory, 'large.json'), ' '.repeat(4 * 1024 * 1024 + 1));
    await mkdir(join(directory, 'folder.json'));
    await symlink(join(directory, 'valid.json'), join(directory, 'link.json'));
    for (const name of ['../valid.json', '/valid.json', 'valid.json/child', 'link.json', 'large.json']) await expect(readPreparedImport(name, directory)).rejects.toThrow();
    const result = await listPreparedImports(directory);
    expect(result.batches.map(batch => batch.id)).toEqual(['valid']);
    expect(result.skipped).toBe(4);
  });
  it('treats a missing pending folder as an empty queue', async () => {
    expect(await listPreparedImports(join(directory, 'missing'))).toEqual({ batches: [], skipped: 0 });
  });
});
