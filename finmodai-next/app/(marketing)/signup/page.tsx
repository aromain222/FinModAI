/**
 * Signup Page (Marketing Route)
 * 
 * If user is already authenticated, redirect to /app.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/lib/supabaseClient';
import { AuthPage } from '@/components/auth/AuthPage';

export default async function SignupPage() {
  // If already authenticated, redirect to app
  const supabase = createServerComponentClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect('/app');
  }

  return <AuthPage initialMode="signup" />;
}
