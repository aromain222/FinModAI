import Link from 'next/link';
import { PromptToModel } from '@/components/model-generator/PromptToModel';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/branding';

export default function ModelGeneratorPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(0,227,135,0.08),transparent_28%),linear-gradient(180deg,#090c11_0%,#0b0f15_100%)] px-6 py-10 text-[var(--cb-text-body)]">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <header className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--cb-green)]">{APP_NAME}</p>
            <h1 className="text-3xl font-semibold text-[var(--cb-text-primary)]">Model Generator</h1>
            <p className="max-w-3xl text-sm text-[var(--cb-text-secondary)]">
              Prompt-to-model generation for direct workbook builders plus clean routing into the broader CapitalBase finance model catalog, with visible provenance, saved reruns, and downloadable finance-native Excel outputs where the generic generator is the right engine.
            </p>
            <div className="inline-flex items-center rounded-full border border-[var(--cb-green)]/25 bg-[rgba(0,227,135,0.08)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cb-green)]">
              Supports the quality-gated 1,000-company public universe
            </div>
          </header>
          <Button asChild variant="outline">
            <Link href="/app">Back to Dashboard</Link>
          </Button>
        </div>

        <PromptToModel />
      </div>
    </main>
  );
}
