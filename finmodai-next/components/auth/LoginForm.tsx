"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export function LoginForm() {
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
      const supabase = createClientComponentClient();
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
      <div className="space-y-1 text-left">
        <h2 className="text-xl font-semibold text-cb-ink">
          Log in to CapitalBase
        </h2>
        <p className="text-sm text-cb-slate">
          Enter your credentials to access your workspace.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="login-email" className="text-cb-ink font-medium">
          Email address
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
          className="bg-white text-cb-ink placeholder-cb-slate border border-cb-line focus-visible:ring-cb-blue focus-visible:border-cb-blue"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="login-password" className="text-cb-ink font-medium">
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
          className="bg-white text-cb-ink placeholder-cb-slate border border-cb-line focus-visible:ring-cb-blue focus-visible:border-cb-blue"
        />
      </div>

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        className="w-full rounded-lg bg-cb-blue text-white font-medium py-2.5 hover:bg-blue-500 transition"
        disabled={loading}
      >
        {loading ? "Logging in..." : "Log in"}
      </Button>
    </form>
  );
}
