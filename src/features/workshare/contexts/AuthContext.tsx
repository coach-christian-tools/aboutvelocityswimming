"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@/lib/auth";
import { onAuthStateChanged, signOut } from "@/lib/auth";
import { AuthContext } from "./auth";
import { auth } from "../lib/backend";
import { findFamilyMembership } from "../lib/family-membership";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientMode, setClientMode] = useState(false);
  const [previewFamilyId, setPreviewFamilyId] = useState<string | null>(null);

  useEffect(() => {
    let generation = 0;
    let activeIdentity: string | null = null;
    let initialized = false;
    const unsubscribe = onAuthStateChanged(auth, async (accountUser) => {
      const currentGeneration = ++generation;
      const identity = accountUser
        ? JSON.stringify([
            accountUser.uid,
            accountUser.email?.trim().toLowerCase(),
            accountUser.emailVerified,
            accountUser.staff,
          ])
        : null;
      if (!initialized || identity !== activeIdentity) {
        initialized = true;
        activeIdentity = identity;
        setLoading(true);
        setIsAdmin(false);
        setFamilyId(null);
        setClientMode(false);
        setPreviewFamilyId(null);
      }
      setUser(accountUser);

      if (accountUser) {
        try {
          const foundFamilyId = await findFamilyMembership(accountUser);

          if (currentGeneration !== generation) return;
          setIsAdmin(accountUser.staff);
          setFamilyId(foundFamilyId);
        } catch (error) {
          if (currentGeneration !== generation) return;
          console.error("Error fetching family membership:", error);
          setIsAdmin(accountUser.staff);
          setFamilyId(null);
        }
      } else {
        setIsAdmin(false);
        setFamilyId(null);
      }
      if (currentGeneration === generation) setLoading(false);
    });

    return () => {
      generation++;
      unsubscribe();
    };
  }, []);

  const logout = async () => {
    await signOut(auth);
  };

  const effectiveFamilyId =
    clientMode && previewFamilyId ? previewFamilyId : familyId;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin,
        familyId: effectiveFamilyId,
        loading,
        logout,
        clientMode,
        setClientMode,
        previewFamilyId,
        setPreviewFamilyId,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
