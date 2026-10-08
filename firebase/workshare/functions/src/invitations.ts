import { createHash, randomBytes } from "crypto"
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { FieldValue, Firestore, Timestamp, Transaction, getFirestore } from "firebase-admin/firestore"
import { pacificEndOfDay } from "./reminderWindow"

export interface Actor { uid: string; email?: string; emailVerified?: boolean }
type Data = Record<string, unknown>

function data(value: unknown): Data {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "Invalid request.")
  return value as Data
}
function text(value: unknown, label: string, max = 100): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new HttpsError("invalid-argument", `Please provide a valid ${label}.`)
  }
  return value.trim()
}
function id(value: unknown, label: string): string {
  const result = text(value, label, 128)
  if (result.includes("/")) throw new HttpsError("invalid-argument", `Invalid ${label}.`)
  return result
}
function tokenHash(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw unavailable()
  return createHash("sha256").update(value).digest("hex")
}
function unavailable() { return new HttpsError("not-found", "This invitation is unavailable. Ask the family for a new link.") }
function normalizedName(name: string) { return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() }
function milliseconds(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : NaN
}
function cutoff(posting: FirebaseFirestore.DocumentData): number {
  if (!(posting.date instanceof Timestamp)) throw new HttpsError("failed-precondition", "This shift has an invalid date.")
  const result = posting.startTime ? milliseconds(posting.startTime) : pacificEndOfDay(posting.date.toDate()).getTime()
  if (!Number.isFinite(result)) throw new HttpsError("failed-precondition", "This shift has an invalid date.")
  return result
}
function openPosting(posting: FirebaseFirestore.DocumentData | undefined, now: number) {
  if (!posting || posting.archived || posting.status !== "Open" || cutoff(posting) <= now) {
    throw new HttpsError("failed-precondition", "This shift is no longer available.")
  }
  if (!Number.isInteger(posting.positions?.max) || posting.positions.max < 1) {
    throw new HttpsError("failed-precondition", "This shift has invalid capacity.")
  }
  return posting
}

