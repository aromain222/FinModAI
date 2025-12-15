import { ScenarioEngineApp } from '@/components/scenario/ScenarioEngineApp';
import { PageHeader } from '@/components/ui/PageHeader';

export default function ScenarioEnginePage({ searchParams }: { searchParams?: Record<string, string> }) {
  const ticker = typeof searchParams?.ticker === 'string' ? searchParams.ticker.toUpperCase() : undefined;

  return (
    <main className="min-h-screen bg-[var(--cb-bg)] px-6 py-10 text-[var(--cb-text-body)]">
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader
          title="Bull / Base / Bear Planner"
          subtitle="Explore quick valuation ranges by dialing revenue growth, margins, exit multiples, and leverage. All calculations happen instantly in your browser."
          backHref="/models/create"
        />
        <ScenarioEngineApp initialTicker={ticker} key={ticker ?? 'scenario-engine'} />
      </div>
    </main>
  );
}
