import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ModelCategory, ModelMeta } from '@/lib/models/core/types';

const CATEGORY_ORDER: ModelCategory[] = ['Accounting', 'Corporate Finance', 'VC', 'Banking'];

const CATEGORY_DESCRIPTIONS: Record<ModelCategory, string> = {
  Accounting: 'Statement logic, controls, and accounting mechanics.',
  'Corporate Finance': 'Valuation, capital structure, and strategic finance tools.',
  VC: 'Startup-focused frameworks, fundraising, and portfolio analysis.',
  Banking: 'Credit, balance sheet, and risk-focused banking models.',
};

type ModelPickerProps = {
  models: ModelMeta[];
};

export function ModelPicker({ models }: ModelPickerProps) {
  const grouped = new Map<ModelCategory, ModelMeta[]>();

  for (const category of CATEGORY_ORDER) {
    grouped.set(category, []);
  }

  for (const model of models) {
    const bucket = grouped.get(model.category);
    if (bucket) {
      bucket.push(model);
    }
  }

  return (
    <div className="space-y-8">
      {CATEGORY_ORDER.map((category) => {
        const categoryModels = grouped.get(category) ?? [];

        return (
          <section
            key={category}
            className="rounded-3xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-5 md:p-6"
          >
            <div className="mb-5 flex flex-col gap-4 border-b border-[var(--cb-border-subtle)] pb-5 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cb-text-muted)]">
                  {category}
                </p>
                <h2 className="text-3xl font-semibold tracking-tight text-[var(--cb-text-primary)]">{category}</h2>
                <p className="max-w-2xl text-sm leading-7 text-[var(--cb-text-secondary)]">
                  {CATEGORY_DESCRIPTIONS[category]}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-4 py-3 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--cb-text-muted)]">Templates</p>
                <p className="mt-1 text-xl font-semibold text-[var(--cb-text-primary)]">
                  {categoryModels.length}
                </p>
              </div>
            </div>

            {categoryModels.length === 0 ? (
              <Card className="border-dashed border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] shadow-none">
                <CardContent className="py-8 text-sm text-[var(--cb-text-secondary)]">
                  No models published in this category yet.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {categoryModels.map((model) => (
                  <Card
                    key={model.slug}
                    className="group flex h-full flex-col overflow-hidden border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--cb-green)]/40 hover:bg-[rgba(255,255,255,0.045)]"
                  >
                    <div className="h-1.5 w-full bg-gradient-to-r from-[var(--cb-green)] via-[var(--cb-green)]/40 to-transparent" />
                    <CardHeader className="space-y-3">
                      <div className="inline-flex w-fit items-center rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-[var(--cb-text-secondary)]">
                        Deterministic Template
                      </div>
                      <CardTitle className="text-xl leading-8 text-[var(--cb-text-primary)]">{model.name}</CardTitle>
                      <CardDescription className="min-h-[88px] text-sm leading-7 text-[var(--cb-text-secondary)]">
                        {model.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto pt-0">
                      <Button
                        asChild
                        className="w-full justify-between border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] text-[var(--cb-text-primary)] hover:bg-[rgba(255,255,255,0.05)]"
                        variant="outline"
                      >
                        <Link href={`/models/${model.slug}`}>
                          Open Wizard
                          <span className="text-xs font-medium text-[var(--cb-green)] transition-colors">
                            Build
                          </span>
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
