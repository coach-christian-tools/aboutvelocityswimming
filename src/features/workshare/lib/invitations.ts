import { httpsCallable } from "firebase/functions"
import { functions } from "./firebase"
import { worksharePath } from "./routes"

export interface GuestInvitationDetails {
  familyName: string
  expiresAt: number
  shift: { title: string; type: "General" | "Event-Specific"; date: number; startTime: number | null; endTime: number | null; description: string | null }
}
export interface InvitationSummary {
  invitationId: string
  postingId: string
  shiftTitle: string
  createdAt: number
  expiresAt: number
  status: "Active" | "Redeemed" | "Revoked" | "Expired"
}
const create = httpsCallable<{ familyId: string; postingId: string }, { token: string; expiresAt: number }>(functions, "createGuestInvitation")
export async function createGuestLink(familyId: string, postingId: string) {
  const { data } = await create({ familyId, postingId })
  return { url: `${window.location.origin}${worksharePath("guest")}#token=${data.token}`, expiresAt: data.expiresAt }
}
export const getGuestInvitation = httpsCallable<{ token: string }, GuestInvitationDetails>(functions, "getGuestInvitation")
export const redeemGuestInvitation = httpsCallable<{ token: string; firstName: string; lastName: string; relation: string }, { registrationId: string }>(functions, "redeemGuestInvitation")
export const listGuestInvitations = httpsCallable<{ familyId: string }, { invitations: InvitationSummary[] }>(functions, "listGuestInvitations")
export const revokeGuestInvitation = httpsCallable<{ invitationId: string }, { success: boolean }>(functions, "revokeGuestInvitation")
export const registerForShift = httpsCallable<{ familyId: string; postingId: string; name: string }, { registrationId: string }>(functions, "registerForShift")
export const cancelShiftRegistration = httpsCallable<{ registrationId: string }, { success: boolean }>(functions, "cancelShiftRegistration")
