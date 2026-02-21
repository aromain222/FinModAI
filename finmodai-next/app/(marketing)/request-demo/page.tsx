/**
 * Demo request – name + email only. Primary URL so no cache serves old content.
 */

import type { Metadata } from 'next';
import { APP_NAME } from '@/lib/branding';
import { DemoRequestForm } from '@/components/DemoRequestForm';

const title = `${APP_NAME} – Request demo`;
const description = 'Request a demo. Name and email.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
};

export default function RequestDemoPage() {
  return (
    <main className="min-h-screen bg-[#080b0f] flex flex-col items-center justify-center px-4">
      <div className="max-w-lg w-full text-center space-y-8">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[var(--cb-green)]/90">
          Request demo
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Request a demo
        </h1>
        <p className="text-[var(--cb-text-body)]">
          Enter your name and email. This is not instant access—we’ll reach out to you individually.
        </p>
        <p className="text-xs text-[var(--cb-text-muted)]" data-page="request-demo-form">
          Name and email only · we’ll contact you
        </p>
        <div className="pt-4">
          <DemoRequestForm />
        </div>
      </div>
    </main>
  );
}
