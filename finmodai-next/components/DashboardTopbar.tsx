"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { APP_WORKSPACE_NAME } from "@/lib/branding";
import { ThemeToggle } from "@/components/ThemeToggle";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type DashboardTopbarProps = {
  userEmail?: string;
};

export function DashboardTopbar({ userEmail: propUserEmail }: DashboardTopbarProps) {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState(propUserEmail || "guest@capitalbase.app");
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    async function getUserEmail() {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        setUserEmail(session.user.email);
      } else {
        // Check if guest mode
        const isGuest = typeof window !== 'undefined' && localStorage.getItem('cb_guest') === '1';
        setUserEmail(isGuest ? "guest@capitalbase.app" : "guest@capitalbase.app");
      }
    }
    getUserEmail();
  }, []);

  async function handleSwitchAccount() {
    setIsSigningOut(true);
    const supabase = createClientComponentClient();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.auth.signOut();
      }

      // Clear guest mode
      if (typeof window !== 'undefined') {
        localStorage.removeItem('cb_guest');
        sessionStorage.removeItem('cb_app_access');
      }

      // Clear any cached user data
      // (Add any other cleanup here if needed)

      // Redirect to login
      router.replace('/login');
    } catch (error) {
      console.error('[DashboardTopbar] Error signing out:', error);
      // Still redirect to login even if sign out fails
      router.replace('/login');
    } finally {
      setIsSigningOut(false);
    }
  }

  const initials = userEmail.slice(0, 2).toUpperCase();

  return (
    <header className="flex items-center justify-between border-b border-[var(--cb-border)] bg-[var(--cb-surface)] px-6 py-4 text-[var(--cb-text-body)] shadow-panel transition-colors">
      <div className="flex items-center gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">Workspace</p>
          <h1 className="text-2xl font-semibold text-[var(--cb-text-primary)]">{APP_WORKSPACE_NAME}</h1>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <ThemeToggle />
        <div className="hidden text-right sm:block">
          <p className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">Signed in as</p>
          <p className="text-sm font-medium text-[var(--cb-text-primary)]">{userEmail || "Guest"}</p>
        </div>
        <Avatar>
          <AvatarFallback className="bg-[var(--cb-green)]/10 text-sm font-semibold text-[var(--cb-green)]">
            {initials}
          </AvatarFallback>
        </Avatar>
        <Button
          onClick={handleSwitchAccount}
          disabled={isSigningOut}
          variant="outline"
          className="border-[var(--cb-border)] bg-[var(--cb-surface)] text-[var(--cb-text-primary)] hover:bg-[var(--cb-surface-subtle)] disabled:opacity-50"
        >
          {isSigningOut ? "Signing out..." : "Switch account"}
        </Button>
      </div>
    </header>
  );
}
