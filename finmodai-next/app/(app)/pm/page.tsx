import type { Metadata } from 'next';
import { PMDashboard } from '@/components/pm/PMDashboard';

export const metadata: Metadata = {
  title: 'PM OS — CapitalBase',
  description: 'Portfolio Manager Operating System: positions, theses, alerts, and decisions.',
};

export default function PMPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-2">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[var(--cb-text-primary)]">PM OS</h1>
        <p className="text-sm text-[var(--cb-text-muted)]">
          Portfolio Manager Operating System — positions, theses, alerts, and decisions.
        </p>
      </div>
      <PMDashboard />
    </div>
  );
}
