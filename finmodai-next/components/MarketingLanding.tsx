'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type WaitlistFormProps = {
  idPrefix?: string;
  buttonText?: string;
  successText?: string;
  helperText?: string;
  className?: string;
  cardClassName?: string;
  layout?: 'stacked' | 'inline';
};

export function WaitlistForm({
  idPrefix = 'waitlist',
  buttonText = 'Join the Waitlist',
  successText = 'You’re on the list. We’ll email you about demo access once approved.',
  helperText = 'Waitlist members receive access to the CapitalBase demo.',
  className,
  cardClassName,
  layout = 'stacked',
}: WaitlistFormProps) {
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
          setError('Signup is temporarily unavailable.');
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
        setName('');
        setEmail('');
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
      <div className={cn('rounded-[28px] border border-[var(--cb-green)]/20 bg-[var(--cb-green)]/5 px-6 py-5 text-center shadow-[0_24px_80px_rgba(0,227,135,0.08)]', cardClassName)}>
        <p className="text-sm font-medium text-[var(--cb-green)]">
          {successText}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'mx-auto flex w-full max-w-md flex-col rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,22,29,0.92),rgba(10,13,18,0.92))] shadow-[0_28px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl',
        layout === 'inline' ? 'gap-4 p-5 sm:max-w-xl sm:p-6' : 'gap-5 p-6 sm:p-7',
        className
      )}
    >
      <div className={cn('grid gap-4', layout === 'inline' && 'sm:grid-cols-2')}>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-name`} className="text-[var(--cb-text-muted)]">Name</Label>
          <Input
            id={`${idPrefix}-name`}
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            required
            autoComplete="name"
            className={cn(
              'rounded-2xl border-white/10 bg-white/[0.04] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] focus-visible:ring-[var(--cb-green)]/50',
              layout === 'inline' ? 'h-11' : 'h-12'
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-email`} className="text-[var(--cb-text-muted)]">Email</Label>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
            autoComplete="email"
            className={cn(
              'rounded-2xl border-white/10 bg-white/[0.04] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] focus-visible:ring-[var(--cb-green)]/50',
              layout === 'inline' ? 'h-11' : 'h-12'
            )}
          />
        </div>
      </div>
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      <Button
        type="submit"
        disabled={loading}
        size="lg"
        className={cn(
          'w-full rounded-2xl bg-[linear-gradient(135deg,#00e387,#00c06f)] text-[#04120b] shadow-[0_18px_40px_rgba(0,227,135,0.22)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(0,227,135,0.28)]',
          layout === 'inline' ? 'h-11' : 'h-12'
        )}
      >
        {loading ? 'Submitting…' : buttonText}
      </Button>
      {helperText ? (
        <p className="text-center text-xs text-[var(--cb-text-muted)]">
          {helperText}
        </p>
      ) : null}
    </form>
  );
}
