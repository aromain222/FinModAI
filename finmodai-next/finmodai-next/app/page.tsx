import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/lib/supabaseClient';
import MarketingPage from './(marketing)/page';

// Root route: if authenticated, redirect to /app, otherwise show marketing page
export default async function RootPage() {
  const supabase = createServerComponentClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect('/app');
  }

  return <MarketingPage />;
}
