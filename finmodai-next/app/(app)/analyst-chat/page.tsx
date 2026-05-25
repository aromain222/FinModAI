import { Suspense } from 'react';
import Link from 'next/link';
import { AnalystChatApp } from '@/components/analyst/AnalystChatApp';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/branding';

export default async function AnalystChatPage() {
  return (
    <main className="min-h-screen bg-[var(--cb-bg)] px-6 py-10 text-[var(--cb-text-body)]">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <header className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-[var(--cb-green)]">{APP_NAME}</p>
            <h1 className="text-3xl font-semibold text-[var(--cb-text-primary)]">Analyst Chat</h1>
            <p className="text-sm text-[var(--cb-text-secondary)]">
              Ask anything. Add a ticker only when you want company-specific context. Attach PDFs to capture memo highlights.
            </p>
          </header>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/pitch-queue">Pitch Queue</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/app">Back to Dashboard</Link>
            </Button>
          </div>
        </div>
        <Suspense fallback={<div className="h-[600px] flex items-center justify-center text-sm text-[var(--cb-text-muted)]">Loading…</div>}>
          <AnalystChatApp />
        </Suspense>
      </div>
    </main>
  );
}
