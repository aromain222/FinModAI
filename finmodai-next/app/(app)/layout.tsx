/**
 * App Layout (Authenticated Routes)
 *
 * Includes sidebar, top bar, and app shell.
 * Requires authentication or guest mode - redirects to /login if neither exists.
 */

import { ConsoleShell } from '@/components/ConsoleShell';
import { GuestModeGate } from '@/components/auth/GuestModeGate';
import { ModelAssumptionsProvider } from '@/lib/modelAssumptionsStore';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Use client-side gate to check for session or guest mode
  // This allows guest mode to work (which is stored in localStorage, client-side only)
  return (
    <GuestModeGate>
      <ModelAssumptionsProvider>
        <ConsoleShell>{children}</ConsoleShell>
      </ModelAssumptionsProvider>
    </GuestModeGate>
  );
}
