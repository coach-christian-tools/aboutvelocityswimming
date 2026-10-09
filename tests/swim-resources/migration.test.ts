import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { PREPARED_IMPORTS_PATH, swimResourcesAsset, swimResourcesPath } from '@/features/swim-resources/lib/routes';
import { importDirectory } from '@/features/swim-resources/lib/domain/database-target';
import { legacyViewerHref, viewerHref } from '@/features/swim-resources/lib/domain/data-viewer';

vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error('redirect:' + path); } }));
import AthleteRedirect from '@/app/(swim-resources)/tools/swim-resources/admin/athletes/page';
import SwimRedirect from '@/app/(swim-resources)/tools/swim-resources/admin/swimsdb/page';
import AttendanceRedirect from '@/app/(swim-resources)/tools/swim-resources/attendance/admin/page';

describe('migrated navigation', () => {
  it('keeps public pages, assets and local API requests in their namespaces', () => {
    expect(swimResourcesPath()).toBe('/tools/swim-resources');
    expect(swimResourcesPath('/standards/usa')).toBe('/tools/swim-resources/standards/usa');
    expect(swimResourcesPath('/athlete/Ada_Swimmer')).toBe('/tools/swim-resources/athlete/Ada_Swimmer');
    expect(swimResourcesPath('/admin/maintenance?collection=teams&attention=due')).toBe('/tools/swim-resources/admin/maintenance?collection=teams&attention=due');
    expect(swimResourcesAsset('/main.svg')).toBe('/swim-resources/main.svg');
    expect(PREPARED_IMPORTS_PATH).toBe('/api/swim-resources/admin/imports/prepared');
  });

  it('preserves encoded document identities and query filters', () => {
    expect(viewerHref('sources/meet #1/revisions/hash')).toBe('/tools/swim-resources/admin/data/sources/meet%20%231/revisions/hash');
    const url = new URL(legacyViewerHref('swimsdb', 'a+b #1'), 'https://example.test');
    expect(url.pathname).toBe('/tools/swim-resources/admin/data/swims');
    expect(url.searchParams.get('field')).toBe('athleteId');
    expect(url.searchParams.get('value')).toBe('a+b #1');
    expect(legacyViewerHref('unknown')).toBe('/tools/swim-resources/admin');
  });

  it('executes the migrated redirects including array search parameters', async () => {
    await expect(AthleteRedirect({ searchParams: Promise.resolve({ athlete: ['a #1', 'ignored'] }) })).rejects.toThrow('redirect:/tools/swim-resources/admin/data/athletes/a%20%231');
    await expect(SwimRedirect({ searchParams: Promise.resolve({ athlete: 'a+b' }) })).rejects.toThrow('redirect:/tools/swim-resources/admin/data/swims?field=athleteId&value=a%2Bb');
    expect(AttendanceRedirect().type).toBeTruthy();
  });
});

describe('migrated maintenance tools', () => {
  it('keeps prepared files qualified by project and database at the repository root', () => {
    expect(importDirectory('demo-cutter-coach', 'velocity-v2')).toBe('backups/imports/demo-cutter-coach/velocity-v2');
  });

  it.each(['prepare-import', 'register-evidence', 'collect-sources', 'reconcile-evidence', 'review-questions', 'import-standards', 'archive-dataset', 'restore-archive'])('loads %s and its native TypeScript dependencies without connecting to Firebase', name => {
    const result = spawnSync(process.execPath, [`scripts/swim-resources/${name}.mjs`, '--help'], { encoding: 'utf8', timeout: 10000 });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('--project');
  });

  it('retains the shared standards source and source CSV', () => {
    const data = JSON.parse(readFileSync('src/features/swim-resources/lib/data/raw-standards.json', 'utf8'));
    expect(data.length).toBeGreaterThan(0);
    expect(readFileSync('src/features/swim-resources/lib/data/Athletes & Standards - Standards.csv', 'utf8')).toContain('isStandard,TRUE');
  });
});

describe('companion extension origins', () => {
  const bridge = readFileSync('extensions/swim-resources/cutter-coach-extension/content-bridge.js', 'utf8');
  it.each([
    ['https://aboutvelocityswimming.com', true],
    ['https://www.aboutvelocityswimming.com', true],
    ['http://localhost:3000', true],
    ['http://127.0.0.1:3000', true],
    ['https://admin.velocity-swimming.com', true],
    ['https://evil-velocity-swimming.com', false],
    ['https://velocity-swimming.com.evil.test', false],
    ['https://localhost.evil.test', false],
  ])('accepts only a supported origin: %s', (origin, allowed) => {
    let listener: (event: unknown) => void = () => {};
    const sendMessage = vi.fn();
    const window = { location: { origin }, postMessage: vi.fn(), addEventListener: (_name: string, callback: typeof listener) => { listener = callback; } };
    runInNewContext(bridge, { window, URL, chrome: { runtime: { sendMessage } }, console: { log: vi.fn(), error: vi.fn() } });
    listener({ source: window, origin, data: { type: 'CUTTER_COACH_SWIMCLOUD_FETCH', swimcloudId: 'synthetic' } });
    expect(sendMessage).toHaveBeenCalledTimes(allowed ? 1 : 0);
    sendMessage.mockClear();
    listener({ source: {}, origin, data: { type: 'CUTTER_COACH_SWIMCLOUD_FETCH', swimcloudId: 'synthetic' } });
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
