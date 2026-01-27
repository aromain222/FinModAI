"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type LoginFormProps = {
  onSwitchMode?: () => void;
};

export function LoginForm({ onSwitchMode }: LoginFormProps) {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setLoading(true);

    const trimmedEmail = email.trim();

    if (!trimmedEmail || password.length < 8) {
      setError("Please enter a valid email and password (8+ characters).");
      setLoading(false);
      return;
    }

    try {
      console.log("[AUTH] Login attempt for", trimmedEmail);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (signInError) {
        console.error("[AUTH] Login failed", signInError);
        setError(signInError.message);
        return;
      }

      console.log("[AUTH] Login success");
      router.push("/app");
    } catch (err: any) {
      console.error("[AUTH] Login failed", err);
      setError(err?.message ?? "Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="login-email" className="text-sm font-medium text-neutral-200">
          Email
        </Label>
        <Input
          id="login-email"
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
        <Label htmlFor="login-password" className="text-sm font-medium text-neutral-200">
          Password
        </Label>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
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

      <div className="flex items-center justify-between text-xs text-neutral-400">
        <a
          href="/auth/reset"
          className="font-semibold text-emerald-300 hover:text-emerald-200"
        >
          Forgot password?
        </a>
        <button
          type="button"
          onClick={() => onSwitchMode?.()}
          className="font-semibold text-emerald-300 hover:text-emerald-200"
        >
          Create account
        </button>
      </div>

      <Button
        type="submit"
        className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-400"
        disabled={loading}
      >
        {loading ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
