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
    <header className="flex items-center justify-between border-b border-[var(--cb-border)] bg-[var(--cb-surface)] px-6 py-4 text-[var(--cb-text-body)] shadow-panel transition-colors">
      <div className="flex items-center gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">Workspace</p>
          <h1 className="text-2xl font-semibold text-[var(--cb-text-primary)]">{APP_WORKSPACE_NAME}</h1>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <ThemeToggle />
        <Avatar>
          <AvatarFallback className="bg-[var(--cb-green)]/10 text-sm font-semibold text-[var(--cb-green)]">
            CB
          </AvatarFallback>
        </Avatar>
        <Button
          onClick={handleSignOut}
          disabled={isSigningOut}
          variant="outline"
          className="border-[var(--cb-border)] bg-[var(--cb-surface)] text-[var(--cb-text-primary)] hover:bg-[var(--cb-surface-subtle)] disabled:opacity-50"
        >
          {isSigningOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </header>
  );
}
