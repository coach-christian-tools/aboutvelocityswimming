import { reminderWindow } from "./reminderWindow"
import { onSchedule } from "firebase-functions/v2/scheduler"
import { onCall, HttpsError } from "firebase-functions/v2/https"
import * as admin from "firebase-admin"
import { getFirestore } from "firebase-admin/firestore"
import * as crypto from "crypto"
import { Resend } from "resend"

admin.initializeApp()
const db = getFirestore()

export const sendOtp = onCall({ cors: true }, async (request) => {
  const rawEmail = request.data?.email
  if (!rawEmail || typeof rawEmail !== "string") {
    throw new HttpsError("invalid-argument", "A valid email address is required.")
  }

  const email = rawEmail.trim().toLowerCase()
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    throw new HttpsError("invalid-argument", "Invalid email format.")
  }

  const otpDocRef = db.collection("_otp_codes").doc(email)
  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) throw new HttpsError("internal", "Email service is not configured.")
  const code = crypto.randomInt(100000, 1000000).toString()
  const codeHash = crypto.createHash("sha256").update(code).digest("hex")
  await db.runTransaction(async transaction => {
    const existing = await transaction.get(otpDocRef)
    const createdAt = existing.data()?.createdAt?.toMillis() || 0
    const now = Date.now()
    if (existing.exists && now - createdAt < 60_000) {
      const seconds = Math.ceil((60_000 - (now - createdAt)) / 1000)
      throw new HttpsError("resource-exhausted", `Please wait ${seconds} seconds before requesting a new code.`)
    }
    transaction.set(otpDocRef, {
      email, codeHash, attempts: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(now + 10 * 60_000)
    })
  })
  const resend = new Resend(resendApiKey)

  // Send from verified custom domain velocityworkshare.com
  const fromAddress = process.env.RESEND_FROM_EMAIL || "Velocity Workshare <noreply@velocityworkshare.com>"

  try {
    const sendResult = await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: `Your Velocity Workshare login code: ${code}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #0284c7; font-size: 22px; font-weight: 700; margin: 0;">Velocity Swimming</h1>
            <p style="color: #64748b; font-size: 14px; margin: 4px 0 0 0;">Workshare Portal Sign-In</p>
          </div>
          <p style="font-size: 15px; color: #334155; line-height: 1.5; margin-bottom: 20px;">
            Enter the 6-digit verification code below to securely sign in to your Velocity Workshare account.
          </p>
          <div style="background-color: #f0f9ff; border: 2px dashed #0284c7; border-radius: 10px; padding: 20px; text-align: center; margin: 24px 0;">
            <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0369a1; font-family: monospace;">${code}</span>
          </div>
          <p style="font-size: 13px; color: #64748b; line-height: 1.4; margin-top: 24px; text-align: center;">
            This code will expire in <strong>10 minutes</strong>. If you did not request this login code, you can safely ignore this email.
          </p>
        </div>
      `
    })

    if (sendResult.error) {
      console.error("Resend API error:", sendResult.error)
      throw new HttpsError("internal", sendResult.error.message || "Failed to deliver email.")
    }

    return { success: true, message: "Code sent successfully." }
  } catch (err: unknown) {
    console.error("Error sending OTP email:", err)
    if (err instanceof HttpsError) throw err
    throw new HttpsError("internal", (err instanceof Error ? err.message : "Failed to send verification email."))
  }
})

