import {Dialog} from "@/components/shared/Dialog";
import SwimmerPicker from "@/components/shared/SwimmerPicker";
import { postingHours } from "../../lib/hours"
import { CHILD_GROUPS, DIVISION_STYLES, normalizeEmails } from "../../lib/families"
import { useEffect, useState, useMemo } from "react"
import { useNavigate } from "@/features/workshare/lib/navigation"
import { collection, onSnapshot, addDoc } from "@/lib/data"
import { db } from "../../lib/backend"
import type { Family, Child, ChildGroup, Registration, Posting, ManualHour } from "../../types"
import { Button } from "../ui/Button"
import { Card } from "../ui/Card"
import { Input } from "../ui/Input"
import { downloadCSV } from "../../lib/csv"
import { Download, Plus, Trash2, X, Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown } from "lucide-react"

type SortField = "account" | "general" | "event"
type SortOrder = "asc" | "desc"


function formatAccountName(name?: string): string {
  if (!name) return ""
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ""
  if (parts.length === 1) return parts[0]
  const firstName = parts[0]
  const lastPart = parts[parts.length - 1]
  const lastInitial = lastPart[0] ? `${lastPart[0].toUpperCase()}.` : ""
  return `${firstName} ${lastInitial}`.trim()
}

function formatHours(num: number): string {
  const rounded = Math.round(num * 10) / 10
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1)
}

