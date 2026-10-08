"use client";


import { swimResourcesAsset, swimResourcesPath } from '../../../../../features/swim-resources/lib/routes.ts';
import { auth, googleProvider } from '@/features/swim-resources/lib/firebase';
import { getRedirectResult, onAuthStateChanged, signInWithPopup } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        if (user.email?.endsWith('@velocity-swimming.com')) {
          router.push(swimResourcesPath("/attendance/admin"));
        } else {
          setAuthError('Unauthorized: You must use a @velocity-swimming.com email address.');
          setLoading(false);
        }
      } else {
        // If no user is currently signed in, check if we just returned from a redirect
        getRedirectResult(auth)
          .then((result) => {
            if (result) {
              if (result.user.email?.endsWith('@velocity-swimming.com')) {
                router.push(swimResourcesPath("/attendance/admin"));
              } else {
                setAuthError('Unauthorized: You must use a @velocity-swimming.com email address.');
              }
            }
            setLoading(false);
          })
          .catch((err) => {
            console.error('Redirect sign-in error:', err);
            setAuthError('Failed to sign in. Please try again.');
            setLoading(false);
          });
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleAdminLogin = async () => {
    try {
      setAuthError(null);
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      
      if (isMobile) {
        // We'll try popup first even on mobile, as it's more reliable in modern browsers
        // and doesn't lose state as often.
        const result = await signInWithPopup(auth, googleProvider);
        if (result.user.email?.endsWith('@velocity-swimming.com')) {
          router.push(swimResourcesPath("/attendance/admin"));
        } else {
          setAuthError('Unauthorized: You must use a @velocity-swimming.com email address.');
        }
      } else {
        // Desktop can safely use popup
        const result = await signInWithPopup(auth, googleProvider);
        if (result.user.email?.endsWith('@velocity-swimming.com')) {
          router.push(swimResourcesPath("/attendance/admin"));
        } else {
          setAuthError('Unauthorized: You must use a @velocity-swimming.com email address.');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      setAuthError('Failed to sign in. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-bg p-4">
        <div className="bg-surface rounded-xl shadow-md p-8 w-full max-w-[400px] text-center border border-border">
          <p className="text-text-secondary">Checking authentication...</p>
        </div>
      </div>
    );
  }

  const isWrongEmail = auth.currentUser && !auth.currentUser.email?.endsWith('@velocity-swimming.com');

  return (
    <div className="flex justify-center items-center h-screen bg-bg p-4">
      <div className="bg-surface rounded-xl shadow-md p-8 w-full max-w-[400px] text-center border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={swimResourcesAsset("/team-banner.png")}
          alt="Velocity Swimming"
          className="w-full max-w-[300px] mb-6 rounded-lg mx-auto"
        />

        {isWrongEmail ? (
          <>
            <p className="text-text-secondary mb-4">
              Authentication Error
            </p>
            <p className="text-absent mb-8 font-medium">
              Unauthorized: You must use a @velocity-swimming.com email address.
            </p>
            <button
              className="w-full py-3 px-4 border-none rounded-lg text-white font-medium cursor-pointer transition-colors active:scale-95 bg-text-secondary text-base"
              onClick={() => auth.signOut()}
            >
              Log Out
            </button>
          </>
        ) : (
          <>
            <p className="text-text-secondary mb-8">
              Sign in to take attendance.
            </p>

            {authError && (
              <p className="text-absent mb-4">
                {authError}
              </p>
            )}

            <button
              className="w-full py-3 px-4 border-none rounded-lg text-white font-medium cursor-pointer transition-colors active:scale-95 bg-primary-blue hover:bg-primary-blue/90 text-base"
              onClick={handleAdminLogin}
            >
              Sign In
            </button>
          </>
        )}
      </div>
    </div>
  );
}