export function invitationService(db: Firestore, clock: () => number = Date.now) {
  async function isAdmin(tx: Transaction, actor: Actor): Promise<boolean> {
    if (actor.emailVerified && actor.email?.trim().toLowerCase().endsWith("@velocity-swimming.com")) return true
    return (await tx.get(db.collection("admins").doc(actor.uid))).exists
  }
  async function authorize(tx: Transaction, actor: Actor | undefined, familyId: string, allowMissing = false) {
    if (!actor) throw new HttpsError("unauthenticated", "Please sign in.")
    const family = await tx.get(db.collection("families").doc(familyId))
    const admin = await isAdmin(tx, actor)
    const email = actor.email?.trim().toLowerCase()
    const emails: string[] = family.data()?.authorizedEmails || []
    if ((!family.exists && !(admin && allowMissing)) || (!admin && (!actor.emailVerified || !emails.some(entry => entry.trim().toLowerCase() === email)))) {
      throw new HttpsError("permission-denied", "You cannot manage this family.")
    }
    return { family: family.data() || {}, admin }
  }
  async function register(tx: Transaction, familyId: string, postingId: string, assignee: { name: string; isGuest: boolean; relation?: string }) {
    const ref = db.collection("postings").doc(postingId)
    const snapshot = await tx.get(ref)
    const posting = openPosting(snapshot.data(), clock())
    const existing = await tx.get(db.collection("registrations").where("postingId", "==", postingId))
    if (existing.docs.some(entry => entry.data().familyId === familyId && normalizedName(entry.data().assignee?.name || "") === normalizedName(assignee.name))) {
      throw new HttpsError("already-exists", "This volunteer is already registered for this family and shift.")
    }
    if (existing.size >= posting.positions.max) throw new HttpsError("resource-exhausted", "This shift is full. Please choose another shift.")
    const registration = db.collection("registrations").doc()
    // Every signup and cancellation writes the posting to serialize capacity changes.
    tx.update(ref, { _registrationRevision: FieldValue.increment(1) })
    tx.create(registration, { familyId, postingId, assignee, status: "Pending" })
    return registration.id
  }

  return {
    async create(actor: Actor | undefined, input: unknown) {
      const args = data(input)
      const familyId = id(args.familyId, "family ID")
      const postingId = id(args.postingId, "shift ID")
      const token = randomBytes(32).toString("hex")
      const invitationId = tokenHash(token)
      return db.runTransaction(async tx => {
        await authorize(tx, actor, familyId)
        const posting = openPosting((await tx.get(db.collection("postings").doc(postingId))).data(), clock())
        const rateRef = db.collection("_invitation_limits").doc(actor!.uid)
        const rate = await tx.get(rateRef)
        const now = clock()
        const prior: number[] = rate.data()?.issuedAt || []
        const issuedAt = prior.filter(time => time > now - 3_600_000)
        if (issuedAt.length >= 20) throw new HttpsError("resource-exhausted", "You can create up to 20 invitations per hour. Please try again later.")
        const expiresAt = Math.min(now + 7 * 86_400_000, cutoff(posting))
        tx.set(rateRef, { issuedAt: [...issuedAt, now] })
        tx.create(db.collection("_guest_invitations").doc(invitationId), {
          familyId, postingId, shiftTitle: posting.title, creatorUid: actor!.uid, createdAt: Timestamp.fromMillis(now),
          expiresAt: Timestamp.fromMillis(expiresAt), revokedAt: null, redeemedAt: null, registrationId: null
        })
        return { invitationId, token, expiresAt }
      })
    },
    async get(input: unknown) {
      const hash = tokenHash(data(input).token)
      return db.runTransaction(async tx => {
        const invite = (await tx.get(db.collection("_guest_invitations").doc(hash))).data()
        if (!invite || invite.revokedAt || invite.redeemedAt || milliseconds(invite.expiresAt) <= clock()) throw unavailable()
        const family = await tx.get(db.collection("families").doc(invite.familyId))
        const snapshot = await tx.get(db.collection("postings").doc(invite.postingId))
        if (!family.exists) throw unavailable()
        let posting: FirebaseFirestore.DocumentData
        try { posting = openPosting(snapshot.data(), clock()) } catch { throw unavailable() }
        return {
          familyName: family.data()?.accountName || "Your sponsoring family",
          shift: { title: posting.title, type: posting.type, date: milliseconds(posting.date),
            startTime: posting.startTime ? milliseconds(posting.startTime) : null,
            endTime: posting.endTime ? milliseconds(posting.endTime) : null,
            description: posting.description || null }, expiresAt: milliseconds(invite.expiresAt)
        }
      })
    },
    async redeem(input: unknown) {
      const args = data(input)
      const hash = tokenHash(args.token)
      const name = `${text(args.firstName, "first name", 80)} ${text(args.lastName, "last name", 80)}`
      const relation = text(args.relation, "relation", 100)
      return db.runTransaction(async tx => {
        const ref = db.collection("_guest_invitations").doc(hash)
        const invite = (await tx.get(ref)).data()
        if (!invite) throw unavailable()
        // A lost-response retry remains successful even after expiry or cancellation.
        if (invite.redeemedAt && invite.registrationId) return { registrationId: invite.registrationId }
        if (invite.revokedAt || milliseconds(invite.expiresAt) <= clock()) throw unavailable()
        if (!(await tx.get(db.collection("families").doc(invite.familyId))).exists) throw unavailable()
        const registrationId = await register(tx, invite.familyId, invite.postingId, { name, relation, isGuest: true })
        tx.update(ref, { redeemedAt: Timestamp.fromMillis(clock()), registrationId })
        return { registrationId }
      })
    },
    async list(actor: Actor | undefined, input: unknown) {
      const familyId = id(data(input).familyId, "family ID")
      return db.runTransaction(async tx => {
        await authorize(tx, actor, familyId)
        const snapshot = await tx.get(db.collection("_guest_invitations").where("familyId", "==", familyId))
        return { invitations: snapshot.docs.map(entry => {
          const invite = entry.data()
          return { invitationId: entry.id, postingId: invite.postingId, shiftTitle: invite.shiftTitle, createdAt: milliseconds(invite.createdAt),
            expiresAt: milliseconds(invite.expiresAt), status: invite.redeemedAt ? "Redeemed" : invite.revokedAt ? "Revoked" : milliseconds(invite.expiresAt) <= clock() ? "Expired" : "Active" }
        }).sort((a, b) => b.createdAt - a.createdAt) }
      })
    },
    async revoke(actor: Actor | undefined, input: unknown) {
      const invitationId = id(data(input).invitationId, "invitation ID")
      return db.runTransaction(async tx => {
        const ref = db.collection("_guest_invitations").doc(invitationId)
        const invite = (await tx.get(ref)).data()
        if (!invite) throw unavailable()
        await authorize(tx, actor, invite.familyId)
        if (invite.redeemedAt) throw new HttpsError("failed-precondition", "This invitation has already been used.")
        if (!invite.revokedAt) tx.update(ref, { revokedAt: Timestamp.fromMillis(clock()) })
        return { success: true }
      })
    },
    async signup(actor: Actor | undefined, input: unknown) {
      const args = data(input)
      const familyId = id(args.familyId, "family ID")
      const postingId = id(args.postingId, "shift ID")
      const name = text(args.name, "volunteer name", 161)
      return db.runTransaction(async tx => {
        await authorize(tx, actor, familyId)
        const registrationId = await register(tx, familyId, postingId, { name, isGuest: false })
        return { registrationId }
      })
    },
    async cancel(actor: Actor | undefined, input: unknown) {
      const registrationId = id(data(input).registrationId, "registration ID")
      return db.runTransaction(async tx => {
        if (!actor) throw new HttpsError("unauthenticated", "Please sign in.")
        const ref = db.collection("registrations").doc(registrationId)
        const snapshot = await tx.get(ref)
        if (!snapshot.exists) return { success: true }
        const reg = snapshot.data()!
        const { admin } = await authorize(tx, actor, reg.familyId, true)
        const postingRef = db.collection("postings").doc(reg.postingId)
        const posting = await tx.get(postingRef)
        if (!admin && (reg.status !== "Pending" || !posting.exists || cutoff(posting.data()!) - clock() < 86_400_000)) {
          throw new HttpsError("failed-precondition", "Please contact an administrator to cancel this registration.")
        }
        if (posting.exists) tx.update(postingRef, { _registrationRevision: FieldValue.increment(1) })
        tx.delete(ref)
        return { success: true }
      })
    }
  }
}

function actor(request: { auth?: { uid: string; token: { email?: unknown; email_verified?: unknown } } }): Actor | undefined {
  return request.auth ? { uid: request.auth.uid, email: typeof request.auth.token.email === "string" ? request.auth.token.email : undefined, emailVerified: request.auth.token.email_verified === true } : undefined
}
export const createGuestInvitation = onCall(request => invitationService(getFirestore()).create(actor(request), request.data))
export const getGuestInvitation = onCall(request => invitationService(getFirestore()).get(request.data))
export const redeemGuestInvitation = onCall(request => invitationService(getFirestore()).redeem(request.data))
export const listGuestInvitations = onCall(request => invitationService(getFirestore()).list(actor(request), request.data))
export const revokeGuestInvitation = onCall(request => invitationService(getFirestore()).revoke(actor(request), request.data))
export const registerForShift = onCall(request => invitationService(getFirestore()).signup(actor(request), request.data))
export const cancelShiftRegistration = onCall(request => invitationService(getFirestore()).cancel(actor(request), request.data))
