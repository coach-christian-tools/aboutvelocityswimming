import { createContext, useContext } from "react"
import type { User } from "firebase/auth"

interface AuthContextType {
  user: User | null
  isAdmin: boolean
  familyId: string | null
  loading: boolean
  logout: () => Promise<void>
  clientMode: boolean
  setClientMode: (mode: boolean) => void
  previewFamilyId: string | null
  setPreviewFamilyId: (id: string | null) => void
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  familyId: null,
  loading: true,
  logout: async () => {},
  clientMode: false,
  setClientMode: () => {},
  previewFamilyId: null,
  setPreviewFamilyId: () => {},
})

export const useAuth = () => useContext(AuthContext)
