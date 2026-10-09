// Explicit production smoke test. Creates only tagged temporary fixtures and removes them.
import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { initializeApp as initializeClient, deleteApp as deleteClient } from 'firebase/app'
import { getAuth as getClientAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, deleteDoc, getFirestore as getClientDb, setLogLevel } from 'firebase/firestore'

const projectId = 'velocityworkshareportal'
const site = process.env.WORKSHARE_SMOKE_ORIGIN || 'https://www.aboutvelocityswimming.com'
const base = `${site}/tools/workshare`
assert.equal(new URL(site).protocol, 'https:')
assert.equal(process.argv[2], '--production', 'Pass --production to run the live smoke test.')
assert.ok(!process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Remove emulator environment variables first.')
const rootRequire = createRequire(new URL('../../package.json', import.meta.url))
const functionsRequire = createRequire(new URL('../../firebase/workshare/functions/package.json', import.meta.url))
const cliAuth = rootRequire('firebase-tools/lib/auth')
const { initializeApp, deleteApp } = functionsRequire('firebase-admin/app')
const { Firestore, Timestamp } = functionsRequire('@google-cloud/firestore')
const { GoogleAuth, OAuth2Client } = functionsRequire('google-auth-library')
const { getAuth } = functionsRequire('firebase-admin/auth')
const config = Object.fromEntries((await readFile(new URL('../../.env.local', import.meta.url), 'utf8')).split('\n')
  .filter(line => /^NEXT_PUBLIC_WORKSHARE_FIREBASE_\w+=/.test(line)).map(line => { const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')] }))
assert.equal(config.NEXT_PUBLIC_WORKSHARE_FIREBASE_PROJECT_ID, projectId, 'Frontend configuration must match the live project.')
const account = cliAuth.getGlobalDefaultAccount()
assert.ok(account, 'Firebase CLI login is required.')
const credential = { async getAccessToken() {
  const token = await cliAuth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])
  return { access_token: token.access_token, expires_in: Math.max(60, Math.floor((token.expires_at - Date.now()) / 1000)) }
} }
const app = initializeApp({ projectId, credential }, 'live-invitation-smoke')
// Admin Firestore only accepts ADC/certificate credentials; use the official
// Google client with the already-authorized CLI access token for fixture setup.
const firestoreToken = await credential.getAccessToken()
const oauthClient = new OAuth2Client()
oauthClient.setCredentials({ access_token: firestoreToken.access_token, expiry_date: Date.now() + firestoreToken.expires_in * 1000 })
const db = new Firestore({ projectId, auth: new GoogleAuth({ authClient: oauthClient }) })
const auth = getAuth(app)
const runId = `codex-smoke-${randomUUID()}`
const email = `${runId}@example.invalid`
const password = randomBytes(24).toString('base64url')
const familyRef = db.doc(`families/${runId}`)
const postingRef = db.doc(`postings/${runId}`)
const title = `Invitation verification ${runId}`
let createdUser = false
let browser
let client
let failure
setLogLevel('silent')
try {
  await auth.createUser({ uid: runId, email, password, emailVerified: true })
  createdUser = true
  await familyRef.set({ _smokeTestRun: runId, accountName: 'Temporary invitation verification', category: 'Recreation', authorizedEmails: [email], children: [], requirements: { generalPoolHours: 0, eventSpecificHours: 0 } })
  const start = Date.now() + 3 * 86400000
  await postingRef.set({ _smokeTestRun: runId, title, type: 'General', date: Timestamp.fromMillis(start), startTime: Timestamp.fromMillis(start), endTime: Timestamp.fromMillis(start + 3600000), positions: { min: 1, desired: 2, max: 2 }, status: 'Open' })
  console.log('Created tagged temporary verification fixtures.')
  browser = await chromium.launch({ headless: true })
  const familyPage = await (await browser.newContext()).newPage()
  familyPage.setDefaultTimeout(60000)
  familyPage.on('dialog', dialog => dialog.accept())
  await familyPage.goto(`${base}/login`)
  await familyPage.getByRole('button', { name: 'Sign in with password instead' }).click()
  await familyPage.getByPlaceholder('family@example.com').fill(email)
  await familyPage.locator('input[type="password"]').fill(password)
  await familyPage.getByRole('button', { name: 'Sign In with Password', exact: true }).click()
  await familyPage.getByRole('heading', { name: 'Temporary invitation verification Dashboard' }).waitFor()
  await familyPage.goto(`${base}/jobs`)
  // Scope to the posting card, rather than interacting with any real family shifts.
  const card = familyPage.getByRole('heading', { name: title, exact: true }).locator('xpath=../..')
  await card.getByRole('button', { name: 'Guest Link', exact: true }).click()
  await familyPage.locator('#guest-link').waitFor()
  const invitationUrl = await familyPage.locator('#guest-link').inputValue()
  assert.ok(invitationUrl.startsWith(`${base}/guest#token=`))
  console.log('Verified live authenticated invitation creation.')
  const guestPage = await (await browser.newContext()).newPage()
  guestPage.setDefaultTimeout(60000)
  await guestPage.goto(invitationUrl)
  await guestPage.getByLabel('First Name').waitFor()
  assert.equal((await guestPage.textContent('body')).includes(email), false)
  await guestPage.getByLabel('First Name').fill('Temporary')
  await guestPage.getByLabel('Last Name').fill('Guest')
  await guestPage.getByLabel('Relation to Family').fill('Verification fixture')
  await guestPage.getByRole('button', { name: 'Confirm Guest Registration' }).click()
  await guestPage.getByRole('heading', { name: 'Thank You!' }).waitFor()
  await guestPage.reload()
  await guestPage.getByRole('heading', { name: 'Invalid or Expired Link' }).waitFor()
  console.log('Verified live account-free guest signup and single-use link behavior.')
  await card.getByRole('button', { name: 'Declare', exact: true }).click()
  await familyPage.getByLabel('Assignee Full Name').fill('Temporary Parent')
  await familyPage.getByRole('button', { name: 'Confirm', exact: true }).click()
  await familyPage.getByRole('heading', { name: 'Declare for Shift' }).waitFor({ state: 'hidden' })
  const registrations = await db.collection('registrations').where('familyId', '==', runId).get()
  assert.equal(registrations.size, 2)
  assert.ok(registrations.docs.every(entry => entry.data().postingId === runId && entry.data().status === 'Pending'))
  console.log('Verified live family signup through the shared registration service.')
  client = initializeClient({ projectId, apiKey: config.NEXT_PUBLIC_WORKSHARE_FIREBASE_API_KEY, authDomain: config.NEXT_PUBLIC_WORKSHARE_FIREBASE_AUTH_DOMAIN }, 'live-rules-smoke')
  const clientDb = getClientDb(client)
  await assert.rejects(getDoc(doc(clientDb, 'families', runId)), error => error.code === 'permission-denied')
  await assert.rejects(getDoc(doc(clientDb, 'postings', runId)), error => error.code === 'permission-denied')
  await signInWithEmailAndPassword(getClientAuth(client), email, password)
  assert.ok((await getDoc(doc(clientDb, 'families', runId))).exists())
  await assert.rejects(setDoc(doc(clientDb, 'registrations', `${runId}-forged`), { familyId: runId, postingId: runId, status: 'Pending' }), error => error.code === 'permission-denied')
  await assert.rejects(deleteDoc(doc(clientDb, 'registrations', registrations.docs[0].id)), error => error.code === 'permission-denied')
  await signOut(getClientAuth(client))
  console.log('Verified live private-data and direct-write restrictions.')
} catch (error) {
  // Do not print browser errors, URLs, tokens, credentials, or request payloads.
  failure = error
  console.error('Live verification failed:', error.code || error.name || 'unknown-error')
} finally {
  await browser?.close()
  if (client) await deleteClient(client)
  try {
    const registrations = await db.collection('registrations').where('familyId', '==', runId).get()
    const invitations = await db.collection('_guest_invitations').where('familyId', '==', runId).get()
    const batch = db.batch()
    registrations.docs.forEach(entry => batch.delete(entry.ref))
    invitations.docs.forEach(entry => batch.delete(entry.ref))
    batch.delete(db.doc(`_invitation_limits/${runId}`))
    // These IDs were generated for this run and cannot refer to existing families/postings.
    batch.delete(familyRef)
    batch.delete(postingRef)
    await batch.commit()
    if (createdUser) await auth.deleteUser(runId)
    console.log('Removed temporary verification records and test account.')
  } catch (error) {
    failure = failure || error
    console.error('Verification fixture cleanup failed:', error.code || error.name || 'unknown-error')
    console.error('Fixture identifier requiring cleanup:', runId)
  }
  await db.terminate()
  await deleteApp(app)
}
if (failure) process.exitCode = 1
