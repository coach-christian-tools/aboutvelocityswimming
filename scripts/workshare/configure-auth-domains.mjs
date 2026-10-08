import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const mode = process.argv[2] || '--check';
assert.ok(['--check', '--production'].includes(mode) && process.argv.length <= 3, 'Use --check or --production.');
const require = createRequire(import.meta.url);
const auth = require('firebase-tools/lib/auth');
const account = auth.getGlobalDefaultAccount();
assert.ok(account, 'Firebase CLI login is required.');
const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
const endpoint = 'https://identitytoolkit.googleapis.com/admin/v2/projects/velocityworkshareportal/config';
const headers = { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json', 'x-goog-user-project': 'velocityworkshareportal' };
const response = await fetch(endpoint, { headers });
assert.ok(response.ok, `Cannot read Workshare Auth configuration: HTTP ${response.status}`);
const configuration = await response.json();
assert.ok(Array.isArray(configuration.authorizedDomains), 'Authorized domains were not returned.');
const required = ['www.aboutvelocityswimming.com', 'aboutvelocityswimming.com'];
const missing = required.filter(domain => !configuration.authorizedDomains.includes(domain));
if (!missing.length) {
  console.log('Both production domains are already authorized for Workshare.');
} else if (mode === '--check') {
  console.log(`Missing Workshare authorized domains: ${missing.join(', ')}`);
} else {
  const update = await fetch(`${endpoint}?updateMask=authorizedDomains`, {
    method: 'PATCH', headers,
    body: JSON.stringify({ authorizedDomains: [...configuration.authorizedDomains, ...missing] }),
  });
  assert.ok(update.ok, `Cannot update Workshare Auth domains: HTTP ${update.status}`);
  const updated = await update.json();
  assert.ok(required.every(domain => updated.authorizedDomains?.includes(domain)), 'Updated domain list did not include the production domains.');
  console.log('Authorized both production domains; all existing Auth domains and provider settings were preserved.');
}
