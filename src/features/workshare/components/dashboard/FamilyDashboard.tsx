import { cancelShiftRegistration } from "../../lib/invitations"
import { GuestInvitations } from "./GuestInvitations"
import { errorMessage } from "../../lib/errors"
import { DIVISION_STYLES } from "../../lib/families"
import { completedHours } from "../../lib/hours"
import { useFamilyActivity } from "../../hooks/useFamilyActivity"
import { useEffect, useState } from "react"
import { onSnapshot, doc } from "@/lib/data"
import { db } from "../../lib/backend"
import { useAuth } from "../../contexts/auth"
import type { Family, ChildGroup } from "../../types"
import { Card } from "../ui/Card"
import { Calendar, Clock, User, Award, CheckCircle2, Users, Mail, HelpCircle } from "lucide-react"

export function FamilyDashboard() {
  const { familyId, isAdmin, clientMode } = useAuth()
  const effectiveIsAdmin = isAdmin && !clientMode
  const [family, setFamily] = useState<Family | null>(null)
  const [loadedFamilyId, setLoadedFamilyId] = useState<string | null>(null)
  const [familyError, setFamilyError] = useState(false)
  const { registrations, postings, manualHours, error } = useFamilyActivity(familyId)

  useEffect(() => {
    if (!familyId) return
    return onSnapshot(doc(db, "families", familyId), snapshot => {
      setFamily(snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as Family : null)
      setLoadedFamilyId(familyId)
      setFamilyError(!snapshot.exists())
    }, () => { setFamilyError(true); setLoadedFamilyId(familyId) })
  }, [familyId])

  const totals = completedHours(registrations, postings, manualHours)
  const completedGeneral = Math.round(totals.general * 10) / 10
  const completedEvent = Math.round(totals.event * 10) / 10
  const upcomingRegs = registrations.flatMap(reg => {
    const job = postings[reg.postingId]
    return reg.status === "Pending" && job ? [{ ...reg, job }] : []
  }).sort((a, b) => a.job.date.toMillis() - b.job.date.toMillis())

  const cancelRegistration = async (regId: string) => {
    if (confirm("Are you sure you want to cancel this shift?")) {
      try {
        await cancelShiftRegistration({ registrationId: regId })
      } catch (err) {
        alert(errorMessage(err) || "Unable to cancel this registration.")
      }
    }
  }

  if (effectiveIsAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary">Administrator Dashboard</h2>
          <p className="text-sm text-slate-500 mt-1">Manage family accounts, postings, and shift rosters.</p>
        </div>
        <Card className="bg-surface border border-slate-200 p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-[#0A856C]/10 text-accent">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-primary">Welcome to VS Workshare Admin</h3>
              <p className="text-sm text-slate-600 mt-1">
                Use the navigation menu to review registered families, verify rosters, or post new volunteer shifts on the Job Board.
              </p>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (error || (loadedFamilyId === familyId && familyError)) return <p role="alert" className="text-red-600">Unable to load family dashboard. Please try again.</p>

  if (!family || loadedFamilyId !== familyId) {
    if (clientMode && !familyId) {
      return (
        <div className="p-12 text-center text-slate-500 font-medium bg-surface rounded-2xl border border-dashed border-slate-300">
          <h3 className="text-xl font-bold text-text-primary mb-2">Client View Preview</h3>
          <p className="text-sm">You are viewing the client side, but your admin account is not linked to a specific family.</p>
          <p className="text-sm mt-2">Families will see their progress towards workshare requirements and their upcoming shifts here.</p>
        </div>
      )
    }

    return (
      <div className="p-12 text-center text-slate-500 font-medium animate-pulse">
        Loading family dashboard...
      </div>
    )
  }

  const genReq = family.requirements?.generalPoolHours || 0
  const evReq = family.requirements?.eventSpecificHours || 0
  const totalCompleted = Math.round((completedGeneral + completedEvent) * 10) / 10
  const totalReq = Math.round((genReq + evReq) * 10) / 10
  const genPct = Math.min(100, genReq > 0 ? (completedGeneral / genReq) * 100 : 100)
  const evPct = Math.min(100, evReq > 0 ? (completedEvent / evReq) * 100 : 100)

  const swimmers = (family.children && family.children.length > 0)
    ? family.children
    : (family.members || []).map(m => ({ name: m.fullName, group: (m.category || "No Assignment") as ChildGroup }))

  return (
    <div className="space-y-8">
      <GuestInvitations key={familyId} familyId={familyId!} />
      {/* Page Header */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
          {family.accountName ? `${family.accountName} Dashboard` : "Family Dashboard"}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          {family.accountName ? `${family.accountName} • ` : ""}{family.category} Division • Track your seasonal workshare requirements
        </p>
      </div>

      {/* Account Information Card */}
      <Card className="bg-surface border border-slate-200 overflow-hidden shadow-xs">
        <div className="border-b border-slate-100 px-6 py-4 flex flex-wrap items-center justify-between gap-3 bg-bg/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#13415D]/10 text-text-primary">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-text-primary">Account Information</h3>
              <p className="text-xs text-slate-500">Authorized emails, registered swimmers, and hour requirements</p>
            </div>
          </div>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${
            DIVISION_STYLES[family.category] || DIVISION_STYLES.Recreation
          }`}>
            {family.category} Division
          </span>
        </div>

        <div className="p-6 space-y-6">
          {/* Account Name & Authorized Emails */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-100">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                Account Name
              </span>
              <p className="text-base font-bold text-text-primary">
                {family.accountName || "Unnamed Account"}
              </p>
            </div>

            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                Authorized Emails
              </span>
              {family.authorizedEmails && family.authorizedEmails.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {family.authorizedEmails.map((email, idx) => (
                    <a
                      key={idx}
                      href={`mailto:${email}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-xs font-medium text-text-primary transition-colors"
                    >
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{email}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No authorized emails listed</p>
              )}
            </div>
          </div>

          {/* Swimmers and Practice Groups */}
          <div className="pb-6 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                Swimmers & Practice Groups
              </span>
              <span className="text-xs font-medium text-slate-500">
                {swimmers.length} {swimmers.length === 1 ? "swimmer" : "swimmers"} registered
              </span>
            </div>

            {swimmers.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {swimmers.map((swimmer, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-bg border border-slate-200/80"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-[#13415D]/10 text-text-primary flex items-center justify-center font-bold text-xs shrink-0">
                        {swimmer.name ? swimmer.name.charAt(0).toUpperCase() : "?"}
                      </div>
                      <span className="font-semibold text-sm text-text-primary truncate">
                        {swimmer.name}
                      </span>
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-surface text-text-primary border border-slate-200 shrink-0">
                      {swimmer.group}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center rounded-xl bg-bg border border-dashed border-slate-200 text-xs text-slate-400 italic">
                No swimmers listed for this account
              </div>
            )}
          </div>

          {/* Complete and Required Hours Breakdown */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-3">
              Workshare Hours Summary
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* General Pool Hours */}
              <div className="p-4 rounded-xl bg-bg border border-slate-200/80">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-600">General Pool</span>
                  {completedGeneral >= genReq && genReq > 0 ? (
                    <span className="text-[11px] font-bold text-accent bg-[#0A856C]/10 px-2 py-0.5 rounded-full">
                      Met
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-slate-500">
                      In Progress
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold text-text-primary">{completedGeneral}</span>
                  <span className="text-xs font-medium text-slate-400">/ {genReq} hrs</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {completedGeneral >= genReq 
                    ? "Required hours fulfilled" 
                    : `${Math.max(0, Math.round((genReq - completedGeneral) * 10) / 10)} hrs remaining`}
                </p>
              </div>

              {/* Event-Specific Hours */}
              <div className="p-4 rounded-xl bg-bg border border-slate-200/80">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-600">Event-Specific</span>
                  {completedEvent >= evReq && evReq > 0 ? (
                    <span className="text-[11px] font-bold text-accent bg-[#0A856C]/10 px-2 py-0.5 rounded-full">
                      Met
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-slate-500">
                      In Progress
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold text-text-primary">{completedEvent}</span>
                  <span className="text-xs font-medium text-slate-400">/ {evReq} hrs</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {completedEvent >= evReq 
                    ? "Required hours fulfilled" 
                    : `${Math.max(0, Math.round((evReq - completedEvent) * 10) / 10)} hrs remaining`}
                </p>
              </div>

              {/* Total Hours */}
              <div className="p-4 rounded-xl bg-bg border border-slate-200/80">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-600">Total Hours</span>
                  {totalCompleted >= totalReq && totalReq > 0 ? (
                    <span className="text-[11px] font-bold text-accent bg-[#0A856C]/10 px-2 py-0.5 rounded-full">
                      Met
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-slate-500">
                      In Progress
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold text-text-primary">{totalCompleted}</span>
                  <span className="text-xs font-medium text-slate-400">/ {totalReq} hrs</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {totalCompleted >= totalReq 
                    ? "All season requirements met!" 
                    : `${Math.max(0, Math.round((totalReq - totalCompleted) * 10) / 10)} hrs remaining total`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>
      
      {/* Progress Cards */}
      <div className="grid sm:grid-cols-2 gap-5">
        <Card className="bg-surface border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#0A856C]" />
              <h3 className="text-base font-bold text-text-primary">General Pool Progress</h3>
            </div>
            {genPct >= 100 && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-accent bg-[#0A856C]/10 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" /> Met
              </span>
            )}
          </div>
          
          <div className="flex justify-between items-baseline mb-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-text-primary">
              {completedGeneral} <span className="text-sm font-medium text-slate-500">/ {genReq} hrs</span>
            </span>
            <span className="text-sm font-bold text-accent">{Math.round(genPct)}%</span>
          </div>

          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
            <div 
              className="bg-[#0A856C] h-3 rounded-full transition-all duration-1000 ease-out" 
              style={{ width: `${genPct}%` }} 
            />
          </div>
        </Card>

        <Card className="bg-surface border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#13415D]" />
              <h3 className="text-base font-bold text-text-primary">Event-Specific Progress</h3>
            </div>
            {evPct >= 100 && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-accent bg-[#0A856C]/10 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" /> Met
              </span>
            )}
          </div>

          <div className="flex justify-between items-baseline mb-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-text-primary">
              {completedEvent} <span className="text-sm font-medium text-slate-500">/ {evReq} hrs</span>
            </span>
            <span className="text-sm font-bold text-text-primary">{Math.round(evPct)}%</span>
          </div>

          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
            <div 
              className="bg-[#13415D] h-3 rounded-full transition-all duration-1000 ease-out" 
              style={{ width: `${evPct}%` }} 
            />
          </div>
        </Card>
      </div>

      {/* Upcoming Shifts Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg sm:text-xl font-bold text-text-primary">Upcoming Shifts</h3>
          <span className="text-xs font-semibold text-slate-500">
            {upcomingRegs.length} {upcomingRegs.length === 1 ? "shift" : "shifts"} scheduled
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {upcomingRegs.map(reg => (
            <Card key={reg.id} className="relative overflow-hidden bg-surface border border-slate-200 flex flex-col p-5 hover:border-slate-300 transition-all">
              <div 
                className={`absolute top-0 left-0 bottom-0 w-1.5 ${
                  reg.job.type === 'General' ? 'bg-[#0A856C]' : 'bg-[#13415D]'
                }`} 
              />
              <div className="pl-2 flex-1">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="font-bold text-base text-text-primary leading-tight">{reg.job.title}</h4>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap ${
                    reg.job.type === 'General' 
                      ? 'bg-[#0A856C]/10 text-accent' 
                      : 'bg-[#13415D]/10 text-text-primary'
                  }`}>
                    {reg.job.type}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 mb-4">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span>{reg.job.date.toDate().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  </div>
                  {reg.job.startTime && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span>{reg.job.startTime.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="font-medium text-text-primary">
                      {reg.assignee.name} {reg.assignee.isGuest && <span className="text-slate-500 font-normal">(Guest)</span>}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 mt-auto flex justify-between items-center">
                  <button 
                    onClick={() => cancelRegistration(reg.id)}
                    className="text-xs text-red-600 hover:text-red-800 font-semibold py-1.5 px-2 -ml-2 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    Cancel Shift
                  </button>
                  <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    Pending
                  </span>
                </div>
              </div>
            </Card>
          ))}
          {upcomingRegs.length === 0 && (
            <div className="col-span-full py-12 px-4 text-center bg-surface rounded-2xl border border-dashed border-slate-300">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Calendar className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-text-primary mb-1">No Upcoming Shifts</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                You haven&apos;t declared any shifts yet. Head over to the Job Board to claim upcoming workshare positions.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Account Info Correction / Support Section */}
      <div className="p-5 sm:p-6 rounded-2xl bg-surface border border-slate-200/90 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="p-3 rounded-xl bg-[#13415D]/10 text-text-primary shrink-0">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-text-primary">
              Notice any incorrect account information?
            </h3>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              If any of your account details, authorized emails, swimmer roster, practice groups, or workshare hour requirements need adjustment, please reach out directly to Coach Audrey and Coach Christian to get any incorrect information corrected.
            </p>
            
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                href="mailto:coachaudrey@velocity-swimming.com"
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-bg hover:bg-[#0A856C]/10 border border-slate-200/80 hover:border-[#0A856C]/30 text-xs font-semibold text-text-primary transition-all"
              >
                <Mail className="w-4 h-4 text-accent shrink-0" />
                <span>Coach Audrey:</span>
                <span className="text-slate-600 font-normal">coachaudrey@velocity-swimming.com</span>
              </a>
              <a
                href="mailto:coachchristian@velocity-swimming.com"
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-bg hover:bg-[#0A856C]/10 border border-slate-200/80 hover:border-[#0A856C]/30 text-xs font-semibold text-text-primary transition-all"
              >
                <Mail className="w-4 h-4 text-accent shrink-0" />
                <span>Coach Christian:</span>
                <span className="text-slate-600 font-normal">coachchristian@velocity-swimming.com</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


