import { afterEach, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/swim-resources/admin/imports/prepared/route';

const sdkLoad = vi.hoisted(() => vi.fn());
vi.mock('@supabase/supabase-js', () => {
  return {createClient:()=>{sdkLoad();throw new Error('Hosted runtime cannot load prepared imports.');}};
});
afterEach(() => vi.unstubAllEnvs());

it('rejects hosted prepared-import requests without loading the local Auth SDK', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const response = await GET(new Request('https://example.com/api/swim-resources/admin/imports/prepared'));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ available: false });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(sdkLoad).not.toHaveBeenCalled();
});
