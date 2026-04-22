"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const ACCESS_CACHE_KEY = 'cb_app_access';

function readCachedAccess(): 'authorized' | 'unknown' {
  if (typeof window === 'undefined') return 'unknown';
  if (sessionStorage.getItem(ACCESS_CACHE_KEY) === '1') return 'authorized';
  if (localStorage.getItem('cb_guest') === '1') {
    sessionStorage.setItem(ACCESS_CACHE_KEY, '1');
    return 'authorized';
  }
  return 'unknown';
}

/**
 * Guest Mode Gate - Client-side component to check for guest mode
 * 
 * Supabase client is created only inside useEffect so it never runs on the server
 * (avoids "Application error: a server-side exception" on Vercel).
 */
export function GuestModeGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const cachedAccess = readCachedAccess();
    if (cachedAccess === 'authorized') {
      setHasAccess(true);
      setIsChecking(false);
    }

    async function checkAccess() {
      try {
        const supabase = createClientComponentClient();
        // Check for Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          if (typeof window !== 'undefined') {
            sessionStorage.setItem(ACCESS_CACHE_KEY, '1');
          }
          if (cancelled) return;
          setHasAccess(true);
          setIsChecking(false);
          return;
        }

        if (typeof window !== 'undefined') {
          const isGuest = localStorage.getItem('cb_guest') === '1';
          
          if (isGuest) {
            sessionStorage.setItem(ACCESS_CACHE_KEY, '1');
            if (cancelled) return;
            setHasAccess(true);
            setIsChecking(false);
            return;
          }
          sessionStorage.removeItem(ACCESS_CACHE_KEY);
        }

        if (cancelled) return;
        router.replace('/login');
      } catch (error) {
        console.error('[GuestModeGate] Error checking access:', error);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(ACCESS_CACHE_KEY);
        }
        if (cancelled) return;
        router.replace('/login');
      } finally {
        if (cancelled) return;
        setIsChecking(false);
      }
    }

    checkAccess();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--cb-background)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--cb-green)] mx-auto mb-4"></div>
          <p className="text-sm text-[var(--cb-text-muted)]">Loading...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return <>{children}</>;
}
