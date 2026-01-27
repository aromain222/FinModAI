"use client";

import { FormEvent, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

interface SignupFormProps {
  onSignUpComplete?: () => void;
  onSwitchMode?: () => void;
}

export function SignupForm({ onSignUpComplete, onSwitchMode }: SignupFormProps) {
  const supabase = createClientComponentClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setSuccess(null);
    setLoading(true);

    const trimmedEmail = email.trim();

    if (!trimmedEmail || password.length < 8) {
      setError("Please enter a valid email and password (8+ characters).");
      setLoading(false);
      return;
    }

    try {
      console.log("[AUTH] Signup attempt for", trimmedEmail);
      const { error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            full_name: fullName.trim() || null,
          },
        },
      });

      if (signUpError) {
        console.error("[AUTH] Signup failed", signUpError);
        setError(signUpError.message);
        return;
      }

      setSuccess("Account created. Check your email to confirm your address.");
      if (onSignUpComplete) {
        setTimeout(onSignUpComplete, 2000);
      }
    } catch (err: any) {
      console.error("[AUTH] Signup failed", err);
      setError(err?.message ?? "Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="signup-full-name" className="text-sm font-medium text-neutral-200">
          Full name (optional)
        </Label>
        <Input
          id="signup-full-name"
          name="fullName"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={loading}
          className="rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-100 placeholder:text-neutral-500 focus-visible:border-emerald-500/40 focus-visible:ring-2 focus-visible:ring-emerald-500/25"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-email" className="text-sm font-medium text-neutral-200">
          Email
        </Label>
        <Input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          required
          className="rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-100 placeholder:text-neutral-500 focus-visible:border-emerald-500/40 focus-visible:ring-2 focus-visible:ring-emerald-500/25"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-password" className="text-sm font-medium text-neutral-200">
          Password
        </Label>
        <Input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          required
          className="rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-100 placeholder:text-neutral-500 focus-visible:border-emerald-500/40 focus-visible:ring-2 focus-visible:ring-emerald-500/25"
        />
      </div>

      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}

      {success && (
        <p className="text-xs text-emerald-400" role="status">
          {success}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-neutral-400">
        <span>Have an account?</span>
        <button
          type="button"
          onClick={() => onSwitchMode?.()}
          className="font-semibold text-emerald-300 hover:text-emerald-200"
        >
          Sign in
        </button>
      </div>

      <Button
        type="submit"
        className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-400"
        disabled={loading}
      >
        {loading ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}
