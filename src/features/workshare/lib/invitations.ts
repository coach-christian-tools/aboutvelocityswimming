function callable<Input,Output>(operation:string){return async(input:Input):Promise<{data:Output}>=>{const response=await fetch('/api/workshare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,input})});const result=await response.json();if(!response.ok)throw new Error(result.error??'Unable to process request.');return result;};}


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
const create = callable<{ familyId: string; postingId: string }, { token: string; expiresAt: number }>("createGuestInvitation")
export async function createGuestLink(familyId: string, postingId: string) {
  const { data } = await create({ familyId, postingId })
  return { url: `${window.location.origin}${worksharePath("guest")}#token=${data.token}`, expiresAt: data.expiresAt }
}
export const getGuestInvitation = callable<{ token: string }, GuestInvitationDetails>("getGuestInvitation")
export const redeemGuestInvitation = callable<{ token: string; firstName: string; lastName: string; relation: string }, { registrationId: string }>("redeemGuestInvitation")
export const listGuestInvitations = callable<{ familyId: string }, { invitations: InvitationSummary[] }>("listGuestInvitations")
export const revokeGuestInvitation = callable<{ invitationId: string }, { success: boolean }>("revokeGuestInvitation")
export const registerForShift = callable<{ familyId: string; postingId: string; name: string }, { registrationId: string }>("registerForShift")
export const cancelShiftRegistration = callable<{ registrationId: string }, { success: boolean }>("cancelShiftRegistration")
