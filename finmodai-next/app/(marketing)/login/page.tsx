'use client';

import { Suspense, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CapitalBaseLogo } from '@/components/CapitalBaseLogo';
import { APP_NAME } from '@/lib/branding';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const password = inputRef.current?.value ?? '';
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const from = params.get('from') ?? '/app';
        router.replace(from);
      } else {
        setError('Wrong password. Try again.');
        if (inputRef.current) inputRef.current.value = '';
        inputRef.current?.focus();
      }
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--cb-bg)] px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <div className="flex justify-center">
            <CapitalBaseLogo />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--cb-text-muted)]">
            {APP_NAME}
          </p>
          <h1 className="text-xl font-bold text-[var(--cb-text-primary)]">Welcome back</h1>
          <p className="text-sm text-[var(--cb-text-muted)]">Enter the access password to continue.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            ref={inputRef}
            type="password"
            placeholder="Access password"
            autoFocus
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-[var(--cb-border)] bg-[var(--cb-surface)] px-4 py-3 text-sm text-[var(--cb-text-primary)] placeholder:text-[var(--cb-text-muted)] focus:border-[var(--cb-green)] focus:outline-none"
          />

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[var(--cb-green)] px-4 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Verifying…' : 'Enter'}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
