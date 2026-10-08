import { cancelShiftRegistration } from "../../lib/invitations"
import { errorMessage } from "../../lib/errors"
import { useEffect, useState } from "react"
import { collection, onSnapshot, doc, runTransaction } from "firebase/firestore"
import { db } from "../../lib/firebase"
import type { Registration, Posting, Family } from "../../types"
import { Button } from "../ui/Button"
import { Card } from "../ui/Card"
import { downloadCSV } from "../../lib/csv"
import { Download, CheckCircle, XCircle, Trash2, CheckCircle2 } from "lucide-react"

export function RegistrationsAdmin() {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [postings, setPostings] = useState<Record<string, Posting>>({})
  const [families, setFamilies] = useState<Record<string, Family>>({})

  useEffect(() => {
    const unsubRegs = onSnapshot(collection(db, "registrations"), (snapshot) => {
      setRegistrations(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Registration)))
    })
    const unsubPosts = onSnapshot(collection(db, "postings"), (snapshot) => {
      const posts: Record<string, Posting> = {}
      snapshot.forEach(d => { posts[d.id] = { id: d.id, ...d.data() } as Posting })
      setPostings(posts)
    })
    const unsubFams = onSnapshot(collection(db, "families"), (snapshot) => {
      const fams: Record<string, Family> = {}
      snapshot.forEach(d => { fams[d.id] = { id: d.id, ...d.data() } as Family })
      setFamilies(fams)
    })

    return () => { unsubRegs(); unsubPosts(); unsubFams(); }
  }, [])

  const handleExport = () => {
    const dataToExport = registrations.map(r => {
      const post = r.shiftSnapshot || postings[r.postingId]
      const fam = families[r.familyId]
      return {
        ShiftTitle: post ? post.title : "Unknown",
        Date: post ? post.date.toDate().toISOString().split("T")[0] : "",
        FamilyAccountName: fam?.accountName || "Unnamed Family",
        FamilyEmail: fam ? fam.authorizedEmails.join(", ") : "Unknown",
        AssigneeName: r.assignee.name,
        IsGuest: r.assignee.isGuest ? "Yes" : "No",
        GuestRelation: r.assignee.relation || "",
        Status: r.status
      }
    })
    downloadCSV(dataToExport, "registrations_export.csv")
  }

  const updateStatus = async (id: string, status: Registration["status"]) => {
    try {
      await runTransaction(db, async transaction => {
        const ref = doc(db, "registrations", id)
        const registration = await transaction.get(ref)
        if (!registration.exists()) throw new Error("This registration no longer exists.")
        const data = registration.data()
        if (status === "Complete" && !data.shiftSnapshot) {
          const posting = await transaction.get(doc(db, "postings", data.postingId))
          if (!posting.exists()) throw new Error("Cannot award credit for a missing shift.")
          transaction.update(ref, { status, shiftSnapshot: { ...posting.data(), id: posting.id } })
        } else {
          transaction.update(ref, { status })
        }
      })
    } catch (error) {
      console.error(error)
      alert("Unable to update this registration. Please try again.")
    }
  }

  const deleteRegistration = async (id: string) => {
    if (confirm("Delete this registration?")) {
      try { await cancelShiftRegistration({ registrationId: id }) }
      catch (cause) { alert(errorMessage(cause) || "Unable to delete registration.") }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#13415D] tracking-tight">Roster & Attendance</h2>
          <p className="text-sm text-slate-500 mt-1">Review shift completions, guests, and mark attendance.</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} className="self-start sm:self-auto">
          <Download className="w-4 h-4 mr-1.5 text-slate-500" />
          Export CSV
        </Button>
      </div>

      <Card className="p-0 md:p-0 overflow-hidden bg-white border border-slate-200 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[650px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                <th className="py-3.5 px-4 font-bold text-xs uppercase tracking-wider text-slate-500">Shift Name</th>
                <th className="py-3.5 px-4 font-bold text-xs uppercase tracking-wider text-slate-500">Date</th>
                <th className="py-3.5 px-4 font-bold text-xs uppercase tracking-wider text-slate-500">Family</th>
                <th className="py-3.5 px-4 font-bold text-xs uppercase tracking-wider text-slate-500">Assignee</th>
                <th className="py-3.5 px-4 font-bold text-xs uppercase tracking-wider text-slate-500">Status</th>
                <th className="py-3.5 px-4 font-bold text-xs uppercase tracking-wider text-slate-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {registrations.map(r => {
                const post = r.shiftSnapshot || postings[r.postingId]
                const fam = families[r.familyId]
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3.5 px-4 text-sm font-bold text-[#13415D]">
                      {post?.title || <span className="text-red-500 font-normal">Deleted Shift</span>}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      {post ? post.date.toDate().toLocaleDateString() : ""}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      {fam ? (
                        <div>
                          <span className="font-semibold text-[#13415D] block">{fam.accountName || "Unnamed Family"}</span>
                          <span className="text-slate-500 text-[11px]">{fam.authorizedEmails.join(", ")}</span>
                        </div>
                      ) : (
                        <span className="text-red-500">Deleted Family</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-semibold text-[#13415D]">
                      {r.assignee.name}
                      {r.assignee.isGuest && (
                        <span className="ml-1.5 text-[10px] bg-[#13415D]/10 text-[#13415D] px-2 py-0.5 rounded-full font-bold">
                          Guest ({r.assignee.relation})
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1 ${
                        r.status === 'Complete' ? 'bg-[#0A856C]/10 text-[#0A856C]' :
                        r.status === 'Incomplete' ? 'bg-red-50 text-red-600' :
                        'bg-amber-50 text-amber-700'
                      }`}>
                        {r.status === 'Complete' && <CheckCircle2 className="w-3 h-3" />}
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {r.status === 'Pending' && (
                          <>
                            <button 
                              className="p-1.5 text-[#0A856C] hover:bg-[#0A856C]/10 rounded-lg transition-colors cursor-pointer" 
                              onClick={() => updateStatus(r.id, "Complete")} 
                              title="Mark Complete"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button 
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer" 
                              onClick={() => updateStatus(r.id, "Incomplete")} 
                              title="Mark Incomplete (No-Show)"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button 
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer" 
                          onClick={() => deleteRegistration(r.id)} 
                          title="Delete Record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {registrations.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 px-4 text-center text-slate-400 text-sm">
                    No shift declarations found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

