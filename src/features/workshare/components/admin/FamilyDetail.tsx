import { completedHours as calculateCompletedHours, volunteerLogs } from "../../lib/hours"
import { CHILD_GROUPS, DIVISION_STYLES, normalizeEmails } from "../../lib/families"
import { useEffect, useState, useRef, useMemo } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { doc, onSnapshot, updateDoc, deleteDoc, collection, query, where, addDoc, Timestamp } from "firebase/firestore"
import { db } from "../../lib/firebase"
import type { Family, Child, ChildGroup, Registration, Posting, ManualHour, WorkDescription } from "../../types"
import { Button } from "../ui/Button"
import { Card } from "../ui/Card"
import { Input } from "../ui/Input"
import { format } from "date-fns"
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Calendar,
  ClipboardList,
  GripVertical,
  Check,
  Search,
  Filter,
  Clock,
  X,
  ChevronDown
} from "lucide-react"


export function FamilyDetailAdmin() {
  const { familyId } = useParams<{ familyId: string }>()
  return <FamilyDetailContent key={familyId} />
}

function FamilyDetailContent() {
  const { familyId } = useParams<{ familyId: string }>()
  const navigate = useNavigate()

  const [family, setFamily] = useState<Family | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Registrations, Postings, Manual Hours for volunteer logs stats
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [postings, setPostings] = useState<Record<string, Posting>>({})
  const [manualHours, setManualHours] = useState<ManualHour[]>([])
  const [workDescriptions, setWorkDescriptions] = useState<WorkDescription[]>([])

  // Logs state
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<"All" | "General" | "Event-Specific">("All")
  
  // Give Hours state
  const [isGiveHoursOpen, setIsGiveHoursOpen] = useState(false)
  const [giveDate, setGiveDate] = useState("")
  const [giveStartTime, setGiveStartTime] = useState("")
  const [giveEndTime, setGiveEndTime] = useState("")
  const [giveDescription, setGiveDescription] = useState("")
  const [giveHours, setGiveHours] = useState("")
  const [giveType, setGiveType] = useState<"General" | "Event-Specific">("General")
  const [showDescDropdown, setShowDescDropdown] = useState(false)
  const [isSubmittingHour, setIsSubmittingHour] = useState(false)

  // Form state
  const [accountName, setAccountName] = useState("")
  const [category, setCategory] = useState<Family["category"]>("Recreation")
  const [emails, setEmails] = useState("")
  const [children, setChildren] = useState<Child[]>([])
  const [generalHours, setGeneralHours] = useState("0")
  const [eventHours, setEventHours] = useState("0")

  // Resizable split state (percentage of left pane)
  const [splitPercent, setSplitPercent] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load family data
  useEffect(() => {
    if (!familyId) return

    const unsubFamily = onSnapshot(doc(db, "families", familyId), (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as Family
        setFamily(data)
        setAccountName(data.accountName || "")
        setCategory(data.category || "Recreation")
        setEmails(data.authorizedEmails?.join(", ") || "")
        setChildren(data.children ? [...data.children] : [])
        setGeneralHours(String(data.requirements?.generalPoolHours ?? 0))
        setEventHours(String(data.requirements?.eventSpecificHours ?? 0))
      } else {
        setFamily(null)
      }
      setLoading(false)
    })

    const unsubRegs = onSnapshot(
      query(collection(db, "registrations"), where("familyId", "==", familyId)),
      (snapshot) => {
        setRegistrations(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Registration)))
      }
    )

    const unsubPosts = onSnapshot(collection(db, "postings"), (snapshot) => {
      const posts: Record<string, Posting> = {}
      snapshot.forEach(d => { posts[d.id] = { id: d.id, ...d.data() } as Posting })
      setPostings(posts)
    })

    const unsubManual = onSnapshot(
      query(collection(db, "manual_hours"), where("familyId", "==", familyId)),
      (snapshot) => {
        setManualHours(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ManualHour)))
      }
    )

    const unsubDesc = onSnapshot(collection(db, "work_descriptions"), (snapshot) => {
      setWorkDescriptions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WorkDescription)))
    })

    return () => {
      unsubFamily()
      unsubRegs()
      unsubPosts()
      unsubManual()
      unsubDesc()
    }
  }, [familyId])

  // Completed hours calculation
  const completedHours = useMemo(
    () => calculateCompletedHours(registrations, postings, manualHours),
    [registrations, postings, manualHours]
  )

  const hasChanges = useMemo(() => {
    if (!family) return false
    if (accountName.trim() !== (family.accountName || "").trim()) return true
    if (category !== (family.category || "Recreation")) return true
    if (emails.trim() !== (family.authorizedEmails?.join(", ") || "").trim()) return true
    if (generalHours !== String(family.requirements?.generalPoolHours ?? 0)) return true
    if (eventHours !== String(family.requirements?.eventSpecificHours ?? 0)) return true

    const initialChildren = family.children || []
    if (children.length !== initialChildren.length) return true
    for (let i = 0; i < children.length; i++) {
      if (
        children[i].name.trim() !== (initialChildren[i]?.name || "").trim() ||
        children[i].group !== initialChildren[i]?.group
      ) {
        return true
      }
    }
    return false
  }, [family, accountName, category, emails, children, generalHours, eventHours])

  // Split-divider drag handler
  useEffect(() => {
    if (!isDragging) return

    const handlePointerMove = (e: PointerEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const clientX = e.clientX
      const newPercent = ((clientX - rect.left) / rect.width) * 100
      // Clamp between 25% and 75%
      const clamped = Math.min(Math.max(newPercent, 25), 75)
      setSplitPercent(clamped)
    }

    const handlePointerUp = () => {
      setIsDragging(false)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)

    const originalCursor = document.body.style.cursor
    const originalUserSelect = document.body.style.userSelect
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
      document.body.style.cursor = originalCursor
      document.body.style.userSelect = originalUserSelect
    }
  }, [isDragging])

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
    if (val === "" || /^\d*\.?\d*$/.test(val)) {
      setter(val)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!familyId) return

    const genHoursNum = parseFloat(generalHours)
    const eventHoursNum = parseFloat(eventHours)

    if (isNaN(genHoursNum) || isNaN(eventHoursNum)) {
      alert("Please enter a valid number for General Pool Hours and Event-Specific Hours.")
      return
    }

    const authorizedEmails = normalizeEmails(emails)
    const validChildren = children.map(c => ({
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
      members: family?.members || []
    }

    setIsSaving(true)
    try {
      await updateDoc(doc(db, "families", familyId), familyData)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      console.error(err)
      alert("Error saving family data. Please check console.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!familyId) return
    if (registrations.length || manualHours.length) {
      alert("This family has volunteer history and cannot be deleted. Keep the account to preserve its records.")
      return
    }
    if (confirm("Are you sure you want to permanently delete this family? This cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "families", familyId))
        navigate("/admin/families")
      } catch (err) {
        console.error(err)
        alert("Failed to delete family.")
      }
    }
  }

  // Combined Logs Logic
  const combinedLogs = useMemo(() => {
    const logs = volunteerLogs(registrations, postings, manualHours, true)

    // Filter
    return logs.filter(log => {
      if (typeFilter !== "All" && log.type !== typeFilter) return false
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        if (!log.title.toLowerCase().includes(query) && !log.type.toLowerCase().includes(query)) {
          return false
        }
      }
      return true
    })
  }, [manualHours, registrations, postings, typeFilter, searchQuery])

  const handleGiveHoursSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!familyId) return

    const hrs = parseFloat(giveHours)
    if (isNaN(hrs) || hrs <= 0) {
      alert("Please enter a valid amount of hours.")
      return
    }

    if (!giveDate) {
      alert("Please select a date.")
      return
    }

    setIsSubmittingHour(true)
    try {
      // Handle Description Auto-saving
      const descTrimmed = giveDescription.trim()
      if (descTrimmed) {
        const exists = workDescriptions.some(d => d.text.toLowerCase() === descTrimmed.toLowerCase())
        if (!exists) {
          await addDoc(collection(db, "work_descriptions"), { text: descTrimmed })
        }
      }

      // Add Manual Hour
      const [year, month, day] = giveDate.split("-").map(Number)
      const d = new Date(year, month - 1, day)

      await addDoc(collection(db, "manual_hours"), {
        familyId,
        date: Timestamp.fromDate(d),
        startTime: giveStartTime || null,
        endTime: giveEndTime || null,
        hours: hrs,
        type: giveType,
        description: descTrimmed || null
      })

      // Reset form
      setIsGiveHoursOpen(false)
      setGiveDate("")
      setGiveStartTime("")
      setGiveEndTime("")
      setGiveDescription("")
      setGiveHours("")
      setGiveType("General")
    } catch (err) {
      console.error(err)
      alert("Failed to add hours.")
    } finally {
      setIsSubmittingHour(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
        Loading family profile...
      </div>
    )
  }

  if (!family) {
    return (
      <div className="space-y-4 py-8">
        <Link
          to="/admin/families"
          className="inline-flex items-center text-sm font-semibold text-[#0A856C] hover:underline"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to Families
        </Link>
        <Card className="p-8 text-center bg-white border border-slate-200">
          <p className="text-slate-500 font-medium">Family not found or may have been deleted.</p>
        </Card>
      </div>
    )
  }

  const reqGen = family.requirements?.generalPoolHours ?? 0
  const reqEvent = family.requirements?.eventSpecificHours ?? 0
  const formattedGen = Math.round(completedHours.general * 10) / 10
  const formattedEvent = Math.round(completedHours.event * 10) / 10

  return (
    <div className="space-y-6">
      {/* Top Header / Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <Link
            to="/admin/families"
            className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-[#0A856C] transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Back to Family Roster
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#13415D] tracking-tight">
              {family.accountName || "Unnamed Family"}
            </h2>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                DIVISION_STYLES[family.category] || DIVISION_STYLES.Recreation
              }`}
            >
              {family.category}
            </span>
          </div>
        </div>

        {/* Quick summary stats */}
        <div className="flex items-center gap-6 sm:gap-8">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">
              General Hours
            </span>
            <div className="flex items-baseline gap-1">
              <span
                className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                  completedHours.general >= reqGen && reqGen > 0 ? "text-[#0A856C]" : "text-[#13415D]"
                }`}
              >
                {formattedGen}
              </span>
              <span className="text-sm font-medium text-slate-400">/ {reqGen} hrs</span>
            </div>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">
              Event Hours
            </span>
            <div className="flex items-baseline gap-1">
              <span
                className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                  completedHours.event >= reqEvent && reqEvent > 0 ? "text-[#0A856C]" : "text-[#13415D]"
                }`}
              >
                {formattedEvent}
              </span>
              <span className="text-sm font-medium text-slate-400">/ {reqEvent} hrs</span>
            </div>
          </div>
        </div>
      </div>

      {/* Resizable Two-Halves Container */}
      <div
        ref={containerRef}
        className="flex flex-col md:flex-row w-full bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden min-h-[640px]"
      >
        {/* Left Half: Family Edit Form */}
        <div
          className="w-full md:overflow-y-auto p-6 space-y-6"
          {...(typeof window !== "undefined" && window.innerWidth >= 768
            ? { style: { width: `${splitPercent}%` } }
            : {})}
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-[#13415D]">Family Profile & Settings</h3>
            </div>
            {saveSuccess && (
              <span className="inline-flex items-center text-xs font-semibold text-[#0A856C] bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                <Check className="w-3.5 h-3.5 mr-1" />
                Saved
              </span>
            )}
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            {/* Account Name & Division */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#13415D] mb-1">Account Name</label>
                <Input
                  required
                  value={accountName}
                  onChange={e => setAccountName(e.target.value)}
                  placeholder="e.g. Smith Family"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#13415D] mb-1">Division</label>
                <div className="relative">
                  <select
                    className="flex h-11 w-full appearance-none rounded-lg border border-slate-300 bg-white pl-3.5 pr-10 py-2 text-sm text-[#13415D] focus-visible:outline-none focus-visible:border-[#0A856C] focus-visible:ring-2 focus-visible:ring-[#0A856C]/20 cursor-pointer"
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
              <label className="block text-xs font-semibold text-[#13415D] mb-1">
                Authorized Emails (comma-separated)
              </label>
              <Input
                required
                value={emails}
                onChange={e => setEmails(e.target.value)}
                placeholder="parent1@example.com, parent2@example.com"
              />
            </div>

            {/* Swimmers Section */}
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-semibold text-[#13415D]">Swimmers</label>
                  <p className="text-[11px] text-slate-500">Registered children and assigned practice group.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddChild}
                  className="h-8 text-xs px-2.5 text-[#0A856C] border-[#0A856C]/30 hover:bg-[#0A856C]/10"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Child
                </Button>
              </div>

              {children.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {children.map((child, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200"
                    >
                      <div className="flex-1">
                        <Input
                          placeholder="Child Name"
                          value={child.name}
                          onChange={e => handleChildChange(index, "name", e.target.value)}
                          className="h-9 text-xs"
                          required
                        />
                      </div>
                      <div className="relative w-40 sm:w-44">
                        <select
                          value={child.group}
                          onChange={e => handleChildChange(index, "group", e.target.value as ChildGroup)}
                          className="flex h-9 w-full appearance-none rounded-lg border border-slate-300 bg-white pl-3 pr-9 py-1 text-xs text-[#13415D] focus-visible:outline-none focus-visible:border-[#0A856C] focus-visible:ring-2 focus-visible:ring-[#0A856C]/20 cursor-pointer"
                        >
                          {CHILD_GROUPS.map(grp => (
                            <option key={grp} value={grp}>
                              {grp}
                            </option>
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
                <div className="text-xs text-slate-400 italic bg-slate-50 border border-dashed border-slate-200 rounded-lg p-3 text-center">
                  No children registered yet. Click &quot;Add Child&quot; to add swimmers.
                </div>
              )}
            </div>

            {/* Numerical inputs for required hours */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-[#13415D] mb-1">General Pool Hours Req.</label>
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
                <label className="block text-xs font-semibold text-[#13415D] mb-1">Event-Specific Hours Req.</label>
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

            {/* Actions Footer */}
            <div className="pt-4 flex items-center justify-between border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={handleDelete}
                className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Delete Family
              </Button>
              {hasChanges ? (
                <Button type="submit" variant="primary" disabled={isSaving}>
                  <Save className="w-4 h-4 mr-1.5" />
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/admin/families")}
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Back to Roster
                </Button>
              )}
            </div>
          </form>
        </div>

        {/* Draggable Vertical Divider (visible on md+) */}
        <div
          onPointerDown={e => {
            e.preventDefault()
            setIsDragging(true)
          }}
          className={`hidden md:flex w-3 shrink-0 items-center justify-center cursor-col-resize select-none relative z-10 transition-colors ${
            isDragging ? "bg-[#0A856C]/20" : "hover:bg-slate-100"
          }`}
          title="Drag to resize panels"
        >
          <div
            className={`w-[2px] h-full transition-colors ${
              isDragging ? "bg-[#0A856C]" : "bg-slate-200 group-hover:bg-slate-300"
            }`}
          />
          <div className="absolute p-1 bg-white border border-slate-200 rounded-full shadow-xs text-slate-400">
            <GripVertical className="w-3 h-3" />
          </div>
        </div>

        {/* Mobile horizontal divider */}
        <div className="md:hidden border-t border-slate-200" />

        {/* Right Half: Volunteer Logs */}
        <div
          className="w-full md:overflow-y-auto p-6 bg-slate-50/50 flex flex-col"
          {...(typeof window !== "undefined" && window.innerWidth >= 768
            ? { style: { width: `${100 - splitPercent}%` } }
            : {})}
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-[#0A856C]" />
              <h3 className="text-lg font-bold text-[#13415D]">Volunteer Logs</h3>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsGiveHoursOpen(true)}
              className="text-[#0A856C] border-[#0A856C]/30 hover:bg-[#0A856C]/10"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Give Hours
            </Button>
          </div>

          {isGiveHoursOpen && (
            <div className="mb-6 p-4 bg-white border border-slate-200 rounded-xl shadow-xs animate-in fade-in zoom-in-95 duration-200 mt-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-[#13415D]">Give Manual Hours</h4>
                <button
                  type="button"
                  onClick={() => setIsGiveHoursOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleGiveHoursSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#13415D] mb-1">Date</label>
                    <Input type="date" required value={giveDate} onChange={e => setGiveDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#13415D] mb-1">Hours</label>
                    <Input type="number" step="0.1" required value={giveHours} onChange={e => setGiveHours(e.target.value)} placeholder="e.g. 2.5" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#13415D] mb-1">Start Time (Opt)</label>
                    <Input type="time" value={giveStartTime} onChange={e => setGiveStartTime(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#13415D] mb-1">Stop Time (Opt)</label>
                    <Input type="time" value={giveEndTime} onChange={e => setGiveEndTime(e.target.value)} />
                  </div>
                </div>

                <div className="relative">
                  <label className="block text-xs font-semibold text-[#13415D] mb-1">Description of Work (Opt)</label>
                  <div className="relative">
                    <Input
                      value={giveDescription}
                      onChange={e => { setGiveDescription(e.target.value); setShowDescDropdown(true) }}
                      onFocus={() => setShowDescDropdown(true)}
                      onBlur={() => setTimeout(() => setShowDescDropdown(false), 200)}
                      placeholder="e.g. Timing System Setup"
                      className="pr-8"
                    />
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                  {showDescDropdown && workDescriptions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {workDescriptions
                        .filter(d => d.text.toLowerCase().includes(giveDescription.toLowerCase()))
                        .map(d => (
                          <button
                            key={d.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm text-[#13415D] hover:bg-slate-50 transition-colors"
                            onClick={() => {
                              setGiveDescription(d.text)
                              setShowDescDropdown(false)
                            }}
                          >
                            {d.text}
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#13415D] mb-1">Hour Type</label>
                  <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => setGiveType("General")}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                        giveType === "General"
                          ? "bg-white text-[#13415D] shadow-sm border border-slate-200/50"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      General
                    </button>
                    <button
                      type="button"
                      onClick={() => setGiveType("Event-Specific")}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                        giveType === "Event-Specific"
                          ? "bg-white text-[#13415D] shadow-sm border border-slate-200/50"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Event-Specific
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button type="submit" variant="primary" disabled={isSubmittingHour}>
                    {isSubmittingHour ? "Saving..." : "Add Hours"}
                  </Button>
                </div>
              </form>
            </div>
          )}

          <div className="flex gap-2 mt-4 mb-4">
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
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
                className="pl-9 pr-9 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#0A856C] focus:ring-1 focus:ring-[#0A856C] appearance-none cursor-pointer"
              >
                <option value="All">All Types</option>
                <option value="General">General</option>
                <option value="Event-Specific">Event</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {combinedLogs.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <ClipboardList className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-600">No logs found</p>
                <p className="text-xs text-slate-400 mt-1">Adjust filters or give hours.</p>
              </div>
            ) : (
              combinedLogs.map(log => (
                <div key={log.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <h4 className="font-bold text-[#13415D] text-sm">{log.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {format(log.date, "MMM d, yyyy")}
                        {log.startTime && log.endTime && ` • ${log.startTime} - ${log.endTime}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-[#0A856C] whitespace-nowrap">+{log.hours} hrs</div>
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">
                        {log.type}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      {log.isManual ? (
                        <>
                          <Clock className="w-3.5 h-3.5" />
                          <span>Manual Entry</span>
                        </>
                      ) : (
                        <>
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Shift: {log.assignee}</span>
                        </>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${
                      log.status === "Complete" ? "bg-emerald-50 text-emerald-700" :
                      log.status === "Pending" ? "bg-amber-50 text-amber-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {log.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
