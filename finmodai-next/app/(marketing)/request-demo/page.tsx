/**
 * Demo request – single source of truth. Name + email only; we reach out individually.
 * No "Open demo" / "Try CapitalBase" – this is the only demo gate UI.
 */

import type { Metadata } from 'next';
import { APP_NAME } from '@/lib/branding';
import { DemoRequestForm } from '@/components/DemoRequestForm';

export const metadata: Metadata = {
  title: `${APP_NAME} – Request a demo`,
  description: 'Request a demo. Enter your name and email; we’ll reach out to you.',
  openGraph: {
    title: `${APP_NAME} – Request a demo`,
    description: 'Request a demo. Enter your name and email; we’ll reach out to you.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME} – Request a demo`,
    description: 'Request a demo. Enter your name and email; we’ll reach out to you.',
  },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function RequestDemoPage() {
  return (
    <main className="min-h-screen bg-[#080b0f] flex flex-col items-center justify-center px-4">
      <div className="max-w-lg w-full text-center space-y-6">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--cb-green)]/90">
          Request a demo
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Get in touch
        </h1>
        <p className="text-[var(--cb-text-body)] text-sm sm:text-base">
          Enter your name and email below. This is not instant access—we’ll contact you individually to schedule a walkthrough.
        </p>
        <div className="pt-2">
          <DemoRequestForm />
        </div>
      </div>
    </main>
  );
}
