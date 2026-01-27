/**
 * Auth Page (Marketing Route)
 * 
 * Unified entry point for authentication.
 * Shows sign-in and sign-up options.
 * Always accessible - no auth required.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/lib/supabaseClient';
import { AuthPage } from '@/components/auth/AuthPage';
import { AuthPageClient } from '@/components/auth/AuthPageClient';

export default async function AuthPageRoute() {
  // If already authenticated, redirect to app
  const supabase = createServerComponentClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect('/app');
  }

  // Render client component that will check and redirect if needed
  return <AuthPageClient><AuthPage initialMode="login" /></AuthPageClient>;
}

