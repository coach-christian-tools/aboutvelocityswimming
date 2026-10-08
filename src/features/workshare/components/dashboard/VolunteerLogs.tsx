import { useFamilyActivity } from "../../hooks/useFamilyActivity"
import { volunteerLogs } from "../../lib/hours"
import { useState, useMemo } from "react"
import { useAuth } from "../../contexts/auth"
import { Card } from "../ui/Card"
import { Calendar, Clock, ClipboardList, Filter, Search } from "lucide-react"
import { format } from "date-fns"

export function VolunteerLogs() {
  const { familyId } = useAuth()
  const { registrations, postings, manualHours, loading, error } = useFamilyActivity(familyId)

  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<"All" | "General" | "Event-Specific">("All")

  const combinedLogs = useMemo(() => {
    const logs = volunteerLogs(registrations, postings, manualHours)

    return logs.filter(log => {
      if (typeFilter !== "All" && log.type !== typeFilter) return false
      if (searchQuery) {
        const queryStr = searchQuery.toLowerCase()
        if (!log.title.toLowerCase().includes(queryStr) && !log.type.toLowerCase().includes(queryStr)) {
          return false
        }
      }
      return true
    })
  }, [manualHours, registrations, postings, typeFilter, searchQuery])

  if (!familyId) {
    return (
      <div className="p-12 text-center text-slate-500 font-medium bg-white rounded-2xl border border-dashed border-slate-300">
        <h3 className="text-xl font-bold text-[#13415D] mb-2">Volunteer Logs</h3>
        <p className="text-sm">You are viewing the client side, but your account is not linked to a specific family.</p>
      </div>
    )
  }

  if (error) return <p role="alert" className="text-red-600">Unable to load volunteer logs. Please try again.</p>

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 font-medium animate-pulse">
        Loading logs...
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#13415D] tracking-tight">Volunteer Logs</h2>
        <p className="text-sm text-slate-500 mt-1">Review your family&apos;s completed shifts and hour adjustments.</p>
      </div>

      <Card className="p-6 bg-white border border-slate-200">
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#0A856C] focus:ring-1 focus:ring-[#0A856C]"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
              className="pl-9 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#0A856C] focus:ring-1 focus:ring-[#0A856C] appearance-none min-w-[140px]"
            >
              <option value="All">All Types</option>
              <option value="General">General</option>
              <option value="Event-Specific">Event</option>
            </select>
          </div>
        </div>

        <div className="space-y-3">
          {combinedLogs.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <ClipboardList className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-600">No logs found</p>
              <p className="text-xs text-slate-400 mt-1">Adjust filters or complete shifts to see them here.</p>
            </div>
          ) : (
            combinedLogs.map(log => (
              <div key={log.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-[#13415D] text-base">{log.title}</h4>
                    <span className={`px-2 py-0.5 text-[10px] rounded-full font-bold uppercase tracking-wide ${
                      log.type === "General" ? "bg-[#0A856C]/10 text-[#0A856C]" : "bg-[#13415D]/10 text-[#13415D]"
                    }`}>
                      {log.type}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{format(log.date, "MMM d, yyyy")}</span>
                    </div>
                    {log.startTime && log.endTime && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{log.startTime} - {log.endTime}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      {log.isManual ? (
                        <span className="italic text-slate-400">Admin Adjustment</span>
                      ) : (
                        <span>Shift by {log.assignee}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:flex-col sm:items-end gap-1">
                  <div className="text-lg font-bold text-[#0A856C]">+{log.hours} hrs</div>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    log.status === "Complete" ? "bg-emerald-100 text-emerald-700" :
                    log.status === "Incomplete" ? "bg-red-100 text-red-700" :
                    "bg-slate-200 text-slate-600"
                  }`}>
                    {log.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  )
}
