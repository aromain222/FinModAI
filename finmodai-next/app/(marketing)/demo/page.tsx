/**
 * Demo gate – share this URL (e.g. for LinkedIn). Links to the app.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_NAME } from '@/lib/branding';
import { Button } from '@/components/ui/button';

const title = `${APP_NAME} – Demo available`;
const description =
  'Try institutional-grade financial modeling: DCF, LBO, comps, and three-statement models. Demo live now.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-[#080b0f] flex flex-col items-center justify-center px-4">
      <div className="max-w-lg w-full text-center space-y-8">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[var(--cb-green)]/90">
          Demo available
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Try {APP_NAME}
        </h1>
        <p className="text-[var(--cb-text-body)]">
          The demo is live. Open the app below—use guest mode or sign in.
        </p>
        <div className="pt-4">
          <Button asChild size="lg" className="rounded-lg shadow-[0_0_24px_rgba(0,227,135,0.25)]">
            <Link href="/app">Open demo</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
