import { useEffect, useState } from "react"
import { useLocation } from "@/features/workshare/lib/navigation"
import { getGuestInvitation, redeemGuestInvitation } from "../../lib/invitations"
import type { GuestInvitationDetails } from "../../lib/invitations"
import { errorMessage } from "../../lib/errors"
import { Card } from "../ui/Card"
import { Input } from "../ui/Input"
import { Button } from "../ui/Button"
import { VSLogo } from "../ui/VSLogo"
import { Calendar, Clock, CheckCircle2, AlertTriangle, UserCheck } from "lucide-react"

export function GuestProxy() {
  const location = useLocation()
  const token = new URLSearchParams(location.hash.slice(1)).get("token") || ""
  const legacyLink = new URLSearchParams(location.search).has("familyId") || new URLSearchParams(location.search).has("jobId")
  return <GuestInvitationForm key={`${token}:${legacyLink}`} token={legacyLink ? "" : token} />
}

function GuestInvitationForm({ token }: { token: string }) {
  const [details, setDetails] = useState<GuestInvitationDetails | null>(null)
  const [loading, setLoading] = useState(Boolean(token))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const job = details?.shift

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [relation, setRelation] = useState("")
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    let active = true
    if (!token) return
    getGuestInvitation({ token }).then(response => {
      if (active) setDetails(response.data)
    }).catch(() => {
      if (active) setDetails(null)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!details || submitting) return
    setSubmitting(true)
    setError("")
    try {
      await redeemGuestInvitation({ token, firstName, lastName, relation })
      setSubmitted(true)
    } catch (cause) {
      setError(errorMessage(cause) || "Unable to register. Please try again or ask the family for a new link.")
    } finally { setSubmitting(false) }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="text-slate-500 font-medium animate-pulse">Loading shift details...</div>
      </div>
    )
  }

  if (!job || !details) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center bg-surface border border-red-200 p-8">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">Invalid or Expired Link</h2>
          <p className="text-sm text-slate-500">This invitation is invalid, expired, revoked, or already used. Older guest links no longer work. Ask the family to generate a new link.</p>
        </Card>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center bg-surface border border-[#0A856C]/30 p-8 shadow-sm">
          <div className="w-16 h-16 bg-[#0A856C]/10 text-accent rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-extrabold text-text-primary mb-2">Thank You!</h2>
          <p className="text-sm text-slate-600">
            You have successfully registered to cover <strong>{job.title}</strong> as a guest volunteer.
          </p>
          <div className="mt-4 p-3 bg-bg rounded-xl border border-slate-100 text-xs text-slate-500">
            Credit has been linked to the <strong>{details.familyName}</strong> family.
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md flex flex-col items-center">
        {/* Brand Header */}
        <div className="mb-6 text-center">
          <VSLogo size="lg" className="mb-2" />
          <p className="text-sm text-slate-500 font-medium">Guest Proxy Volunteer Registration</p>
        </div>

        <Card className="w-full bg-surface shadow-sm border border-slate-200 p-6 sm:p-8">
          {/* Shift Details Box */}
          <div className="bg-[#13415D]/5 border border-[#13415D]/15 p-4 rounded-xl mb-6">
            <div className="flex items-center gap-1.5 text-xs font-bold text-accent uppercase tracking-wider mb-1">
              <UserCheck className="w-3.5 h-3.5" /> Volunteering On Behalf Of
            </div>
            <p className="font-extrabold text-text-primary text-sm truncate">{details.familyName}</p>
            
            <div className="my-3 border-t border-slate-200/80" />
            
            <p className="font-bold text-base text-text-primary">{job.title}</p>
            <div className="mt-1 space-y-1 text-xs text-slate-600">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{new Date(job.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })}</span>
              </div>
              {(job.startTime || job.endTime) && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {job.startTime ? new Date(job.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', timeZone: 'America/Los_Angeles'}) : ''} - {job.endTime ? new Date(job.endTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', timeZone: 'America/Los_Angeles'}) : ''}
                  </span>
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="guest-first-name" className="block text-xs font-semibold text-text-primary mb-1">First Name</label>
                <Input id="guest-first-name" required maxLength={80} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" />
              </div>
              <div>
                <label htmlFor="guest-last-name" className="block text-xs font-semibold text-text-primary mb-1">Last Name</label>
                <Input id="guest-last-name" required maxLength={80} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" />
              </div>
            </div>
            <div>
              <label htmlFor="guest-relation" className="block text-xs font-semibold text-text-primary mb-1">Relation to Family</label>
              <Input id="guest-relation" required maxLength={100} value={relation} onChange={e => setRelation(e.target.value)} placeholder="e.g. Grandparent, Family Friend, Relative" />
            </div>
            <div className="pt-2">
              <Button type="submit" disabled={submitting} variant="primary" size="lg" className="w-full">
                {submitting ? "Registering..." : "Confirm Guest Registration"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}

