"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { APP_WORKSPACE_NAME } from "@/lib/branding";
import { ThemeToggle } from "@/components/ThemeToggle";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { DemoHealth } from "@/components/DemoHealth";

type DashboardTopbarProps = {
  userEmail?: string;
};

export function DashboardTopbar({ userEmail: propUserEmail }: DashboardTopbarProps) {
  const pathname = usePathname();
  const hideForModelDetail = /^\/models\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    pathname
  );
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [userEmail, setUserEmail] = useState(propUserEmail || "");
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (hideForModelDetail) return;
    // Get current user email from Supabase session (single source of truth)
    async function getUserEmail() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        setUserEmail(session.user.email);
      } else {
        // No session - should not happen as AuthGate redirects, but set empty string
        setUserEmail("");
      }
    }
    getUserEmail();
  }, [supabase, hideForModelDetail]);

  if (hideForModelDetail) return null;

  async function handleSwitchAccount() {
    setIsSigningOut(true);
    
    try {
      // Sign out from Supabase if authenticated
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.auth.signOut();
      }

      // Clear any cached auth state
      // (No guest mode to clear)

      // Clear any cached user data
      // (Add any other cleanup here if needed)

      // Redirect to /auth
      router.replace('/auth');
    } catch (error) {
      console.error('[DashboardTopbar] Error signing out:', error);
      // Still redirect to /auth even if sign out fails
      router.replace('/auth');
    } finally {
      setIsSigningOut(false);
    }
  }

  const initials = userEmail.slice(0, 2).toUpperCase();

  return (
    <header className="flex items-center justify-between border-b border-[var(--cb-border)] bg-[var(--cb-surface)] px-6 py-4 text-[var(--cb-text-body)] shadow-panel transition-colors">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">Workspace</p>
        <h1 className="text-2xl font-semibold text-[var(--cb-text-primary)]">{APP_WORKSPACE_NAME}</h1>
      </div>
      <div className="flex items-center gap-4">
        <DemoHealth />
        <ThemeToggle />
        <div className="hidden text-right sm:block">
          <p className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">Signed in as</p>
          <p className="text-sm font-medium text-[var(--cb-text-primary)]">{userEmail || "Loading..."}</p>
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
