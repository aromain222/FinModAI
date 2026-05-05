import type { Metadata } from 'next';
import { PitchQueueClient } from '@/components/pitch/PitchQueueClient';

export const metadata: Metadata = {
  title: 'Pitch Queue | CapitalBase',
};

export default function PitchQueuePage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">
          Weekly workflow
        </p>
        <h1 className="text-2xl font-bold text-[var(--cb-text-primary)]">Pitch Queue</h1>
        <p className="max-w-2xl text-sm text-[var(--cb-text-muted)]">
          Queue ranked ideas before they become trades. Review the pitch, vote pending / approved / rejected, and keep the board focused on discussion-ready setups.
        </p>
      </header>
      <PitchQueueClient />
    </main>
  );
}

