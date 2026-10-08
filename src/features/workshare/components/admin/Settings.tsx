import { useEffect, useState } from "react"
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore"
import { db } from "../../lib/firebase"
import type { WorkDescription } from "../../types"
import { Button } from "../ui/Button"
import { Card } from "../ui/Card"
import { Input } from "../ui/Input"
import { Trash2, Edit2, Check, Plus, Settings as SettingsIcon, X } from "lucide-react"

export function Settings() {
  const [descriptions, setDescriptions] = useState<WorkDescription[]>([])
  const [loading, setLoading] = useState(true)

  const [newDesc, setNewDesc] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState("")

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "work_descriptions"), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WorkDescription))
      setDescriptions(data.sort((a, b) => a.text.localeCompare(b.text)))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDesc.trim()) return
    
    // Check for duplicates
    if (descriptions.some(d => d.text.toLowerCase() === newDesc.trim().toLowerCase())) {
      alert("This description already exists.")
      return
    }

    try {
      await addDoc(collection(db, "work_descriptions"), {
        text: newDesc.trim()
      })
      setNewDesc("")
    } catch (err) {
      console.error(err)
      alert("Failed to add description")
    }
  }

  const startEdit = (desc: WorkDescription) => {
    setEditingId(desc.id)
    setEditVal(desc.text)
  }

  const saveEdit = async (id: string) => {
    if (!editVal.trim()) return
    try {
      await updateDoc(doc(db, "work_descriptions", id), {
        text: editVal.trim()
      })
      setEditingId(null)
      setEditVal("")
    } catch (err) {
      console.error(err)
      alert("Failed to update description")
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this work description?")) {
      try {
        await deleteDoc(doc(db, "work_descriptions", id))
      } catch (err) {
        console.error(err)
        alert("Failed to delete description")
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
        Loading settings...
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
        <SettingsIcon className="w-8 h-8 text-[#0A856C]" />
        <div>
          <h1 className="text-2xl font-extrabold text-[#13415D] tracking-tight">Admin Settings</h1>
          <p className="text-sm text-slate-500">Manage portal configurations and preset options.</p>
        </div>
      </div>

      <Card className="p-6 border border-slate-200 bg-white">
        <div className="mb-6">
          <h2 className="text-lg font-bold text-[#13415D] mb-1">Work Descriptions</h2>
          <p className="text-xs text-slate-500">
            These are the predefined options that appear in the &quot;Description of Work&quot; autocomplete when assigning manual hours.
          </p>
        </div>

        <form onSubmit={handleAdd} className="flex gap-2 mb-6">
          <Input
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Add new description (e.g., Timing System Setup)"
            className="flex-1"
          />
          <Button type="submit" disabled={!newDesc.trim()} variant="primary">
            <Plus className="w-4 h-4 mr-1.5" />
            Add
          </Button>
        </form>

        {descriptions.length === 0 ? (
          <div className="py-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
            No work descriptions found.
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
            {descriptions.map((desc) => (
              <div key={desc.id} className="flex items-center justify-between p-3 bg-white hover:bg-slate-50 transition-colors">
                {editingId === desc.id ? (
                  <div className="flex-1 flex items-center gap-2 mr-4">
                    <Input
                      autoFocus
                      value={editVal}
                      onChange={e => setEditVal(e.target.value)}
                      className="h-9 text-sm"
                      onKeyDown={e => {
                        if (e.key === "Enter") saveEdit(desc.id)
                        if (e.key === "Escape") setEditingId(null)
                      }}
                    />
                    <Button type="button" onClick={() => saveEdit(desc.id)} size="sm" variant="primary" className="h-9 px-3">
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button type="button" onClick={() => setEditingId(null)} size="sm" variant="outline" className="h-9 px-3">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="text-sm text-[#13415D] font-medium pl-2">
                    {desc.text}
                  </div>
                )}

                {editingId !== desc.id && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(desc)}
                      className="p-2 text-slate-400 hover:text-[#0A856C] hover:bg-[#0A856C]/10 rounded-lg transition-colors"
                      title="Edit description"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(desc.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete description"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
