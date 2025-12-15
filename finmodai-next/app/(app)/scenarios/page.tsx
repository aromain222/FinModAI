import Link from 'next/link';
import { APP_NAME } from '@/lib/branding';

export default function ScenariosPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <Link
          href="/models"
          className="inline-flex items-center text-sm text-muted-foreground transition hover:text-secondary"
        >
          ← Back to Models
        </Link>

        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-cb-blue">{APP_NAME}</p>
          <h1 className="text-3xl font-semibold text-cb-ink">Scenarios</h1>
          <p className="text-sm text-cb-slate">
            Manage and launch bull, base, and bear cases across your valuation models.
          </p>
        </header>

        <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-secondary">Scenario library</h2>
              <p className="text-sm text-muted-foreground">
                Capture macro and company-specific drivers, then attach them to any model run.
              </p>
            </div>
            <Link
              href="/scenarios/new"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
            >
              Create new scenario
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-dashed border-border bg-white/80 p-6 text-sm text-muted-foreground">
          Saved scenarios will appear here, including metadata like ticker, macro assumptions, KPI deltas, and links back
          to generated models.
        </section>
      </div>
    </main>
  );
}
