import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import type { User } from "firebase/auth"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore"
import { AuthContext } from "./auth"
import { auth, db } from "../lib/firebase"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [clientMode, setClientMode] = useState(false)
  const [previewFamilyId, setPreviewFamilyId] = useState<string | null>(null)

  useEffect(() => {
    let generation = 0
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const currentGeneration = ++generation
      setLoading(true)
      setIsAdmin(false)
      setFamilyId(null)
      setClientMode(false)
      setPreviewFamilyId(null)
      setUser(firebaseUser)

      if (firebaseUser) {
        try {
          let isAdminUser = false
          const userEmail = firebaseUser.email?.toLowerCase().trim() || ""
          const isVelocityAdmin = firebaseUser.emailVerified && userEmail.endsWith("@velocity-swimming.com")

          if (isVelocityAdmin) {
            isAdminUser = true
          } else {
            try {
              const adminDoc = await getDoc(doc(db, "admins", firebaseUser.uid))
              if (adminDoc.exists()) {
                isAdminUser = true
              }
            } catch {
              // Ignore if admins collection lookup fails
            }
          }

          let foundFamilyId = null
          const familiesRef = collection(db, "families")

          if (firebaseUser.email && firebaseUser.emailVerified) {
            const q = query(familiesRef, where("authorizedEmails", "array-contains", firebaseUser.email))
            const snapshot = await getDocs(q)
            if (!snapshot.empty) {
              foundFamilyId = snapshot.docs[0].id
            } else {
              const qLower = query(familiesRef, where("authorizedEmails", "array-contains", userEmail))
              const snapshotLower = await getDocs(qLower)
              if (!snapshotLower.empty) {
                foundFamilyId = snapshotLower.docs[0].id
              }
            }
          }

          if (currentGeneration !== generation) return
          setIsAdmin(isAdminUser)
          setFamilyId(foundFamilyId)
        } catch (error) {
          if (currentGeneration !== generation) return
          console.error("Error fetching user roles:", error)
          setIsAdmin(false)
          setFamilyId(null)
        }
      } else {
        setIsAdmin(false)
        setFamilyId(null)
      }
      if (currentGeneration === generation) setLoading(false)
    })

    return () => { generation++; unsubscribe() }
  }, [])

  const logout = async () => {
    await signOut(auth)
  }

  const effectiveFamilyId = (clientMode && previewFamilyId) ? previewFamilyId : familyId;

  return (
    <AuthContext.Provider value={{ user, isAdmin, familyId: effectiveFamilyId, loading, logout, clientMode, setClientMode, previewFamilyId, setPreviewFamilyId }}>
      {children}
    </AuthContext.Provider>
  )
}
