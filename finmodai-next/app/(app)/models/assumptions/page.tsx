import Link from 'next/link';
import { BackButton } from '@/components/BackButton';
import { APP_NAME } from '@/lib/branding';

export default function AssumptionsPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <BackButton />
        <Link
          href="/models"
          className="inline-flex items-center text-sm text-muted-foreground transition hover:text-secondary"
        >
          ← Back to Models
        </Link>

        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-cb-blue">{APP_NAME}</p>
          <h1 className="text-3xl font-semibold text-cb-ink">Assumption sets</h1>
          <p className="text-sm text-cb-slate">
            Manage saved revenue, margin, macro, and capital structure inputs that can be attached to any model.
          </p>
        </header>

        <section className="rounded-2xl border border-dashed border-border bg-white/80 p-6 text-sm text-muted-foreground">
          This section will list reusable assumptions soon. For now, keep building models via the wizard and we will
          capture those inputs automatically.
        </section>
      </div>
    </main>
  );
}