export function FamiliesAdmin() {
  const navigate = useNavigate()
  const [families, setFamilies] = useState<Family[]>([])
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [postings, setPostings] = useState<Record<string, Posting>>({})
  const [manualHours, setManualHours] = useState<ManualHour[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("")
  const [divisionFilter, setDivisionFilter] = useState<string>("ALL")
  const [sortField, setSortField] = useState<SortField>("account")
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc")

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortOrder(field === "account" ? "asc" : "desc")
    }
  }

  // Form state
  const [accountName, setAccountName] = useState("")
  const [category, setCategory] = useState<Family["category"]>("Recreation")
  const [emails, setEmails] = useState("")
  const [children, setChildren] = useState<Child[]>([])
  const [generalHours, setGeneralHours] = useState("0")
  const [eventHours, setEventHours] = useState("0")

  useEffect(() => {
    const unsubFamilies = onSnapshot(collection(db, "families"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Family))
      setFamilies(data)
    })
    const unsubRegs = onSnapshot(collection(db, "registrations"), (snapshot) => {
      setRegistrations(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Registration)))
    })
    const unsubPosts = onSnapshot(collection(db, "postings"), (snapshot) => {
      const posts: Record<string, Posting> = {}
      snapshot.forEach(d => { posts[d.id] = { id: d.id, ...d.data() } as Posting })
      setPostings(posts)
    })
    const unsubManual = onSnapshot(collection(db, "manual_hours"), (snapshot) => {
      setManualHours(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ManualHour)))
    })
    return () => {
      unsubFamilies()
      unsubRegs()
      unsubPosts()
      unsubManual()
    }
  }, [])

  const familyCompletedHours = useMemo(() => {
    const map: Record<string, { general: number; event: number }> = {}
    
    for (const f of families) {
      map[f.id] = { general: 0, event: 0 }
    }

    for (const reg of registrations) {
      if (reg.status === "Complete" && reg.familyId) {
        const post = reg.shiftSnapshot || postings[reg.postingId]
        if (post) {
          const hours = postingHours(post)
          if (!map[reg.familyId]) {
            map[reg.familyId] = { general: 0, event: 0 }
          }
          if (post.type === "General") {
            map[reg.familyId].general += hours
          } else {
            map[reg.familyId].event += hours
          }
        }
      }
    }

    for (const m of manualHours) {
      if (!map[m.familyId]) {
        map[m.familyId] = { general: 0, event: 0 }
      }
      if (m.type === "General") {
        map[m.familyId].general += m.hours
      } else {
        map[m.familyId].event += m.hours
      }
    }

    return map
  }, [registrations, postings, manualHours, families])

  const filteredFamilies = useMemo(() => {
    const list = families.filter(f => {
      const matchesDivision = divisionFilter === "ALL" || f.category === divisionFilter
      if (!matchesDivision) return false

      if (!searchTerm.trim()) return true
      const term = searchTerm.toLowerCase()
      const matchName = f.accountName?.toLowerCase().includes(term)
      const matchEmail = f.authorizedEmails?.some(e => e.toLowerCase().includes(term))
      const matchChild = f.children?.some(c => c.name.toLowerCase().includes(term) || c.group.toLowerCase().includes(term))
      return matchName || matchEmail || matchChild
    })

    return list.sort((a, b) => {
      if (sortField === "account") {
        const nameA = (a.accountName || "").trim().split(/\s+/)[0].toLowerCase()
        const nameB = (b.accountName || "").trim().split(/\s+/)[0].toLowerCase()
        const comp = nameA.localeCompare(nameB)
        return sortOrder === "asc" ? comp : -comp
      }

      if (sortField === "general") {
        const hoursA = familyCompletedHours[a.id]?.general ?? 0
        const hoursB = familyCompletedHours[b.id]?.general ?? 0
        const comp = hoursA - hoursB
        return sortOrder === "asc" ? comp : -comp
      }

      if (sortField === "event") {
        const hoursA = familyCompletedHours[a.id]?.event ?? 0
        const hoursB = familyCompletedHours[b.id]?.event ?? 0
        const comp = hoursA - hoursB
        return sortOrder === "asc" ? comp : -comp
      }

      return 0
    })
  }, [families, searchTerm, divisionFilter, sortField, sortOrder, familyCompletedHours])

  const handleExport = () => {
    const dataToExport = families.map(f => {
      const completed = familyCompletedHours[f.id] || { general: 0, event: 0 }
      return {
        ID: f.id,
        AccountName: f.accountName || "",
        Division: f.category,
        Children: f.children ? f.children.map(c => `${c.name} (${c.group})`).join("; ") : "",
        Emails: f.authorizedEmails.join("; "),
        GeneralPoolHoursReq: f.requirements?.generalPoolHours ?? 0,
        GeneralPoolHoursCompleted: completed.general,
        EventSpecificHoursReq: f.requirements?.eventSpecificHours ?? 0,
        EventSpecificHoursCompleted: completed.event
      }
    })
    downloadCSV(dataToExport, "families_export.csv")
  }

  const openModal = () => {
    setAccountName("")
    setCategory("Recreation")
    setEmails("")
    setChildren([])
    setGeneralHours("0")
    setEventHours("0")
    setIsModalOpen(true)
  }

  const handleAddChild = () => {
    setChildren(prev => [...prev, { name: "", group: "No Assignment" }])
  }

  const handleChildChange = (index: number, field: keyof Child, value: string) => {
    setChildren(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const handleRemoveChild = (index: number) => {
    setChildren(prev => prev.filter((_, i) => i !== index))
  }

  const handleNumberChange = (setter: (val: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    // Allow empty string or valid integer/decimal number
    if (val === "" || /^\d*\.?\d*$/.test(val)) {
      setter(val)
    }
  }

  const saveFamily = async (e: React.FormEvent) => {
    e.preventDefault()

    const genHoursNum = parseFloat(generalHours)
    const eventHoursNum = parseFloat(eventHours)

    if (isNaN(genHoursNum) || isNaN(eventHoursNum)) {
      alert("Please enter a valid number for General Pool Hours and Event-Specific Hours.")
      return
    }

    const authorizedEmails = normalizeEmails(emails)
    const validChildren = children.map(c => ({
      ...(c.id ? {id:c.id} : {}),
      name: c.name.trim(),
      group: c.group
    })).filter(c => c.name.length > 0)

    const familyData = {
      accountName: accountName.trim(),
      category,
      authorizedEmails,
      children: validChildren,
      requirements: {
        generalPoolHours: genHoursNum,
        eventSpecificHours: eventHoursNum
      },
      members: []
    }

    try {
      await addDoc(collection(db, "families"), familyData)
      setIsModalOpen(false)
    } catch (err) {
      console.error(err)
      alert("Error saving family data. Check console.")
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">Family Roster</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1.5 text-slate-500" />
            Export CSV
          </Button>
          <Button variant="primary" size="sm" onClick={() => openModal()}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Family
          </Button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            type="text"
            placeholder="Search by family, child, or email..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 h-10 text-sm w-full"
          />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
          <div className="relative w-full sm:w-44">
            <select
              value={divisionFilter}
              onChange={e => setDivisionFilter(e.target.value)}
              className="flex h-10 w-full appearance-none rounded-lg border border-slate-300 bg-surface pl-3.5 pr-10 py-1.5 text-xs font-medium text-text-primary focus-visible:outline-none focus-visible:border-[#0A856C] focus-visible:ring-2 focus-visible:ring-[#0A856C]/20 cursor-pointer"
            >
              <option value="ALL">All Divisions ({families.length})</option>
              <option value="Competitive">Competitive</option>
              <option value="Development">Development</option>
              <option value="Recreation">Recreation</option>
              <option value="Masters">Masters</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          </div>
          <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
            Showing {filteredFamilies.length} of {families.length}
          </span>
        </div>
      </div>

      {/* Families List / Table */}
      <Card className="p-0 md:p-0 overflow-hidden bg-surface border border-slate-200 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead>
              <tr className="border-b border-slate-100 bg-bg/70">
                <th
                  onClick={() => handleSort("account")}
                  className="py-3.5 px-4 font-bold text-xs uppercase tracking-wider text-slate-500 cursor-pointer select-none hover:text-text-primary transition-colors group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Account</span>
                    {sortField === "account" ? (
                      sortOrder === "asc" ? (
                        <ArrowUp className="w-3.5 h-3.5 text-accent" />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5 text-accent" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-40 group-hover:opacity-80 transition-opacity" />
                    )}
                  </div>
                </th>
                <th className="py-3.5 px-4 font-bold text-xs uppercase tracking-wider text-slate-500">
                  Swimmers
                </th>
                <th
                  onClick={() => handleSort("general")}
                  className="py-3.5 px-4 font-bold text-xs uppercase tracking-wider text-slate-500 cursor-pointer select-none hover:text-text-primary transition-colors group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>General Hours</span>
                    {sortField === "general" ? (
                      sortOrder === "asc" ? (
                        <ArrowUp className="w-3.5 h-3.5 text-accent" />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5 text-accent" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-40 group-hover:opacity-80 transition-opacity" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("event")}
                  className="py-3.5 px-4 font-bold text-xs uppercase tracking-wider text-slate-500 cursor-pointer select-none hover:text-text-primary transition-colors group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Event Hours</span>
                    {sortField === "event" ? (
                      sortOrder === "asc" ? (
                        <ArrowUp className="w-3.5 h-3.5 text-accent" />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5 text-accent" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-40 group-hover:opacity-80 transition-opacity" />
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredFamilies.map(f => {
                const completed = familyCompletedHours[f.id] || { general: 0, event: 0 }
                const reqGen = f.requirements?.generalPoolHours ?? 0
                const reqEvent = f.requirements?.eventSpecificHours ?? 0

                return (
                  <tr
                    key={f.id}
                    onClick={() => navigate(`/admin/families/${f.id}`)}
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        navigate(`/admin/families/${f.id}`)
                      }
                    }}
                    className="hover:bg-bg/80 cursor-pointer transition-colors focus-visible:outline-none focus-visible:bg-bg"
                    title="View family details"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-text-primary">
                          {formatAccountName(f.accountName) || <span className="text-slate-400 font-normal italic">Unnamed Family</span>}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                            DIVISION_STYLES[f.category] || DIVISION_STYLES.Recreation
                          }`}
                        >
                          {f.category}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {f.children && f.children.length > 0 ? (
                        <div className="flex flex-col items-start gap-1">
                          {f.children.map((child, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
                            >
                              <span className="font-semibold text-text-primary mr-1">
                                {child.name ? child.name.trim().split(/\s+/)[0] : ""}
                              </span>
                              <span className="text-slate-500 text-[11px]">({child.group})</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs italic">No children</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-base sm:text-lg font-bold tracking-tight ${
                          completed.general >= reqGen && reqGen > 0 ? "text-accent" : "text-text-primary"
                        }`}
                      >
                        {formatHours(completed.general)} of {formatHours(reqGen)} Complete
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-base sm:text-lg font-bold tracking-tight ${
                          completed.event >= reqEvent && reqEvent > 0 ? "text-accent" : "text-text-primary"
                        }`}
                      >
                        {formatHours(completed.event)} of {formatHours(reqEvent)} Complete
                      </span>
                    </td>
                  </tr>
                )
              })}
              {filteredFamilies.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 px-4 text-center text-slate-400 text-sm">
                    {families.length === 0 ? "No families registered yet. Click \"Add Family\" to create one." : "No families matched your search filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <Dialog onClose={() => setIsModalOpen(false)} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <Card className="w-full max-w-xl max-h-[90vh] flex flex-col bg-surface shadow-xl relative z-10 border border-slate-200 p-6 overflow-hidden">
            <div className="flex justify-between items-center mb-5 pb-2 border-b border-slate-100 shrink-0">
              <h3 className="text-xl font-bold text-text-primary">Add New Family</h3>
              <button aria-label="Close dialog"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={saveFamily} className="space-y-4 overflow-y-auto pr-1 flex-1">
              {/* Account Name and Division on the same row, name on left */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">Account Name</label>
                  <Input
                    required
                    value={accountName}
                    onChange={e => setAccountName(e.target.value)}
                    placeholder="e.g. Smith Family"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">Division</label>
                  <div className="relative">
                    <select
                      className="flex h-11 w-full appearance-none rounded-lg border border-slate-300 bg-surface pl-3.5 pr-10 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:border-[#0A856C] focus-visible:ring-2 focus-visible:ring-[#0A856C]/20 cursor-pointer"
                      value={category}
                      onChange={e => setCategory(e.target.value as Family["category"])}
                    >
                      <option value="Recreation">Recreation</option>
                      <option value="Development">Development</option>
                      <option value="Competitive">Competitive</option>
                      <option value="Masters">Masters</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  </div>
                </div>
              </div>

              {/* Authorized Emails */}
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">Authorized Emails (comma-separated)</label>
                <Input
                  required
                  value={emails}
                  onChange={e => setEmails(e.target.value)}
                  placeholder="parent1@example.com, parent2@example.com"
                />
              </div>

              {/* Children Section with Add Child button */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-semibold text-text-primary">Swimmers</label>
                    <p className="text-[11px] text-slate-500">Add children and their assigned swim group.</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddChild}
                    className="h-8 text-xs px-2.5 text-accent border-[#0A856C]/30 hover:bg-[#0A856C]/10"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add Child
                  </Button>
                </div>

                {children.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {children.map((child, index) => (
                      <div key={index} className="flex items-center gap-2 bg-bg p-2.5 rounded-lg border border-slate-200">
                        <div className="flex-1">
                          <SwimmerPicker child={child} onChange={value=>setChildren(previous=>previous.map((item,i)=>i===index?value:item))}/>
                        </div>
                        <div className="relative w-40 sm:w-44">
                          <select
                            value={child.group}
                          disabled={Boolean(child.id)}
                            onChange={e => handleChildChange(index, "group", e.target.value as ChildGroup)}
                            className="flex h-9 w-full appearance-none rounded-lg border border-slate-300 bg-surface pl-3 pr-9 py-1 text-xs text-text-primary focus-visible:outline-none focus-visible:border-[#0A856C] focus-visible:ring-2 focus-visible:ring-[#0A856C]/20 cursor-pointer"
                          >
                            {CHILD_GROUPS.map(grp => (
                              <option key={grp} value={grp}>{grp}</option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveChild(index)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Remove child"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic bg-bg border border-dashed border-slate-200 rounded-lg p-3 text-center">
                    No children added yet. Click &quot;Add Child&quot; to add swimmers.
                  </div>
                )}
              </div>

              {/* Numerical inputs as text inputs with validation */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">General Pool Hours</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    required
                    value={generalHours}
                    onChange={handleNumberChange(setGeneralHours)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">Event-Specific Hours</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    required
                    value={eventHours}
                    onChange={handleNumberChange(setEventHours)}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-slate-100 shrink-0">
                <div />
                <div className="flex items-center gap-2">
                  <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                  <Button type="submit" variant="primary">Save Family</Button>
                </div>
              </div>
            </form>
          </Card>
        </Dialog>
      )}
    </div>
  )
}
