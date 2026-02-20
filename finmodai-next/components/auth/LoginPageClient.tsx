"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

/**
 * Login Page Client Component
 * 
 * Only redirects away from /login if user is truly authenticated (has Supabase session).
 * Guest mode should NOT auto-redirect - user must explicitly click "Continue as guest".
 */
export function LoginPageClient({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const supabase = createClientComponentClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          // User is truly authenticated, redirect to app
          console.log('[LoginPageClient] User authenticated, redirecting to /app');
          router.replace('/app');
        } else {
          // No session - stay on login page
          console.log('[LoginPageClient] No session, staying on login page');
        }
      } catch (error) {
        console.error('[LoginPageClient] Error checking auth:', error);
        // On error, stay on login page
      } finally {
        setIsChecking(false);
      }
    }

    checkAuth();
  }, [router]);

  // Show loading state while checking (prevents flash of login form)
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
