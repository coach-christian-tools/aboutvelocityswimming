"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@/lib/auth";
import { onAuthStateChanged, signOut } from "@/lib/auth";
import { collection, query, where, getDocs } from "@/lib/data";
import { AuthContext } from "./auth";
import { auth, db } from "../lib/backend";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientMode, setClientMode] = useState(false);
  const [previewFamilyId, setPreviewFamilyId] = useState<string | null>(null);

  useEffect(() => {
    let generation = 0;
    const unsubscribe = onAuthStateChanged(auth, async (accountUser) => {
      const currentGeneration = ++generation;
      setLoading(true);
      setIsAdmin(false);
      setFamilyId(null);
      setClientMode(false);
      setPreviewFamilyId(null);
      setUser(accountUser);

      if (accountUser) {
        try {
          const isAdminUser = accountUser.staff;
          const userEmail = accountUser.email?.toLowerCase().trim() || "";

          let foundFamilyId = null;
          const familiesRef = collection(db, "families");

          if (accountUser.email && accountUser.emailVerified) {
            const q = query(
              familiesRef,
              where("authorizedEmails", "array-contains", accountUser.email),
            );
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
              foundFamilyId = snapshot.docs[0].id;
            } else {
              const qLower = query(
                familiesRef,
                where("authorizedEmails", "array-contains", userEmail),
              );
              const snapshotLower = await getDocs(qLower);
              if (!snapshotLower.empty) {
                foundFamilyId = snapshotLower.docs[0].id;
              }
            }
          }

          if (currentGeneration !== generation) return;
          setIsAdmin(isAdminUser);
          setFamilyId(foundFamilyId);
        } catch (error) {
          if (currentGeneration !== generation) return;
          console.error("Error fetching user roles:", error);
          setIsAdmin(false);
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