export const verifyOtp = onCall({ cors: true }, async (request) => {
  const rawEmail = request.data?.email
  const rawCode = request.data?.code

  if (!rawEmail || typeof rawEmail !== "string") {
    throw new HttpsError("invalid-argument", "Email is required.")
  }
  if (!rawCode || typeof rawCode !== "string") {
    throw new HttpsError("invalid-argument", "Verification code is required.")
  }

  const email = rawEmail.trim().toLowerCase()
  const code = rawCode.trim()

  if (code.length !== 6 || !/^\d{6}$/.test(code)) {
    throw new HttpsError("invalid-argument", "Verification code must be 6 digits.")
  }

  const otpDocRef = db.collection("_otp_codes").doc(email)
  const inputHash = crypto.createHash("sha256").update(code).digest("hex")
  // Return errors from the transaction so expiry cleanup and failed-attempt writes commit.
  const verificationError = await db.runTransaction(async transaction => {
    const otpDoc = await transaction.get(otpDocRef)
    if (!otpDoc.exists) return new HttpsError("not-found", "No active verification code found. Please request a new code.")
    const data = otpDoc.data()
    if (Date.now() > (data?.expiresAt?.toMillis() || 0)) {
      transaction.delete(otpDocRef)
      return new HttpsError("deadline-exceeded", "This verification code has expired. Please request a new one.")
    }
    const attempts = data?.attempts || 0
    if (attempts >= 5) {
      transaction.delete(otpDocRef)
      return new HttpsError("permission-denied", "Too many invalid attempts. Please request a new code.")
    }
    if (inputHash !== data?.codeHash) {
      transaction.update(otpDocRef, { attempts: attempts + 1 })
      const remaining = 4 - attempts
      return new HttpsError("invalid-argument", `Invalid verification code. ${remaining} attempts remaining.`)
    }
    transaction.delete(otpDocRef)
    return null
  })
  if (verificationError) throw verificationError

  // Get or create Firebase Auth user
  let userRecord: admin.auth.UserRecord
  try {
    userRecord = await admin.auth().getUserByEmail(email)
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && err.code === "auth/user-not-found") {
      userRecord = await admin.auth().createUser({
        email,
        emailVerified: true
      })
    } else {
      throw new HttpsError("internal", (err instanceof Error ? err.message : "Failed to process user account."))
    }
  }

  // A successful OTP proves ownership, including for pre-existing password accounts.
  if (!userRecord.emailVerified) await admin.auth().updateUser(userRecord.uid, { emailVerified: true })

  // Generate Firebase Custom Token
  const customToken = await admin.auth().createCustomToken(userRecord.uid, {
    email,
    isAdmin: email.endsWith("@velocity-swimming.com")
  })

  return {
    success: true,
    token: customToken
  }
})

export const sendShiftReminders = onSchedule({
  schedule: "every day 00:00", timeZone: "America/Los_Angeles", retryCount: 3
}, async (event) => {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error("RESEND_API_KEY is required to send shift reminders.")
  const resend = new Resend(apiKey)
  const { start, end } = reminderWindow(new Date(event.scheduleTime))
  const snapshot = await db.collection("postings")
    .where("date", ">=", admin.firestore.Timestamp.fromDate(start))
    .where("date", "<", admin.firestore.Timestamp.fromDate(end))
    .get()

  const families = new Map<string, string[]>()
  for (const posting of snapshot.docs) {
    const job = posting.data()
    if (job.archived || job.status === "Completed") continue
    const registrations = await db.collection("registrations")
      .where("postingId", "==", posting.id).get()
    for (const registration of registrations.docs) {
      const reg = registration.data()
      if (reg.status !== "Pending") continue
      const reminderKey = `${registration.id}-${start.toISOString().slice(0, 10)}`
      const marker = db.collection("_shift_reminders").doc(reminderKey)
      if ((await marker.get()).exists) continue
      if (!families.has(reg.familyId)) {
        const family = await db.collection("families").doc(reg.familyId).get()
        const emails: string[] = family.data()?.authorizedEmails || []
        families.set(reg.familyId, [...new Set(emails.map(email => email.trim().toLowerCase()).filter(Boolean))])
      }
      const emails = families.get(reg.familyId) || []
      if (!emails.length) continue
      const shiftDate = (job.startTime || job.date).toDate().toLocaleString("en-US", {
        timeZone: "America/Los_Angeles", dateStyle: "full", timeStyle: "short"
      })
      const result = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "Velocity Workshare <noreply@velocityworkshare.com>",
        to: emails,
        subject: `Reminder: Upcoming Shift for ${job.title}`,
        text: `Hello! ${reg.assignee.name} is signed up for ${job.title} on ${shiftDate} (Pacific time). Please contact your administrator if you need help with this shift.`
      }, { idempotencyKey: reminderKey })
      if (result.error) throw new Error(`Reminder delivery failed: ${result.error.message}`)
      await marker.set({ sentAt: admin.firestore.FieldValue.serverTimestamp(), registrationId: registration.id })
      console.log(`Reminder delivered for registration ${registration.id}`)
    }
  }
})

export { createGuestInvitation, getGuestInvitation, redeemGuestInvitation, listGuestInvitations, revokeGuestInvitation, registerForShift, cancelShiftRegistration } from "./invitations"
