/**
 * Login Page (Marketing Route)
 * 
 * If user is already authenticated or in guest mode, redirect to /app.
 * Guest mode check is done client-side since it's stored in localStorage.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/lib/supabaseClient';
import { AuthPage } from '@/components/auth/AuthPage';
import { LoginPageClient } from '@/components/auth/LoginPageClient';

export default async function LoginPage() {
  // If already authenticated, redirect to app
  const supabase = createServerComponentClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect('/app');
  }

  // Guest mode check is done client-side (localStorage)
  // Render client component that will check and redirect if needed
  return <LoginPageClient><AuthPage initialMode="login" /></LoginPageClient>;
}
