'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AnalystCoreTemplatePayload } from '@/lib/analyst/coreModelTemplates';

export function AnalystCoreTemplateCard({ payload }: { payload: AnalystCoreTemplatePayload }) {
  return (
    <Card className="mt-4 overflow-hidden border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Model Workflow</CardTitle>
            <CardDescription>{payload.name}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{payload.category}</Badge>
            <Button asChild type="button" variant="outline" size="sm">
              <Link href={payload.href}>{payload.surface === 'template_library' ? 'Open Model Wizard' : 'Open Builder'}</Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Description</div>
          <p className="text-sm leading-6 text-[var(--cb-text-primary)]">{payload.description}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Workbook Sections</div>
            <div className="flex flex-wrap gap-2">
              {payload.sectionTitles.map((section) => (
                <Badge key={section} variant="outline" className="border-[var(--cb-border-subtle)] text-[var(--cb-text-secondary)]">
                  {section}
                </Badge>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Input Highlights</div>
            <div className="flex flex-wrap gap-2">
              {payload.fieldHighlights.map((field) => (
                <Badge key={field} variant="outline" className="border-[var(--cb-border-subtle)] text-[var(--cb-text-secondary)]">
                  {field}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[rgba(255,255,255,0.02)] p-3 text-sm leading-6 text-[var(--cb-text-secondary)]">
          {payload.surface === 'template_library'
            ? 'This model already exists in CapitalBase as a deterministic workbook template. Use the wizard to set assumptions, download Excel, and iterate with workbook-specific logic instead of a thin generic chat wrapper.'
            : 'This model already exists in CapitalBase in the automated builder. Use that workflow to set assumptions, generate the model, and export the workbook through the correct engine.'}
        </div>
      </CardContent>
    </Card>
  );
}
