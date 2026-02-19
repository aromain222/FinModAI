"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { SignupForm } from "@/components/auth/SignupForm";
import { isDemoMode } from "@/lib/demo/isDemoMode";

type AuthMode = "login" | "signup" | "guest";

export interface AuthPageProps {
  initialMode?: AuthMode;
}

export function AuthPage({ initialMode = "login" }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const router = useRouter();
  const searchParams = useSearchParams();
  const demoMode = isDemoMode(searchParams);
  const [demoUpdatedAt, setDemoUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (!demoMode) return;
    let active = true;
    fetch('/api/demo/last-updated')
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data?.lastUpdated) {
          setDemoUpdatedAt(data.lastUpdated);
        }
      })
      .catch(() => {
        if (active) setDemoUpdatedAt(null);
      });
    return () => {
      active = false;
    };
  }, [demoMode]);

  const options = useMemo<
    { id: AuthMode; label: string; emphasis?: "default" | "outline" }[]
  >(
    () => [
      { id: "login", label: "Log in" },
      { id: "signup", label: "Sign up" },
      { id: "guest", label: "Continue as guest", emphasis: "outline" },
    ],
    []
  );

  const handleContinueAsGuest = () => {
    // Set guest mode flag in localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('cb_guest', '1');
    }
    router.push("/app");
  };

  return (
    <main className="min-h-screen bg-cb-ink flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-cb-line bg-cb-soft/95 p-8 shadow-2xl">
        <div className="mb-6 text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-cb-gold font-semibold">
            CAPITALBASE
          </p>
          <h1 className="text-3xl font-semibold text-cb-ink">Welcome back</h1>
          <p className="text-sm text-cb-slate">
            Access your analyst workspace, create an account, or jump straight
            into the product as a guest.
          </p>
          {demoMode && (
            <div className="mt-4 rounded-lg border border-cb-line bg-white/80 px-3 py-2 text-xs text-cb-slate">
              <span className="font-semibold text-cb-ink">Demo Environment</span> — curated company data.
              {demoUpdatedAt && (
                <span className="block text-[0.7rem] text-cb-slate mt-1">
                  Last updated: {new Date(demoUpdatedAt).toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="mb-6 grid grid-cols-3 gap-2">
          {options.map((option) => {
            const isActive = mode === option.id;
            const baseClasses =
              "rounded-full py-2 text-sm font-medium transition border";
            const activeClasses =
              option.id === "guest"
                ? "bg-cb-soft text-cb-ink border-cb-line shadow-sm"
                : "bg-white text-cb-ink border-transparent shadow-sm";
            const inactiveClasses =
              option.emphasis === "outline"
                ? "bg-transparent text-cb-slate border-dashed border-cb-line hover:text-cb-ink"
                : "bg-transparent text-cb-slate border-cb-line hover:text-cb-ink";

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setMode(option.id)}
                className={`${baseClasses} ${
                  isActive ? activeClasses : inactiveClasses
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {mode === "login" && <LoginForm />}
        {mode === "signup" && (
          <SignupForm onSignUpComplete={() => setMode("login")} />
        )}
        {mode === "guest" && (
          <div className="space-y-4 rounded-xl border border-cb-line bg-white/80 p-5 text-left shadow-inner">
            <p className="text-sm text-cb-ink">
              Explore CapitalBase without creating an account. You can build
              sample models and upgrade later to save your work.
            </p>
            <button
              type="button"
              onClick={handleContinueAsGuest}
              className="w-full rounded-lg bg-cb-blue py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              Continue as guest
            </button>
            <p className="text-xs text-cb-slate">
              We will create a temporary, local session. Sign up anytime to save
              and sync your projects.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
