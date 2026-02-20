'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

/**
 * Wraps signup content and redirects to /app if user already has a session.
 * Client-side only so the server never runs Supabase auth on this route.
 */
export function SignupAuthRedirect({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const supabase = createClientComponentClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!cancelled && session) {
          router.replace('/app');
          return;
        }
      } catch {
        // No session or error: show signup form
      }
      if (!cancelled) setReady(true);
    }
    check();
    return () => { cancelled = true; };
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--cb-background)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--cb-green)]" />
      </div>
    );
  }

  return <>{children}</>;
}
