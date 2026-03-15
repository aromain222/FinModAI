'use client';

import { EditableFinanceChart } from '@/components/charts/EditableFinanceChart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AnalystVisualizationPayload } from '@/lib/analyst/visualization';

export function AnalystVisualizationCard({ payload }: { payload: AnalystVisualizationPayload }) {
  return (
    <Card className="mt-4 overflow-hidden border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
        <CardTitle className="text-base">{payload.title}</CardTitle>
        <CardDescription>{payload.subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-2 text-sm text-[var(--cb-text-primary)]">
          <span className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Context</span>
          <div className="mt-1">{payload.contextLabel}</div>
        </div>
        {payload.panels.length > 0 ? (
          <div className="space-y-4">
            {payload.panels.map((panel) => (
              <EditableFinanceChart
                key={panel.id}
                title={panel.title}
                subtitle={panel.subtitle}
                data={panel.data}
                layout={panel.layout}
                height={panel.height ?? 280}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-amber-300/60 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
            No standalone chart template exists yet for this artifact.
          </div>
        )}
        {payload.notes.length > 0 ? (
          <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Chart Notes</div>
            <ul className="space-y-2 text-sm text-[var(--cb-text-primary)]">
              {payload.notes.map((note) => (
                <li key={note}>- {note}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
