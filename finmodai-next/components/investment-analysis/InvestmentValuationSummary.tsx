'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { InvestmentAnalysisDocument, InvestmentAnalysisScenarioDocument } from '@/lib/investment-analysis/types';

function formatCurrency(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function SummaryCard(props: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
      <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">{props.label}</div>
      <div className="mt-1 text-2xl font-semibold text-[var(--cb-text-primary)]">{props.value}</div>
      {props.helper ? <div className="mt-1 text-xs text-[var(--cb-text-muted)]">{props.helper}</div> : null}
    </div>
  );
}

function ScenarioRow(props: {
  scenario: InvestmentAnalysisScenarioDocument;
  isActive: boolean;
}) {
  return (
    <div className="grid grid-cols-[96px_1fr_1fr_1fr] items-center gap-3 border-t border-[var(--cb-border-subtle)] py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium text-[var(--cb-text-primary)]">{props.scenario.label}</span>
        {props.isActive ? <Badge variant="outline">Active</Badge> : null}
      </div>
      <div className="text-[var(--cb-text-primary)]">{formatCurrency(props.scenario.result.valuation.enterpriseValue)}</div>
      <div className="text-[var(--cb-text-primary)]">{formatCurrency(props.scenario.result.valuation.equityValue)}</div>
      <div className="text-[var(--cb-text-primary)]">{formatCurrency(props.scenario.result.valuation.impliedPerShareValue)}</div>
    </div>
  );
}

export function InvestmentValuationSummary({
  document,
  activeScenario,
}: {
  document: InvestmentAnalysisDocument;
  activeScenario: InvestmentAnalysisScenarioDocument;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
        <CardTitle>Valuation Summary</CardTitle>
        <CardDescription>
          Structured outputs are the source of truth for the active scenario.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Enterprise Value"
            value={formatCurrency(activeScenario.result.valuation.enterpriseValue)}
            helper="PV of forecast cash flows plus terminal value"
          />
          <SummaryCard
            label="Equity Value"
            value={formatCurrency(activeScenario.result.valuation.equityValue)}
            helper={`Net debt ${formatCurrency(activeScenario.assumptions.netDebt ?? 0)}`}
          />
          <SummaryCard
            label="Implied Per Share"
            value={formatCurrency(activeScenario.result.valuation.impliedPerShareValue)}
            helper={
              typeof activeScenario.assumptions.shareCount === 'number'
                ? `Share count ${activeScenario.assumptions.shareCount.toLocaleString('en-US')}`
                : 'Share count not provided'
            }
          />
          <SummaryCard
            label="WACC / Terminal g"
            value={`${formatPercent(activeScenario.assumptions.wacc)} / ${formatPercent(activeScenario.assumptions.terminalGrowthRate)}`}
            helper="Discount rate and terminal growth"
          />
        </div>

        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
          <div className="grid grid-cols-[96px_1fr_1fr_1fr] gap-3 text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">
            <div>Scenario</div>
            <div>EV</div>
            <div>Equity</div>
            <div>Per Share</div>
          </div>
          <div className="mt-2">
            {(['bull', 'base', 'bear', 'custom'] as const).map((key) => (
              <ScenarioRow
                key={key}
                scenario={document.scenarios[key]}
                isActive={document.activeScenario === key}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
