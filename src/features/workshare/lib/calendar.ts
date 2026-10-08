import type { Posting } from "../types"

export function generateICS(job: Posting) {
  if (!job.startTime || !job.endTime) {
    alert("This job does not have specific start and end times.")
    return
  }

  const start = job.startTime.toDate()
  const end = job.endTime.toDate()

  // Format date to YYYYMMDDTHHMMSSZ (UTC)
  const formatDateTime = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
  }

  const dtstart = formatDateTime(start)
  const dtend = formatDateTime(end)
  const stamp = formatDateTime(new Date())

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Velocity Swimming//Workshare Portal//EN",
    "BEGIN:VEVENT",
    `UID:${job.id}@velocityswimming.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:Volunteer: ${job.title}`,
    `DESCRIPTION:${job.description || "Velocity Swimming Workshare Shift"}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n")

  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.setAttribute("download", `${job.title.replace(/\s+/g, "_")}.ics`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
