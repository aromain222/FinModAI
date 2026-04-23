'use client';

import React from 'react';
import { Brain, TrendingUp, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AnalystScenarioCardPayload } from '@/lib/analyst/scenarioCard';

type ScenarioCardProps = AnalystScenarioCardPayload & {
  canApplyToActiveDcf?: boolean;
  onApplyToDcf?: () => void;
};

function formatBillions(value: number): string {
  return `$${(value / 1_000_000_000).toFixed(1)}B`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function ScenarioCard(props: ScenarioCardProps) {
  const isPositive = props.changePercent >= 0;

  return (
    <Card className="overflow-hidden rounded-2xl border border-[var(--cb-border-subtle)] bg-background shadow-lg">
      <div className="flex p-6 md:p-8">
        <div className="mr-4 w-1 shrink-0 rounded-full bg-sky-500/70" />
        <div className="min-w-0 flex-1">
          <CardHeader className="mb-4 border-b border-[var(--cb-border-subtle)] p-0 pb-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-2 text-[var(--cb-green)]">
                  <Brain className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">{props.modeLabel}</div>
                  <CardTitle className="text-2xl font-bold text-[var(--cb-text-primary)]">{props.title}</CardTitle>
                  <div className="text-sm text-[var(--cb-text-muted)]">{props.company}</div>
                </div>
              </div>
              {props.canApplyToActiveDcf && props.onApplyToDcf ? (
                <Button type="button" variant="outline" size="sm" onClick={props.onApplyToDcf}>
                  Apply to Active DCF
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-6 p-0">
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--cb-text-primary)]">
                <TrendingUp className="h-4 w-4 text-[var(--cb-green)]" />
                <span>Valuation Impact</span>
              </div>
              <div className="text-sm text-[var(--cb-text-muted)]">
                Primary Driver: <span className="text-[var(--cb-text-primary)]">{props.primaryDriver}</span>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4">
                  <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Base EV</div>
                  <div className="mt-2 text-2xl font-semibold text-[var(--cb-text-primary)]">{formatBillions(props.baseValuation)}</div>
                </div>
                <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4">
                  <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Scenario EV</div>
                  <div className="mt-2 text-2xl font-semibold text-[var(--cb-text-primary)]">{formatBillions(props.scenarioValuation)}</div>
                </div>
                <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4">
                  <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">% Change</div>
                  <div className={`mt-2 text-3xl font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatPercent(props.changePercent)}
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-sm font-medium text-[var(--cb-text-primary)]">Key Drivers</div>
              <div className="space-y-2 text-sm leading-7 text-[var(--cb-text-primary)]">
                {props.drivers.map((driver) => (
                  <div key={driver}>• {driver}</div>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-sm font-medium text-[var(--cb-text-primary)]">Interpretation</div>
              <div className="space-y-3 text-sm leading-7 text-[var(--cb-text-primary)]">
                {props.interpretation.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--cb-text-primary)]">
                <TriangleAlert className="h-4 w-4 text-amber-300" />
                <span>Risks</span>
              </div>
              <div className="space-y-2 text-sm leading-7 text-[var(--cb-text-primary)]">
                {props.risks.map((risk) => (
                  <div key={risk}>• {risk}</div>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-sm font-medium text-[var(--cb-text-primary)]">AI Smart Assumptions</div>
              <div className="overflow-hidden rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--cb-surface-subtle)] text-[var(--cb-text-muted)]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Metric</th>
                      <th className="px-4 py-3 font-medium">Base</th>
                      <th className="px-4 py-3 font-medium">Scenario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.assumptions.map((row) => (
                      <tr key={row.metric} className="border-t border-[var(--cb-border-subtle)]">
                        <td className="px-4 py-3 text-[var(--cb-text-primary)]">{row.metric}</td>
                        <td className="px-4 py-3 text-[var(--cb-text-primary)]">{formatPercent(row.base)}</td>
                        <td className="px-4 py-3 text-[var(--cb-text-primary)]">{formatPercent(row.scenario)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </CardContent>
        </div>
      </div>
    </Card>
  );
}
