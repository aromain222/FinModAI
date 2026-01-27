"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

/**
 * Auth Gate - Client-side component to check for Supabase session
 * 
 * Only allows access if a valid Supabase session exists.
 * If no session, redirects to /auth.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [isChecking, setIsChecking] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      try {
        // Check for Supabase session only (single source of truth)
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          // User is authenticated
          setHasAccess(true);
          setIsChecking(false);
          return;
        }

        // No session - redirect to /auth
        router.replace('/auth');
      } catch (error) {
        console.error('[AuthGate] Error checking access:', error);
        router.replace('/auth');
      } finally {
        setIsChecking(false);
      }
    }

    checkAccess();
  }, [router, supabase]);

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







