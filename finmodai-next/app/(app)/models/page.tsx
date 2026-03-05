import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ModelPicker } from '@/components/models/ModelPicker';
import { listModelMeta } from '@/lib/models/core/registry';
import { APP_NAME } from '@/lib/branding';

export const dynamic = 'force-dynamic';

type ModelsPageProps = {
  searchParams?: {
    tab?: string;
  };
};

export default function ModelsPage({ searchParams }: ModelsPageProps) {
  const models = listModelMeta();
  const tab = searchParams?.tab === 'templates' ? 'templates' : 'automated';
  const templateCount = models.length;

  return (
    <div className="h-full overflow-y-auto bg-[var(--cb-bg)] px-6 py-10 text-[var(--cb-text-body)]">
      <div className="mx-auto max-w-7xl space-y-8 pb-8">
        <section className="rounded-3xl border border-[var(--cb-border-subtle)] bg-[radial-gradient(circle_at_top_right,rgba(32,201,151,0.08),transparent_28%),linear-gradient(135deg,rgba(8,16,28,0.96),rgba(5,10,18,0.94))] p-6 md:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <header className="max-w-4xl space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--cb-green)]">{APP_NAME}</p>
              <h1 className="text-4xl font-semibold tracking-tight text-[var(--cb-text-primary)] md:text-5xl">
                Model Library
              </h1>
              <p className="max-w-3xl text-base leading-8 text-[var(--cb-text-primary)]/88 md:text-lg">
                Choose between the automated builder and deterministic template workbooks. The builder is faster for
                one-off runs. The template library is for structured, audit-friendly modeling.
              </p>
            </header>

            <div className="flex flex-col gap-3 lg:min-w-[260px] lg:items-end">
              <Button
                asChild
                variant="outline"
                className="h-11 w-full justify-center border-white/10 bg-white/[0.02] px-5 hover:bg-white/[0.05] lg:w-auto"
              >
                <Link href="/app">Back to Dashboard</Link>
              </Button>

              <div className="flex w-full flex-wrap gap-3 lg:justify-end">
                <div className="min-w-[110px] rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--cb-text-muted)]">
                    Templates
                  </p>
                  <p className="mt-1 text-3xl font-semibold text-[var(--cb-text-primary)]">{templateCount}</p>
                </div>
                <div className="min-w-[110px] rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--cb-text-muted)]">
                    Output
                  </p>
                  <p className="mt-1 text-3xl font-semibold text-[var(--cb-text-primary)]">XLSX</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="inline-flex rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <Link
            href="/models?tab=automated"
            className={cn(
              'rounded-xl px-5 py-2.5 text-sm font-medium transition-all',
              tab === 'automated'
                ? 'bg-[var(--cb-surface)] text-[var(--cb-text-primary)] shadow-sm'
                : 'text-[var(--cb-text-secondary)] hover:text-[var(--cb-text-primary)]'
            )}
          >
            Automated Builder
          </Link>
          <Link
            href="/models?tab=templates"
            className={cn(
              'rounded-xl px-5 py-2.5 text-sm font-medium transition-all',
              tab === 'templates'
                ? 'bg-[var(--cb-surface)] text-[var(--cb-text-primary)] shadow-sm'
                : 'text-[var(--cb-text-secondary)] hover:text-[var(--cb-text-primary)]'
            )}
          >
            Template Library
          </Link>
        </div>

        {tab === 'automated' ? (
          <section className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
            <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] shadow-none">
              <CardHeader className="space-y-3">
                <div className="inline-flex w-fit items-center rounded-full border border-[var(--cb-border-subtle)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">
                  Automated
                </div>
                <CardTitle className="text-2xl">Automated Model Builder</CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-6">
                  AI-assisted model generation with ticker or private-company inputs, plus built-in reporting and export.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">
                      Input Modes
                    </p>
                    <p className="mt-2 text-sm text-[var(--cb-text-primary)]">Ticker or manual private company data</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">
                      Output
                    </p>
                    <p className="mt-2 text-sm text-[var(--cb-text-primary)]">Workbook, memo, and PDF report</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">
                      Best For
                    </p>
                    <p className="mt-2 text-sm text-[var(--cb-text-primary)]">Faster scenario-driven one-off runs</p>
                  </div>
                </div>
                <Button asChild className="h-11 px-5">
                  <Link href="/models/create">Open Automated Builder</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] shadow-none">
              <CardHeader>
                <CardTitle className="text-base">When to use templates instead</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-[var(--cb-text-secondary)]">
                <p>Use templates when you want repeatable structure, explicit input control, and audit-friendly workbook logic.</p>
                <p>They are the better fit for accounting schedules, board-ready operating models, and institutional workbook formats.</p>
                <Button asChild variant="outline" className="mt-2 w-full">
                  <Link href="/models?tab=templates">Browse Template Models</Link>
                </Button>
              </CardContent>
            </Card>
          </section>
        ) : (
          <section className="space-y-5">
            <div className="flex flex-col gap-4 rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] px-5 py-5 md:flex-row md:items-end md:justify-between">
              <div className="space-y-1">
                <h2 className="text-2xl font-semibold text-[var(--cb-text-primary)]">Template Models</h2>
                <p className="text-sm leading-6 text-[var(--cb-text-secondary)]">
                  Deterministic workbooks with model-specific formatting, fixed math, and direct `.xlsx` output.
                </p>
              </div>
              <div className="inline-flex items-center rounded-full border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-4 py-2 text-sm font-medium text-[var(--cb-text-primary)]">
                {templateCount} available templates
              </div>
            </div>
            <ModelPicker models={models} />
          </section>
        )}
      </div>
    </div>
  );
}
