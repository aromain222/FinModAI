import type { Metadata } from 'next';
import { PortfolioPanel } from '@/components/portfolio/PortfolioPanel';

export const metadata: Metadata = {
  title: 'Thesis Watch | CapitalBase',
};

export default function PortfolioPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">
          Swing-trade workflow
        </p>
        <h1 className="text-2xl font-bold text-[var(--cb-text-primary)]">Thesis Watch</h1>
        <p className="max-w-2xl text-sm text-[var(--cb-text-muted)]">
          Track ideas by thesis, not just price. Each card auto-checks score drift, news, catalysts, and AI agent sentiment so you know whether to add, hold, trim, or exit.
        </p>
      </header>
      <PortfolioPanel />
    </main>
  );
}
