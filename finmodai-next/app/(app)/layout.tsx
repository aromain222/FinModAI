/**
 * App Layout (Authenticated Routes)
 * 
 * Includes sidebar, top bar, and app shell.
 * Requires authentication - redirects to /auth if no session exists.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { ConsoleShell } from '@/components/ConsoleShell';
import { AuthGate } from '@/components/auth/AuthGate';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Use client-side gate to check for Supabase session
  return (
    <AuthGate>
      <ConsoleShell>{children}</ConsoleShell>
    </AuthGate>
  );
}
