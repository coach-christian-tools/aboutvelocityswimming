import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('maintenance script write targeting', () => {
  it.each([
    [],
    ['--project', 'demo-cutter-coach', '--apply'],
    ['demo-cutter-coach', '--project', 'demo-cutter-coach', '--apply'],
    ['--project', 'demo-cutter-coach', '--apply', '--confirm-project', 'different'],
    ['--project', 'demo-cutter-coach', '--key'],
  ])('fails before connecting when targeting is missing or ambiguous: %j', (...args) => {
    const result = spawnSync(process.execPath, ['scripts/swim-resources/migrate-public-profiles.mjs', ...args], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Supply|confirm-project/);
    expect(result.stdout).toBe('');
  });
});
