import { deleteApp, initializeApp } from 'firebase/app';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

it('keeps Swim Resources in its own Firebase app when another tool is initialized first', async () => {
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'demo-api-key');
  vi.stubEnv('NEXT_PUBLIC_BACKEND_PROJECT_ID', 'demo-swim-resources');
  vi.stubEnv('NEXT_PUBLIC_DATASET_ID', 'velocity-v2');
  const other = initializeApp({ apiKey: 'other-demo-api-key', projectId: 'demo-other-tool' }, 'synthetic-other-tool');
  const { app, auth, db } = await import('@/features/swim-resources/lib/backend');
  try {
    expect(app.name).toBe('velocity-swim-resources');
    expect(app.options.projectId).toBe('demo-swim-resources');
    expect(auth.app).toBe(app);
    expect(db.app).toBe(app);
    expect(other.options.projectId).toBe('demo-other-tool');
  } finally {
    await Promise.all([deleteApp(app), deleteApp(other)]);
  }
});
