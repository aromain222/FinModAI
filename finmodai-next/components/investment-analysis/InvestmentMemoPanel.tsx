'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { InvestmentMemoSections } from '@/lib/investment-analysis/types';

export function InvestmentMemoPanel({
  memo,
  activeScenarioLabel,
  onRefresh,
  isRefreshing,
}: {
  memo: InvestmentMemoSections;
  activeScenarioLabel: string;
  onRefresh?: () => Promise<void> | void;
  isRefreshing?: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Investment Memo</CardTitle>
            <CardDescription>
              Writing layer for the {activeScenarioLabel.toLowerCase()} scenario. Structured outputs should update this selectively.
            </CardDescription>
          </div>
          {onRefresh ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void onRefresh()} disabled={isRefreshing}>
              {isRefreshing ? 'Refreshing…' : 'Refresh Summary'}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-6">
        <section>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Summary</div>
          <p className="text-sm leading-6 text-[var(--cb-text-primary)]">{memo.summary}</p>
        </section>
        <section>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Why It Matters</div>
          <p className="text-sm leading-6 text-[var(--cb-text-primary)]">{memo.whyItMatters}</p>
        </section>
        <section>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Analysis</div>
          <p className="text-sm leading-6 text-[var(--cb-text-primary)]">{memo.analysis}</p>
        </section>
      </CardContent>
    </Card>
  );
}
