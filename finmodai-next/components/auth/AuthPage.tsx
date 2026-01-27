"use client";

import { useEffect, useState } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { SignupForm } from "@/components/auth/SignupForm";

type AuthMode = "login" | "signup";

export interface AuthPageProps {
  initialMode?: AuthMode;
}

export function AuthPage({ initialMode = "login" }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const isLogin = mode === "login";

  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-neutral-950 to-black px-4 py-12 text-neutral-100">
      <div className="mx-auto w-full max-w-5xl rounded-3xl border border-neutral-800 bg-neutral-900/70 backdrop-blur-xl shadow-2xl">
        <div className="grid gap-10 p-8 md:grid-cols-2 md:p-12">
          <div className="space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">
              CAPITALBASE
            </p>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold leading-tight text-neutral-50 md:text-4xl">
                Build institutional-grade models in minutes
              </h1>
              <p className="text-sm text-neutral-400">
                Generate, stress test, and export valuation workbooks with a single streamlined workspace.
              </p>
            </div>
            <ul className="space-y-2 text-sm text-neutral-300">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                <span>Generate DCF, LBO, and 3-statement models in minutes.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                <span>Stress test scenarios instantly with built-in assumptions.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                <span>Export clean Excel workbooks ready for client delivery.</span>
              </li>
            </ul>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">
                  {isLogin ? "Sign in" : "Create account"}
                </p>
                <h2 className="text-2xl font-semibold text-neutral-50">
                  {isLogin ? "Welcome back" : "Join CapitalBase"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setMode(isLogin ? "signup" : "login")}
                className="text-sm font-semibold text-emerald-300 hover:text-emerald-200"
              >
                {isLogin ? "Create account" : "Sign in"}
              </button>
            </div>

            {isLogin ? (
              <LoginForm onSwitchMode={() => setMode("signup")} />
            ) : (
              <SignupForm
                onSignUpComplete={() => setMode("login")}
                onSwitchMode={() => setMode("login")}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
