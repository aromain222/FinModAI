'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabaseClient';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RequestDemoForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const n = name.trim();
    const em = email.trim();
    if (!n) {
      setErr('Name is required.');
      return;
    }
    if (!em) {
      setErr('Email is required.');
      return;
    }
    if (!EMAIL_RE.test(em)) {
      setErr('Please enter a valid email.');
      return;
    }
    setLoading(true);
    try {
      const client = supabase;
      if (!client) {
        setErr('Service temporarily unavailable.');
        setLoading(false);
        return;
      }
      const { error } = await (client as any).from('waitlist_signups').insert({ name: n, email: em });
      if (error) {
        setErr(error.message || 'Something went wrong.');
        setLoading(false);
        return;
      }
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <p className="text-[var(--cb-green)] font-medium">
        Thanks. We’ll be in touch.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-sm flex-col gap-5">
      <div className="space-y-2">
        <Label htmlFor="rd-name" className="text-[var(--cb-text-muted)]">Name</Label>
        <Input
          id="rd-name"
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
        <Label htmlFor="rd-email" className="text-[var(--cb-text-muted)]">Email</Label>
        <Input
          id="rd-email"
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
      {err && <p className="text-sm text-red-400" role="alert">{err}</p>}
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
