import { useEffect, useState } from "react"
import { collection, doc, onSnapshot, query, where } from "firebase/firestore"
import { db } from "../lib/firebase"
import type { ManualHour, Posting, Registration } from "../types"

interface Activity {
  familyId: string | null
  registrations: Registration[]
  postings: Record<string, Posting>
  manualHours: ManualHour[]
  loading: boolean
  error: string | null
}

function emptyActivity(familyId: string | null): Activity {
  return { familyId, registrations: [], postings: {}, manualHours: [], loading: !!familyId, error: null }
}

export function useFamilyActivity(familyId: string | null) {
  const [activity, setActivity] = useState<Activity>(() => emptyActivity(familyId))
  useEffect(() => {
    if (!familyId) return
    let active = true
    let registrationsReady = false
    let manualReady = false
    const posts = new Map<string, Posting>()
    const subscriptions = new Map<string, () => void>()
    const pendingPosts = new Set<string>()
    let registrations: Registration[] = []
    let manualHours: ManualHour[] = []
    let error: string | null = null
    const publish = () => {
      if (active) setActivity({ familyId, registrations, manualHours, postings: Object.fromEntries(posts),
        loading: !error && (!registrationsReady || !manualReady || pendingPosts.size > 0), error })
    }
    const fail = (cause: Error) => { error = cause.message; publish() }
    const unsubRegs = onSnapshot(query(collection(db, "registrations"), where("familyId", "==", familyId)), snapshot => {
      registrations = snapshot.docs.map(entry => ({ ...entry.data(), id: entry.id } as Registration))
      registrationsReady = true
      const ids = new Set(registrations.map(reg => reg.postingId))
      for (const [id, unsubscribe] of subscriptions) {
        if (!ids.has(id)) { unsubscribe(); subscriptions.delete(id); posts.delete(id); pendingPosts.delete(id) }
      }
      for (const id of ids) {
        if (subscriptions.has(id)) continue
        pendingPosts.add(id)
        subscriptions.set(id, onSnapshot(doc(db, "postings", id), snapshot => {
          if (!active || !subscriptions.has(id)) return
          if (snapshot.exists()) posts.set(id, { ...snapshot.data(), id: snapshot.id } as Posting)
          else posts.delete(id)
          pendingPosts.delete(id)
          publish()
        }, fail))
      }
      publish()
    }, fail)
    const unsubManual = onSnapshot(query(collection(db, "manual_hours"), where("familyId", "==", familyId)), snapshot => {
      manualHours = snapshot.docs.map(entry => ({ ...entry.data(), id: entry.id } as ManualHour))
      manualReady = true
      publish()
    }, fail)
    return () => { active = false; unsubRegs(); unsubManual(); subscriptions.forEach(unsubscribe => unsubscribe()) }
  }, [familyId])
  return activity.familyId === familyId ? activity : emptyActivity(familyId)
}
