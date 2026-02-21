'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabaseClient';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function DemoRequestForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      const trimmedName = name.trim();
      const trimmedEmail = email.trim();
      if (!trimmedName) {
        setError('Name is required.');
        return;
      }
      if (!trimmedEmail) {
        setError('Email is required.');
        return;
      }
      if (!EMAIL_REGEX.test(trimmedEmail)) {
        setError('Please enter a valid email address.');
        return;
      }
      setLoading(true);
      try {
        const client = supabase;
        if (!client) {
          setError('Request is temporarily unavailable.');
          setLoading(false);
          return;
        }
        const { error: insertError } = await (client.from('waitlist_signups') as any).insert({
          name: trimmedName,
          email: trimmedEmail,
        });
        if (insertError) {
          setError(insertError.message || 'Something went wrong. Please try again.');
          setLoading(false);
          return;
        }
        setSuccess(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [name, email]
  );

  if (success) {
    return (
      <div className="space-y-6 text-center">
        <p className="text-[var(--cb-green)] font-medium">
          You’re in. We’ll be in touch and you can try the demo below.
        </p>
        <Button asChild size="lg" className="rounded-lg shadow-[0_0_24px_rgba(0,227,135,0.25)]">
          <Link href="/app">Open demo</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-sm flex-col gap-5">
      <div className="space-y-2">
        <Label htmlFor="demo-name" className="text-[var(--cb-text-muted)]">Name</Label>
        <Input
          id="demo-name"
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={loading}
          required
          autoComplete="name"
          className="border-white/10 bg-white/5 focus-visible:ring-[var(--cb-green)]/50"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="demo-email" className="text-[var(--cb-text-muted)]">Email</Label>
        <Input
          id="demo-email"
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          required
          autoComplete="email"
          className="border-white/10 bg-white/5 focus-visible:ring-[var(--cb-green)]/50"
        />
      </div>
      {error && (
        <p className="text-sm text-red-400" role="alert">{error}</p>
      )}
      <Button
        type="submit"
        disabled={loading}
        size="lg"
        className="w-full rounded-lg shadow-[0_0_20px_rgba(0,227,135,0.2)] hover:shadow-[0_0_24px_rgba(0,227,135,0.3)]"
      >
        {loading ? 'Submitting…' : 'Request demo'}
      </Button>
    </form>
  );
}
