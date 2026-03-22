'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type {
  DeterministicValuationAssumptions,
  InvestmentAssumptionPatch,
  InvestmentScenarioKey,
} from '@/lib/investment-analysis/types';

function parsePercentInput(raw: string): number | null {
  if (raw.trim().length === 0) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed / 100 : null;
}

function parseNumberInput(raw: string): number | null {
  if (raw.trim().length === 0) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPercentInput(value: number): string {
  return (value * 100).toFixed(1);
}

type AssumptionsPanelProps = {
  activeScenario: InvestmentScenarioKey;
  assumptions: DeterministicValuationAssumptions;
  onPatch: (patch: InvestmentAssumptionPatch) => void;
  onReset: () => void;
  onActivateCustom: () => void;
};

export function AssumptionsPanel({
  activeScenario,
  assumptions,
  onPatch,
  onReset,
  onActivateCustom,
}: AssumptionsPanelProps) {
  const revenueGrowthByYear = assumptions.revenueGrowthByYear;
  const operatingMarginByYear = assumptions.operatingMarginByYear;

  return (
    <Card className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-hidden">
      <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
        <CardTitle>Assumptions</CardTitle>
        <CardDescription>
          Edit the active scenario directly. Deterministic recalculation runs from local state.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100vh-11rem)]">
          <div className="space-y-6 p-6">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onActivateCustom}>
                Clone To Custom
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onReset}>
                Reset Active Scenario
              </Button>
            </div>

            <section className="space-y-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">
                  Revenue Growth By Year
                </div>
                <div className="mt-1 text-xs text-[var(--cb-text-muted)]">
                  Percent by forecast year for the {activeScenario} scenario.
                </div>
              </div>
              <div className="space-y-3">
                {revenueGrowthByYear.map((value, index) => (
                  <div key={`growth-${index}`} className="grid grid-cols-[72px_1fr] items-center gap-3">
                    <Label htmlFor={`revenue-growth-${index}`}>{`Year ${index + 1}`}</Label>
                    <div className="relative">
                      <Input
                        id={`revenue-growth-${index}`}
                        type="number"
                        step="0.1"
                        value={formatPercentInput(value)}
                        onChange={(event) => {
                          const next = parsePercentInput(event.target.value);
                          if (next === null) return;
                          const nextPath = [...revenueGrowthByYear];
                          nextPath[index] = next;
                          onPatch({ revenueGrowthByYear: nextPath });
                        }}
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--cb-text-muted)]">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">
                Operating Margin By Year
              </div>
              <div className="space-y-3">
                {operatingMarginByYear.map((value, index) => (
                  <div key={`margin-${index}`} className="grid grid-cols-[72px_1fr] items-center gap-3">
                    <Label htmlFor={`operating-margin-${index}`}>{`Year ${index + 1}`}</Label>
                    <div className="relative">
                      <Input
                        id={`operating-margin-${index}`}
                        type="number"
                        step="0.1"
                        value={formatPercentInput(value)}
                        onChange={(event) => {
                          const next = parsePercentInput(event.target.value);
                          if (next === null) return;
                          const nextPath = [...operatingMarginByYear];
                          nextPath[index] = next;
                          onPatch({ operatingMarginByYear: nextPath });
                        }}
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--cb-text-muted)]">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">
                Core Valuation Inputs
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax-rate">Tax Rate</Label>
                <div className="relative">
                  <Input
                    id="tax-rate"
                    type="number"
                    step="0.1"
                    value={formatPercentInput(assumptions.taxRate)}
                    onChange={(event) => {
                      const next = parsePercentInput(event.target.value);
                      if (next !== null) onPatch({ taxRate: next });
                    }}
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--cb-text-muted)]">%</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="capex-pct">Capex % Revenue</Label>
                <div className="relative">
                  <Input
                    id="capex-pct"
                    type="number"
                    step="0.1"
                    value={formatPercentInput(assumptions.capexPctRevenue)}
                    onChange={(event) => {
                      const next = parsePercentInput(event.target.value);
                      if (next !== null) onPatch({ capexPctRevenue: next });
                    }}
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--cb-text-muted)]">%</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nwc-pct">Working Capital % Revenue</Label>
                <div className="relative">
                  <Input
                    id="nwc-pct"
                    type="number"
                    step="0.1"
                    value={formatPercentInput(assumptions.nwcChangePctRevenue)}
                    onChange={(event) => {
                      const next = parsePercentInput(event.target.value);
                      if (next !== null) onPatch({ nwcChangePctRevenue: next });
                    }}
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--cb-text-muted)]">%</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wacc">WACC</Label>
                <div className="relative">
                  <Input
                    id="wacc"
                    type="number"
                    step="0.1"
                    value={formatPercentInput(assumptions.wacc)}
                    onChange={(event) => {
                      const next = parsePercentInput(event.target.value);
                      if (next !== null) onPatch({ wacc: next });
                    }}
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--cb-text-muted)]">%</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="terminal-growth">Terminal Growth</Label>
                <div className="relative">
                  <Input
                    id="terminal-growth"
                    type="number"
                    step="0.1"
                    value={formatPercentInput(assumptions.terminalGrowthRate)}
                    onChange={(event) => {
                      const next = parsePercentInput(event.target.value);
                      if (next !== null) onPatch({ terminalGrowthRate: next });
                    }}
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--cb-text-muted)]">%</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="net-debt">Net Debt</Label>
                <Input
                  id="net-debt"
                  type="number"
                  step="1"
                  value={String(assumptions.netDebt ?? 0)}
                  onChange={(event) => {
                    const next = parseNumberInput(event.target.value);
                    if (next !== null) onPatch({ netDebt: next });
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="share-count">Share Count</Label>
                <Input
                  id="share-count"
                  type="number"
                  step="1"
                  value={String(assumptions.shareCount ?? '')}
                  onChange={(event) => {
                    const next = parseNumberInput(event.target.value);
                    if (next !== null) onPatch({ shareCount: next });
                  }}
                />
              </div>
            </section>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
