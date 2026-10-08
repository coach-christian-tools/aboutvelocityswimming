// Public transport is required for Firebase callable clients. Each handler enforces
// Firebase authentication or invitation-token authorization itself.
// https://docs.cloud.google.com/run/docs/authenticating/public
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

assert.equal(process.argv[2], '--production', 'Pass --production to configure the live endpoints.')
const require = createRequire(import.meta.url)
const auth = require('firebase-tools/lib/auth')
const account = auth.getGlobalDefaultAccount()
assert.ok(account, 'Firebase CLI login is required.')
const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])
const services = ['createGuestInvitation', 'getGuestInvitation', 'redeemGuestInvitation', 'listGuestInvitations', 'revokeGuestInvitation', 'registerForShift', 'cancelShiftRegistration']
for (const service of services) {
  const name = `projects/velocityworkshareportal/locations/us-central1/services/${service.toLowerCase()}`
  const endpoint = `https://run.googleapis.com/v2/${name}`
  const current = await fetch(endpoint, { headers: { Authorization: `Bearer ${token.access_token}` } })
  assert.ok(current.ok, `Cannot read ${service}: ${current.status}`)
  const configuration = await current.json()
  if (configuration.invokerIamDisabled) {
    console.log(`${service}: public callable transport already configured.`)
    continue
  }
  // Clear only the pinned revision name so Cloud Run can generate a revision;
  // otherwise functions-created services reject even non-template updates (409).
  // No container, environment, networking, scaling, or traffic fields are sent.
  const response = await fetch(`${endpoint}?updateMask=invoker_iam_disabled,template.revision`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, etag: configuration.etag, invokerIamDisabled: true, template: { revision: '' } }),
  })
  if (!response.ok) {
    const error = await response.json()
    console.error(`${service}: ${response.status} ${error.error?.status || 'configuration failed'} ${error.error?.message || ''}`)
    process.exitCode = 1
    break
  }
  let operation = await response.json()
  const deadline = Date.now() + 120_000
  while (!operation.done && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    const progress = await fetch(`https://run.googleapis.com/v2/${operation.name}`, { headers: { Authorization: `Bearer ${token.access_token}` } })
    assert.ok(progress.ok, `Cannot check ${service} operation: ${progress.status}`)
    operation = await progress.json()
  }
  assert.ok(operation.done && !operation.error, `${service}: configuration did not complete successfully.`)
  console.log(`${service}: public callable transport configured.`)
}
