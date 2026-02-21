/**
 * Demo request – name + email only. You follow up with them individually.
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

export default function DemoPage() {
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
          Name and email. We’ll reach out to you individually.
        </p>
        <div className="pt-4">
          <DemoRequestForm />
        </div>
      </div>
    </main>
  );
}
