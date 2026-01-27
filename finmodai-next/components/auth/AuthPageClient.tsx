"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

/**
 * Auth Page Client Component
 * 
 * Only redirects away from /auth if user is truly authenticated (has Supabase session).
 */
export function AuthPageClient({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        // Only check for Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          // User is truly authenticated, redirect to app
          console.log('[AuthPageClient] User authenticated, redirecting to /app');
          router.replace('/app');
        } else {
          // No session - stay on auth page
          console.log('[AuthPageClient] No session, staying on auth page');
        }
      } catch (error) {
        console.error('[AuthPageClient] Error checking auth:', error);
        // On error, stay on auth page
      } finally {
        setIsChecking(false);
      }
    }

    checkAuth();
  }, [router, supabase]);

  // Show loading state while checking (prevents flash of auth form)
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

  return <>{children}</>;
}

