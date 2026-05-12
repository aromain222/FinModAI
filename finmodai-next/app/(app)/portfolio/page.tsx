import type { Metadata } from 'next';
import { PortfolioPanel } from '@/components/portfolio/PortfolioPanel';

export const metadata: Metadata = {
  title: 'PM Watch | CapitalBase',
};

export default function PortfolioPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">
          Swing-trade workflow
        </p>
        <h1 className="text-2xl font-bold text-[var(--cb-text-primary)]">PM Watch</h1>
        <p className="max-w-2xl text-sm text-[var(--cb-text-muted)]">
          Track ideas by thesis, not price. Each card shows conviction, drift, catalyst pipeline, and risk — so you always know why you own it and whether the thesis is holding.
        </p>
      </header>
      <PortfolioPanel />
    </main>
  );
}
