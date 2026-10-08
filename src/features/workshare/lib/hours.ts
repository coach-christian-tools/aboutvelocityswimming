import type { ManualHour, Posting, Registration } from "../types"

export function postingHours(posting: Posting): number {
  if (!posting.startTime || !posting.endTime) return 1
  const hours = (posting.endTime.toMillis() - posting.startTime.toMillis()) / 3_600_000
  return Number.isFinite(hours) ? Math.max(0, hours) : 0
}

export function completedHours(registrations: Registration[], postings: Record<string, Posting>, manualHours: ManualHour[]) {
  let general = 0
  let event = 0
  for (const reg of registrations) {
    const post = reg.shiftSnapshot || postings[reg.postingId]
    if (reg.status !== "Complete" || !post) continue
    const hours = postingHours(post)
    if (post.type === "General") general += hours
    else event += hours
  }
  for (const entry of manualHours) {
    if (entry.type === "General") general += entry.hours
    else event += entry.hours
  }
  return { general, event }
}

export interface VolunteerLog {
  isManual: boolean
  id: string
  date: Date
  title: string
  type: Posting["type"]
  hours: number
  status: Registration["status"]
  startTime?: string | null
  endTime?: string | null
  assignee?: string
}

export function volunteerLogs(registrations: Registration[], postings: Record<string, Posting>, manualHours: ManualHour[], includePending = false): VolunteerLog[] {
  const logs: VolunteerLog[] = manualHours.map(entry => ({
    isManual: true, id: entry.id, date: entry.date.toDate(),
    title: entry.description || "Manual Hour Adjustment", type: entry.type,
    hours: entry.hours, status: "Complete", startTime: entry.startTime, endTime: entry.endTime
  }))
  for (const reg of registrations) {
    const post = reg.shiftSnapshot || postings[reg.postingId]
    if ((!includePending && reg.status === "Pending") || !post) continue
    logs.push({
      isManual: false, id: reg.id, date: post.date.toDate(), title: post.title,
      type: post.type, hours: reg.status === "Complete" ? Math.round(postingHours(post) * 10) / 10 : 0,
      status: reg.status, assignee: reg.assignee.name
    })
  }
  return logs.sort((a, b) => b.date.getTime() - a.date.getTime())
}
