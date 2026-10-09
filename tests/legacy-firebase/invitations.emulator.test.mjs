import { before, beforeEach, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { workshareEmulatorEnv } from '../../scripts/workshare/emulator-env.mjs'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore'
import { initializeApp as initializeClient, deleteApp as deleteClient } from 'firebase/app'
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions'

const require = createRequire(new URL('../../firebase/workshare/functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const { invitationService } = require('./lib/invitations.js')
const projectId = 'demo-velocityworkshare'
let environment, app, db, service
const member = { uid: 'member', email: 'parent@example.com', emailVerified: true }
const stranger = { uid: 'stranger', email: 'other@example.com', emailVerified: true }
const admin = { uid: 'administrator', email: 'coach@velocity-swimming.com', emailVerified: true }
const now = Date.parse('2026-10-08T17:00:00Z')
const shift = { title: 'Timing', type: 'General', date: Timestamp.fromMillis(now + 3 * 86400000), startTime: Timestamp.fromMillis(now + 3 * 86400000), endTime: Timestamp.fromMillis(now + 3 * 86400000 + 3600000), positions: { min: 1, desired: 2, max: 3 }, status: 'Open' }
const guest = { firstName: 'Guest', lastName: 'Volunteer', relation: 'Friend' }
const invite = () => service.create(member, { familyId: 'family', postingId: 'shift' })
const rejectsCode = (promise, code) => assert.rejects(promise, error => error.code === code)

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run with npm run test:emulators')
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  environment = await initializeTestEnvironment({ projectId, firestore: { host, port: +port, rules: await readFile(new URL('../../firebase/workshare/firestore.rules', import.meta.url), 'utf8') } })
  app = initializeApp({ projectId }, 'invitation-tests')
  db = getFirestore(app)
  service = invitationService(db, () => now)
})
beforeEach(async () => {
  await environment.clearFirestore()
  await db.doc('families/family').set({ accountName: 'Example Family', authorizedEmails: [member.email], children: [{ name: 'Private Child', group: 'Prep' }], category: 'Competitive', requirements: { generalPoolHours: 10, eventSpecificHours: 5 } })
  await db.doc('postings/shift').set(shift)
})
after(async () => { await environment?.cleanup(); if (app) await deleteApp(app) })

test('only family members and administrators can issue invitations', async () => {
  await rejectsCode(service.create(undefined, { familyId: 'family', postingId: 'shift' }), 'unauthenticated')
  await rejectsCode(service.create(stranger, { familyId: 'family', postingId: 'shift' }), 'permission-denied')
  assert.match((await service.create(admin, { familyId: 'family', postingId: 'shift' })).token, /^[a-f0-9]{64}$/)
})
test('token storage is hashed, scope is server-owned, and preview contains no private family data', async () => {
  const created = await invite()
  const stored = (await db.doc(`_guest_invitations/${created.invitationId}`).get()).data()
  assert.notEqual(created.invitationId, created.token)
  assert.equal(stored.token, undefined)
  assert.equal(JSON.stringify(stored).includes(created.token), false)
  const preview = await service.get({ token: created.token })
  assert.deepEqual(Object.keys(preview).sort(), ['expiresAt', 'familyName', 'shift'])
  assert.equal(JSON.stringify(preview).includes('Private Child'), false)
  assert.equal(JSON.stringify(preview).includes(member.email), false)
  const result = await service.redeem({ token: created.token, ...guest, familyId: 'forged', postingId: 'forged', status: 'Complete', shiftSnapshot: shift })
  const reg = (await db.doc(`registrations/${result.registrationId}`).get()).data()
  assert.equal(reg.familyId, 'family'); assert.equal(reg.postingId, 'shift'); assert.equal(reg.status, 'Pending'); assert.equal(reg.shiftSnapshot, undefined)
})
test('single-use tokens are atomic and retries return the same registration', async () => {
  const created = await invite()
  const results = await Promise.all(Array.from({ length: 10 }, () => service.redeem({ token: created.token, ...guest })))
  assert.equal(new Set(results.map(result => result.registrationId)).size, 1)
  assert.equal((await db.collection('registrations').get()).size, 1)
  await rejectsCode(service.get({ token: created.token }), 'not-found')
})
test('guest and ordinary signups cannot overbook the last spot', async () => {
  await db.doc('postings/shift').update({ 'positions.max': 1 })
  const invitations = await Promise.all([invite(), invite(), invite()])
  const results = await Promise.allSettled([
    ...invitations.map((created, i) => service.redeem({ token: created.token, ...guest, firstName: `Guest ${i}` })),
    ...Array.from({ length: 3 }, (_, i) => service.signup(member, { familyId: 'family', postingId: 'shift', name: `Parent ${i}` }))
  ])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal((await db.collection('registrations').get()).size, 1)
  for (const result of results.filter(result => result.status === 'rejected')) assert.equal(result.reason.code, 'resource-exhausted')
})
test('duplicate normalized assignees are rejected across guest and ordinary flows', async () => {
  await service.signup(member, { familyId: 'family', postingId: 'shift', name: 'Guest   VOLUNTEER' })
  const created = await invite()
  await rejectsCode(service.redeem({ token: created.token, ...guest }), 'already-exists')
  assert.equal((await db.doc(`_guest_invitations/${created.invitationId}`).get()).data().redeemedAt, null)
})
test('revocation is authorized and unused links become unavailable', async () => {
  const created = await invite()
  await rejectsCode(service.list(stranger, { familyId: 'family' }), 'permission-denied')
  await rejectsCode(service.revoke(stranger, { invitationId: created.invitationId }), 'permission-denied')
  await service.revoke(member, { invitationId: created.invitationId })
  await rejectsCode(service.get({ token: created.token }), 'not-found')
  await rejectsCode(service.redeem({ token: created.token, ...guest }), 'not-found')
  assert.equal((await service.list(member, { familyId: 'family' })).invitations[0].status, 'Revoked')
})
test('invalid, expired, missing-family, and malformed requests cannot register', async () => {
  await rejectsCode(service.get({ token: 'bad' }), 'not-found')
  await rejectsCode(service.get({ token: '0'.repeat(64) }), 'not-found')
  await rejectsCode(service.get({ familyId: 'family', postingId: 'shift' }), 'not-found')
  const created = await invite()
  await rejectsCode(service.redeem({ token: created.token, ...guest, firstName: ' ' }), 'invalid-argument')
  await rejectsCode(service.redeem({ token: created.token, ...guest, relation: 'a'.repeat(101) }), 'invalid-argument')
  await db.doc(`_guest_invitations/${created.invitationId}`).update({ expiresAt: Timestamp.fromMillis(now) })
  await rejectsCode(service.redeem({ token: created.token, ...guest }), 'not-found')
  const missing = await invite()
  await db.doc('families/family').delete()
  await rejectsCode(service.redeem({ token: missing.token, ...guest }), 'not-found')
})
test('archived, closed, and started shifts invalidate invitations', async () => {
  const created = await invite()
  for (const change of [{ archived: true }, { status: 'Filled' }, { startTime: Timestamp.fromMillis(now) }]) {
    await db.doc('postings/shift').set({ ...shift, ...change })
    await rejectsCode(service.get({ token: created.token }), 'not-found')
    await rejectsCode(service.redeem({ token: created.token, ...guest }), 'failed-precondition')
    await rejectsCode(invite(), 'failed-precondition')
  }
})
test('expiry is seven days or shift cutoff, with Pacific date handling', async () => {
  assert.equal((await invite()).expiresAt, shift.startTime.toMillis())
  await db.doc('postings/shift').set({ ...shift, date: Timestamp.fromMillis(now + 10 * 86400000), startTime: null })
  assert.equal((await invite()).expiresAt, now + 7 * 86400000)
  await db.doc('postings/shift').set({ ...shift, date: Timestamp.fromDate(new Date('2026-10-09T07:00:00Z')), startTime: null })
  assert.equal((await invite()).expiresAt, Date.parse('2026-10-10T07:00:00Z'))
})
test('issuance limit is atomic, rolling, and leaves capacity unreserved', async () => {
  // Race for the final allowance. Flooding all 20 transactions at once instead
  // measures Firestore's finite contention retries, not the rate-limit invariant.
  for (let index = 0; index < 19; index++) await invite()
  const results = await Promise.allSettled(Array.from({ length: 5 }, invite))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  for (const result of results.filter(result => result.status === 'rejected')) assert.equal(result.reason.code, 'resource-exhausted')
  assert.equal((await db.collection('registrations').get()).size, 0)
  const later = invitationService(db, () => now + 3600001)
  await later.create(member, { familyId: 'family', postingId: 'shift' })
})
test('cancellation requires authorization, frees capacity, and never reactivates an invitation', async () => {
  await db.doc('postings/shift').update({ 'positions.max': 1 })
  const created = await invite()
  const registration = await service.redeem({ token: created.token, ...guest })
  await rejectsCode(service.cancel(stranger, registration), 'permission-denied')
  await service.cancel(member, registration)
  assert.equal((await db.collection('registrations').get()).size, 0)
  assert.deepEqual(await service.redeem({ token: created.token, ...guest }), registration)
  assert.equal((await db.collection('registrations').get()).size, 0)
  await service.signup(member, { familyId: 'family', postingId: 'shift', name: 'Replacement' })
})
test('cancellation cutoff is enforced server-side, administrators can remove orphan records', async () => {
  const reg = await service.signup(member, { familyId: 'family', postingId: 'shift', name: 'Parent' })
  await db.doc('postings/shift').update({ startTime: Timestamp.fromMillis(now + 3600000) })
  await rejectsCode(service.cancel(member, reg), 'failed-precondition')
  await db.doc('families/family').delete()
  await service.cancel(admin, reg)
})
test('rules deny anonymous family/posting reads and all direct registration creation/deletion', async () => {
  const publicDb = environment.unauthenticatedContext().firestore()
  const familyDb = environment.authenticatedContext(member.uid, { email: member.email, email_verified: true }).firestore()
  const otherDb = environment.authenticatedContext(stranger.uid, { email: stranger.email, email_verified: true }).firestore()
  const adminDb = environment.authenticatedContext(admin.uid, { email: admin.email, email_verified: true }).firestore()
  await assertFails(getDoc(doc(publicDb, 'families/family')))
  await assertFails(getDoc(doc(publicDb, 'postings/shift')))
  await assertFails(getDoc(doc(otherDb, 'families/family')))
  await assertSucceeds(getDoc(doc(familyDb, 'families/family')))
  await assertSucceeds(getDoc(doc(adminDb, 'families/family')))
  await assertSucceeds(getDoc(doc(familyDb, 'postings/shift')))
  for (const client of [publicDb, familyDb, adminDb]) await assertFails(setDoc(doc(client, 'registrations/forged'), { familyId: 'family', postingId: 'shift', status: 'Pending' }))
  const registration = await service.signup(member, { familyId: 'family', postingId: 'shift', name: 'Parent' })
  for (const client of [publicDb, familyDb, adminDb]) await assertFails(deleteDoc(doc(client, `registrations/${registration.registrationId}`)))
  await assertSucceeds(getDoc(doc(familyDb, `registrations/${registration.registrationId}`)))
  await assertSucceeds(updateDoc(doc(adminDb, `registrations/${registration.registrationId}`), { status: 'Complete' }))
  await assertFails(updateDoc(doc(adminDb, `registrations/${registration.registrationId}`), { postingId: 'another' }))
  const created = await invite()
  for (const client of [publicDb, familyDb, adminDb]) {
    await assertFails(getDoc(doc(client, `_guest_invitations/${created.invitationId}`)))
    await assertFails(setDoc(doc(client, `_guest_invitations/${created.invitationId}`), { token: 'forged' }))
    await assertFails(getDoc(doc(client, `_invitation_limits/${member.uid}`)))
  }
})
test('guest callable endpoints work without authentication and expose only safe data', async () => {
  // The deployed clock is real; use a future shift for this transport-level test.
  const future = Date.now() + 3 * 86400000
  await db.doc('postings/shift').set({ ...shift, date: Timestamp.fromMillis(future), startTime: Timestamp.fromMillis(future) })
  const created = await invite()
  const client = initializeClient({ projectId, apiKey: 'emulator-only' }, 'callable-guest-test')
  try {
    const functions = getFunctions(client)
    connectFunctionsEmulator(functions, '127.0.0.1', 5002)
    const preview = await httpsCallable(functions, 'getGuestInvitation')({ token: created.token })
    assert.equal(preview.data.familyName, 'Example Family')
    const result = await httpsCallable(functions, 'redeemGuestInvitation')({ token: created.token, ...guest })
    assert.ok(result.data.registrationId)
    const retry = await httpsCallable(functions, 'redeemGuestInvitation')({ token: created.token, ...guest })
    assert.equal(retry.data.registrationId, result.data.registrationId)
    await rejectsCode(httpsCallable(functions, 'createGuestInvitation')({ familyId: 'family', postingId: 'shift' }), 'functions/unauthenticated')
  } finally { await deleteClient(client) }
})

test('unverified email claims cannot issue invitations or impersonate administrators', async () => {
  await rejectsCode(service.create({ ...member, emailVerified: false }, { familyId: 'family', postingId: 'shift' }), 'permission-denied')
  await rejectsCode(service.create({ ...admin, emailVerified: false }, { familyId: 'family', postingId: 'shift' }), 'permission-denied')
  const unverified = environment.authenticatedContext('unverified', { email: admin.email, email_verified: false }).firestore()
  await assertFails(getDoc(doc(unverified, 'families/family')))
  await assertFails(updateDoc(doc(unverified, 'postings/shift'), { title: 'Forged administrator' }))
})

test('browser flow creates, redeems, revokes, replaces invitations and signs up a family', { timeout: 240000 }, async () => {
  const { chromium } = await import('playwright')
  const { spawn } = await import('node:child_process')
  const { getAuth } = require('firebase-admin/auth')
  const password = 'EmulatorOnlyPassword123!'
  await getAuth(app).createUser({ uid: member.uid, email: member.email, emailVerified: true, password })
  await getAuth(app).createUser({ uid: admin.uid, email: admin.email, emailVerified: true, password })
  await getAuth(app).createUser({ uid: stranger.uid, email: stranger.email, emailVerified: true, password })
  const future = Date.now() + 3 * 86400000
  await db.doc('postings/shift').set({ ...shift, date: Timestamp.fromMillis(future), startTime: Timestamp.fromMillis(future) })
  const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '5179'], {
    cwd: new URL('../../', import.meta.url),
    env: { ...process.env, ...workshareEmulatorEnv, WORKSHARE_TEST_BUILD: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverOutput = ''
  next.stdout.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-12000) })
  next.stderr.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-12000) })
  let browser
  try {
    for (let attempt = 0; attempt < 120; attempt++) {
      try { if ((await fetch('http://127.0.0.1:5179/tools/workshare/login', { signal: AbortSignal.timeout(30000) })).ok) break } catch { /* Wait for Next.js startup. */ }
      await new Promise(resolve => setTimeout(resolve, 500))
      if (next.exitCode !== null) throw new Error(serverOutput)
    }
    browser = await chromium.launch({ headless: true })
    const familyContext = await browser.newContext()
    const familyPage = await familyContext.newPage()
    familyPage.setDefaultTimeout(45000)
    const pageErrors = []
    familyPage.on('pageerror', error => pageErrors.push(error.message))
    familyPage.on('dialog', dialog => dialog.accept())
    const missing = await familyPage.goto('http://127.0.0.1:5179/tools/workshare/missing')
    assert.equal(missing.status(), 404)
    await familyPage.getByRole('heading', { name: 'Workshare page not found' }).waitFor()
    await familyPage.goto('http://127.0.0.1:5179/tools/workshare/admin/families/family')
    await familyPage.getByPlaceholder('family@example.com').waitFor()
    assert.match(familyPage.url(), /\/tools\/workshare\/login$/)
    await familyPage.goto('http://127.0.0.1:5179/tools/workshare/login')
    await familyPage.getByRole('button', { name: 'Sign in with password instead' }).click()
    await familyPage.getByPlaceholder('family@example.com').fill(member.email)
    await familyPage.locator('input[type="password"]').fill(password)
    await familyPage.getByRole('button', { name: 'Sign In with Password', exact: true }).click()
    await familyPage.getByRole('heading', { name: 'Example Family Dashboard' }).waitFor()
    await familyPage.reload()
    await familyPage.getByRole('heading', { name: 'Example Family Dashboard' }).waitFor()
    await familyPage.goto('http://127.0.0.1:5179/tools/workshare/admin/settings')
    await familyPage.getByRole('heading', { name: 'Example Family Dashboard' }).waitFor()
    await familyPage.goto('http://127.0.0.1:5179/tools/workshare/jobs')
    const calendarDownload = familyPage.waitForEvent('download')
    await familyPage.getByRole('button', { name: 'Add to Calendar' }).first().click()
    assert.match((await calendarDownload).suggestedFilename(), /\.ics$/)
    await familyPage.getByRole('link', { name: 'Volunteer Logs', exact: true }).first().click()
    await familyPage.getByRole('heading', { name: 'Volunteer Logs' }).waitFor()
    await familyPage.goBack()
    await familyPage.getByRole('heading', { name: 'Workshare Shifts' }).waitFor()
    await familyPage.getByRole('button', { name: 'Guest Link', exact: true }).click()
    await familyPage.locator('#guest-link').waitFor()
    const url = await familyPage.locator('#guest-link').inputValue()
    assert.ok(url.includes('/tools/workshare/guest#token='))
    assert.equal(new URL(url).search, '')
    const guestContext = await browser.newContext()
    const guestPage = await guestContext.newPage()
    guestPage.on('pageerror', error => pageErrors.push(error.message))
    await guestPage.goto(url)
    await guestPage.getByLabel('First Name').waitFor()
    assert.equal((await guestPage.textContent('body')).includes(member.email), false)
    assert.equal((await guestPage.textContent('body')).includes('Private Child'), false)
    await guestPage.getByLabel('First Name').fill('Browser')
    await guestPage.getByLabel('Last Name').fill('Guest')
    await guestPage.getByLabel('Relation to Family').fill('Friend')
    await guestPage.getByRole('button', { name: 'Confirm Guest Registration' }).click()
    await guestPage.getByRole('heading', { name: 'Thank You!' }).waitFor()
    assert.equal((await db.collection('registrations').get()).size, 1)
    await guestPage.reload()
    await guestPage.getByRole('heading', { name: 'Invalid or Expired Link' }).waitFor()
    await familyPage.getByRole('button', { name: 'Declare', exact: true }).click()
    await familyPage.getByLabel('Assignee Full Name').fill('Browser Parent')
    await familyPage.getByRole('button', { name: 'Confirm', exact: true }).click()
    await familyPage.getByRole('heading', { name: 'Declare for Shift' }).waitFor({ state: 'hidden' })
    assert.equal((await db.collection('registrations').get()).size, 2)
    await familyPage.getByRole('button', { name: 'Guest Link', exact: true }).click()
    await familyPage.waitForFunction(previous => document.querySelector('#guest-link')?.value !== previous, url)
    const second = await familyPage.locator('#guest-link').inputValue()
    await familyPage.goto('http://127.0.0.1:5179/tools/workshare/')
    await familyPage.getByRole('button', { name: 'Revoke', exact: true }).click()
    await familyPage.getByRole('button', { name: 'Revoke', exact: true }).waitFor({ state: 'hidden' })
    await guestPage.goto(second)
    await guestPage.getByRole('heading', { name: 'Invalid or Expired Link' }).waitFor()
    await familyPage.getByRole('button', { name: 'New link', exact: true }).first().click()
    await familyPage.locator('#replacement-link').waitFor()
    const replacement = await familyPage.locator('#replacement-link').inputValue()
    await guestPage.goto(replacement)
    await guestPage.getByLabel('First Name').waitFor()
    await guestPage.goto('http://127.0.0.1:5179/tools/workshare/guest?jobId=shift&familyId=family')
    await guestPage.getByRole('heading', { name: 'Invalid or Expired Link' }).waitFor()
    await familyPage.getByRole('button', { name: 'Cancel Shift', exact: true }).first().click()
    await familyPage.waitForFunction(() => document.querySelectorAll('button').length > 0)
    const cancellationDeadline = Date.now() + 30000
    while ((await db.collection('registrations').get()).size !== 1 && Date.now() < cancellationDeadline) await new Promise(resolve => setTimeout(resolve, 200))
    assert.equal((await db.collection('registrations').get()).size, 1)
    // Cross-root navigation must restore each tool's CSS and keep sessions separate.
    const portalBackground = await familyPage.evaluate(() => getComputedStyle(document.body).backgroundColor)
    await familyPage.getByRole('link', { name: 'Back to Tools' }).click()
    await familyPage.getByRole('heading', { name: 'Tools', exact: true }).waitFor()
    await familyPage.getByRole('link', { name: 'Open Swim Resources' }).click()
    await familyPage.waitForURL('**/tools/swim-resources')
    await familyPage.goto('http://127.0.0.1:5179/tools')
    await familyPage.getByRole('link', { name: 'Open Workshare' }).click()
    await familyPage.getByRole('heading', { name: 'Example Family Dashboard' }).waitFor()
    assert.equal(await familyPage.evaluate(() => getComputedStyle(document.body).backgroundColor), portalBackground)
    assert.match(await familyPage.locator('meta[name="robots"]').getAttribute('content'), /noindex/)
    await familyPage.setViewportSize({ width: 390, height: 844 })
    await familyPage.getByRole('link', { name: 'Job Board', exact: true }).last().click()
    await familyPage.getByRole('heading', { name: 'Workshare Shifts' }).waitFor()
    assert.equal(await familyPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await familyPage.getByRole('button', { name: 'Sign Out', exact: true }).last().click()
    await familyPage.getByPlaceholder('family@example.com').waitFor()
    // Password sign-in with no associated family must not reveal private data.
    await familyPage.getByRole('button', { name: 'Sign in with password instead' }).click()
    await familyPage.getByPlaceholder('family@example.com').fill(stranger.email)
    await familyPage.locator('input[type="password"]').fill(password)
    await familyPage.getByRole('button', { name: 'Sign In with Password', exact: true }).click()
    await familyPage.getByRole('heading', { name: 'Account Not Associated' }).waitFor()
    await familyPage.getByRole('button', { name: 'Sign Out', exact: true }).click()
    await familyPage.getByPlaceholder('family@example.com').waitFor()
    // Verify the OTP custom-token path without sending email.
    await db.doc(`_otp_codes/${member.email}`).set({
      email: member.email, codeHash: createHash('sha256').update('123456').digest('hex'), attempts: 0,
      createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 600000),
    })
    await familyPage.route('**/sendOtp', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }, body: JSON.stringify({ result: { success: true } }) }))
    await familyPage.getByPlaceholder('family@example.com').fill(member.email)
    await familyPage.getByRole('button', { name: 'Send', exact: false }).click()
    await familyPage.locator('input[autocomplete="one-time-code"]').fill('123456')
    await familyPage.getByRole('button', { name: 'Verify', exact: false }).click()
    await familyPage.getByRole('heading', { name: 'Example Family Dashboard' }).waitFor()
    // Staff retains every admin route and downloadable family data.
    const staff = await (await browser.newContext()).newPage()
    staff.setDefaultTimeout(45000)
    staff.on('pageerror', error => pageErrors.push(error.message))
    await staff.goto('http://127.0.0.1:5179/tools/workshare/login')
    await staff.getByRole('button', { name: 'Sign in with password instead' }).click()
    await staff.getByPlaceholder('family@example.com').fill(admin.email)
    await staff.locator('input[type="password"]').fill(password)
    await staff.getByRole('button', { name: 'Sign In with Password', exact: true }).click()
    await staff.getByRole('heading', { name: 'Family Roster' }).waitFor()
    const csvDownload = staff.waitForEvent('download')
    await staff.getByRole('button', { name: 'Export CSV' }).click()
    const csv = await csvDownload
    assert.match(csv.suggestedFilename(), /\.csv$/)
    assert.match(await readFile(await csv.path(), 'utf8'), /Example Family/)
    for (const path of ['admin/families/family', 'admin/roster', 'admin/settings', 'jobs']) {
      await staff.goto(`http://127.0.0.1:5179/tools/workshare/${path}`)
      await staff.locator('main h2').first().waitFor()
      assert.ok(staff.url().endsWith(path))
    }
    assert.deepEqual(pageErrors, [])
  } finally {
    await browser?.close()
    next.kill('SIGTERM')
    await getAuth(app).deleteUser(member.uid)
    await getAuth(app).deleteUser(admin.uid)
    await getAuth(app).deleteUser(stranger.uid)
  }
})
