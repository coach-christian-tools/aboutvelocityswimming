import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWorkshareRoute, worksharePath } from '../../src/features/workshare/lib/routes.ts';

test('all portal deep links live under Workshare without absorbing other Tools routes', () => {
  for (const path of ['', 'login', 'guest', 'logs', 'jobs', 'admin/families', 'admin/families/family-123', 'admin/roster', 'admin/settings']) {
    assert.equal(isWorkshareRoute(path ? path.split('/') : []), true, path);
  }
  for (const path of ['missing', 'admin', 'swim-resources', 'admin/families/id/extra']) {
    assert.equal(isWorkshareRoute(path.split('/')), false, path);
  }
  assert.equal(worksharePath(), '/tools/workshare');
  assert.equal(worksharePath('/guest'), '/tools/workshare/guest');
});
