/**
 * Dedicated demo page – separate from landing/waitlist.
 * Single link: Open demo → /login (guest or sign in).
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_NAME } from '@/lib/branding';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: `${APP_NAME} – Demo`,
  description: 'Try the CapitalBase demo.',
};

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-[#080b0f] flex flex-col items-center justify-center px-4">
      <div className="max-w-lg w-full text-center space-y-6">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--cb-green)]/90">
          Demo
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Try {APP_NAME}
        </h1>
        <p className="text-[var(--cb-text-body)] text-sm sm:text-base">
          Open the app below—use guest mode or sign in.
        </p>
        <Button asChild size="lg" className="rounded-lg px-8 shadow-[0_0_24px_rgba(0,227,135,0.25)]">
          <Link href="/login">Open demo</Link>
        </Button>
      </div>
    </main>
  );
}
