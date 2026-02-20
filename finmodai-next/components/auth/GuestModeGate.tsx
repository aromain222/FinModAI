"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

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
    async function checkAccess() {
      try {
        const supabase = createClientComponentClient();
        // Check for Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        console.log('[GuestModeGate] Session:', session ? 'exists' : 'none');
        
        if (session) {
          // User is authenticated
          console.log('[GuestModeGate] User authenticated, allowing access');
          setHasAccess(true);
          setIsChecking(false);
          return;
        }

        // Check for guest mode
        if (typeof window !== 'undefined') {
          const isGuest = localStorage.getItem('cb_guest') === '1';
          console.log('[GuestModeGate] Guest mode:', isGuest ? 'enabled' : 'disabled');
          
          if (isGuest) {
            // Guest mode enabled
            console.log('[GuestModeGate] Guest mode enabled, allowing access');
            setHasAccess(true);
            setIsChecking(false);
            return;
          }
        }

        // No session and no guest mode - redirect to login
        console.log('[GuestModeGate] No session and no guest mode, redirecting to /login');
        router.replace('/login');
      } catch (error) {
        console.error('[GuestModeGate] Error checking access:', error);
        router.replace('/login');
      } finally {
        setIsChecking(false);
      }
    }

    checkAccess();
  }, [router]);

  if (isChecking) {
    // Show loading state while checking
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
    // Redirecting - show nothing
    return null;
  }

  return <>{children}</>;
}
