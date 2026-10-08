'use client';


import { swimResourcesPath } from '../lib/routes.ts';
import ThemeToggle from '@/features/swim-resources/components/ThemeToggle';
import { auth, googleProvider } from '@/features/swim-resources/lib/firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AdminLoginFooter() {
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!cancelled) setUser(currentUser);
    });

    import('firebase/auth').then(({ getRedirectResult }) => {
      getRedirectResult(auth).then((result) => {
        if (cancelled) return;
        if (result) {
          if (result.user.email?.endsWith('@velocity-swimming.com')) {
            router.push(swimResourcesPath("/admin"));
          } else {
            signOut(auth);
            setError('Must be a Velocity staff email address');
          }
        }
      }).catch((err) => {
        if (cancelled) return;
        console.error("Redirect login failed", err);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router]);

  const handleAdminLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    setError(null);

    // If already signed in as a valid Velocity admin, bypass login prompt
    const activeUser = auth.currentUser || user;
    if (activeUser?.email?.endsWith('@velocity-swimming.com')) {
      router.push(swimResourcesPath("/admin"));
      return;
    }

    try {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        const { signInWithRedirect } = await import('firebase/auth');
        await signInWithRedirect(auth, googleProvider);
      } else {
        const result = await signInWithPopup(auth, googleProvider);
        if (result.user.email?.endsWith('@velocity-swimming.com')) {
          router.push(swimResourcesPath("/admin"));
        } else {
          await signOut(auth);
          setError('Must be a Velocity staff email address');
        }
      }
    } catch (err: unknown) {
      console.error("Login failed", err);
      const code = typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code: unknown }).code)
        : '';
      if (code === 'auth/popup-blocked') {
        setError('Allow popups for this site and try again.');
      } else if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        setError('Sign-in window was closed before finishing.');
      } else {
        setError('Sign-in failed. Please try again.');
      }
    }
  };

  return (
    <>
      {error && (
        <div className="fixed top-0 left-0 w-full bg-absent text-white text-center p-4 z-[1000] font-medium shadow-md">
          {error}
          <button onClick={() => setError(null)} className="absolute right-4 top-1/2 -translate-y-1/2 bg-transparent border-none text-white text-2xl cursor-pointer opacity-80 hover:opacity-100">&times;</button>
        </div>
      )}
      <footer className="mt-16 pt-8 pb-16 sm:pb-20 border-t border-border text-center text-text-secondary text-sm">
        <div className="flex justify-center mb-3">
          <ThemeToggle />
        </div>
        <p className="mb-2">Made by Coach Christian using Antigravity</p>
        <div className="pb-4">
          <a href="#" className="text-primary-blue hover:underline inline-block py-1" onClick={handleAdminLogin}>I am an Admin</a>
        </div>
      </footer>
    </>
  );
}
