import { useCallback, useEffect, useState } from "react"
import { createGuestLink, listGuestInvitations, revokeGuestInvitation } from "../../lib/invitations"
import type { InvitationSummary } from "../../lib/invitations"
import { errorMessage } from "../../lib/errors"
import { Card } from "../ui/Card"
import { Button } from "../ui/Button"

export function GuestInvitations({ familyId }: { familyId: string }) {
  const [invitations, setInvitations] = useState<InvitationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [link, setLink] = useState("")
  const reload = useCallback(async () => {
    try {
      const response = await listGuestInvitations({ familyId })
      setInvitations(response.data.invitations)
    } catch { setError("Unable to load guest invitations. Please try again.") }
    finally { setLoading(false) }
  }, [familyId])
  useEffect(() => {
    let active = true
    listGuestInvitations({ familyId }).then(response => {
      if (active) setInvitations(response.data.invitations)
    }).catch(() => {
      if (active) setError("Unable to load guest invitations. Please try again.")
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [familyId])
  const manage = async (invitation: InvitationSummary, replace: boolean) => {
    setBusy(invitation.invitationId)
    setError("")
    try {
      if (invitation.status === "Active") await revokeGuestInvitation({ invitationId: invitation.invitationId })
      if (replace) {
        const created = await createGuestLink(familyId, invitation.postingId)
        setLink(created.url)
      }
      await reload()
    } catch (cause) {
      setError(errorMessage(cause) || "Unable to update invitation. Please try again.")
      await reload()
    } finally { setBusy(null) }
  }
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold">Guest invitations</h3>
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => { setError(""); setLoading(true); void reload() }}>Refresh</Button>
      </div>
      <p className="text-sm text-slate-500">Create a guest link from the Job Board. Each link can be used once and does not reserve a spot.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {link && <div className="space-y-2">
        <label htmlFor="replacement-link" className="block text-sm font-semibold">Replacement link — copy and share with your guest</label>
        <input id="replacement-link" readOnly value={link} onFocus={event => event.target.select()} className="w-full rounded-lg border border-slate-300 p-2 text-sm" />
        <p className="text-xs text-slate-500">Keep this link private. Anyone holding it can register once.</p>
      </div>}
      {loading ? <p role="status">Loading invitations...</p> : !invitations.length ? <p className="text-sm text-slate-500">No guest invitations yet.</p> :
        <ul className="space-y-3">{invitations.map(invitation => <li key={invitation.invitationId} className="flex flex-wrap justify-between items-center gap-3 border-t border-slate-100 pt-3">
          <div className="text-sm"><strong>{invitation.shiftTitle}</strong> · {invitation.status}<p className="text-slate-500">Created {new Date(invitation.createdAt).toLocaleString()} · Expires {new Date(invitation.expiresAt).toLocaleString()}</p></div>
          <div className="flex gap-2">
            {invitation.status === "Active" && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => { void manage(invitation, false) }}>Revoke</Button>}
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => { void manage(invitation, true) }}>New link</Button>
          </div>
        </li>)}</ul>}
    </Card>
  )
}
