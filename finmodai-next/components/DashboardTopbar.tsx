"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { APP_WORKSPACE_NAME } from "@/lib/branding";
import { ThemeToggle } from "@/components/ThemeToggle";

export function DashboardTopbar() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sign-out' }),
      });
    } catch {
      // best-effort
    }
    router.replace('/login');
  }

  return (
    <header className="flex items-center justify-between gap-2 border-b border-[var(--cb-border)] bg-[var(--cb-surface)] px-4 py-3 text-[var(--cb-text-body)] shadow-panel transition-colors sm:px-6 sm:py-4">
      <div className="flex items-center gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">Workspace</p>
          <h1 className="text-lg font-semibold leading-tight text-[var(--cb-text-primary)] sm:text-2xl">{APP_WORKSPACE_NAME}</h1>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <ThemeToggle />
        <Avatar className="hidden sm:flex">
          <AvatarFallback className="bg-[var(--cb-green)]/10 text-sm font-semibold text-[var(--cb-green)]">
            CB
          </AvatarFallback>
        </Avatar>
        <Button
          onClick={handleSignOut}
          disabled={isSigningOut}
          variant="outline"
          className="border-[var(--cb-border)] bg-[var(--cb-surface)] px-2.5 text-[var(--cb-text-primary)] hover:bg-[var(--cb-surface-subtle)] disabled:opacity-50 sm:px-4"
        >
          {isSigningOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </header>
  );
}
