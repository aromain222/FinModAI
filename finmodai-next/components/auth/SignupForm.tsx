"use client";

import { FormEvent, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

interface SignupFormProps {
  onSignUpComplete?: () => void;
}

export function SignupForm({ onSignUpComplete }: SignupFormProps) {
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
      <div className="space-y-1 text-left">
        <h2 className="text-xl font-semibold text-cb-ink">
          Create your CapitalBase account
        </h2>
        <p className="text-sm text-cb-slate">
          Build models, save scenarios, and sync across devices.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-full-name" className="text-cb-ink font-medium">
          Full name (optional)
        </Label>
        <Input
          id="signup-full-name"
          name="fullName"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={loading}
          className="bg-white text-cb-ink placeholder-cb-slate border border-cb-line focus-visible:ring-cb-blue focus-visible:border-cb-blue"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-email" className="text-cb-ink font-medium">
          Email address
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
          className="bg-white text-cb-ink placeholder-cb-slate border border-cb-line focus-visible:ring-cb-blue focus-visible:border-cb-blue"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-password" className="text-cb-ink font-medium">
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
          className="bg-white text-cb-ink placeholder-cb-slate border border-cb-line focus-visible:ring-cb-blue focus-visible:border-cb-blue"
        />
      </div>

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      {success && (
        <p className="text-sm text-emerald-500" role="status">
          {success}
        </p>
      )}

      <Button
        type="submit"
        className="w-full rounded-lg bg-cb-blue text-white font-medium py-2.5 hover:bg-blue-500 transition"
        disabled={loading}
      >
        {loading ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}
