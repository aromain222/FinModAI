/**
 * Dedicated waitlist page – separate from demo. Name + email only.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_NAME } from '@/lib/branding';
import { WaitlistForm } from '@/components/MarketingLanding';

export const metadata: Metadata = {
  title: `${APP_NAME} – Join the waitlist`,
  description: 'Join the waitlist for early access.',
};

export default function WaitlistPage() {
  return (
    <main className="min-h-screen bg-[#080b0f] flex flex-col items-center justify-center px-4">
      <div className="max-w-lg w-full text-center space-y-6">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--cb-green)]/90">
          Early access
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Join the waitlist
        </h1>
        <p className="text-[var(--cb-text-body)] text-sm sm:text-base">
          Enter your name and email. We’ll get in touch and send you the demo link—no instant access here.
        </p>
        <div className="pt-2">
          <WaitlistForm />
        </div>
        <p className="pt-6">
          <Link href="/" className="text-sm text-[var(--cb-text-muted)] hover:text-[var(--cb-green)]/80">
            ← Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
