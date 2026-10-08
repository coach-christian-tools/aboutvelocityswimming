import type { ChildGroup, Family } from "../types"

export const CHILD_GROUPS: ChildGroup[] = [
  "No Assignment", "Splash", "Pre-Team", "Prep", "Age Groupers", "Juniors",
  "Seniors", "Masters", "Rec Team", "Coaches", "Board Members"
]

export const DIVISION_STYLES: Record<Family["category"], string> = {
  Competitive: "bg-blue-50 text-blue-700 border-blue-200/60",
  Masters: "bg-purple-50 text-purple-700 border-purple-200/60",
  Development: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
  Recreation: "bg-slate-100 text-slate-700 border-slate-200/60"
}

export function normalizeEmails(value: string): string[] {
  return [...new Set(value.split(",").map(email => email.trim().toLowerCase()).filter(Boolean))]
}
