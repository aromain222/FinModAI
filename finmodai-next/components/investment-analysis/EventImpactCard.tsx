'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormattedTextBlock } from '@/components/ui/formatted-text-block';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  INVESTMENT_EVENT_TAXONOMY_V1,
  type InvestmentHistoricalPatternMatchResult,
  type InvestmentEventAssumptionApplicationResult,
  type InvestmentEventClassificationResult,
} from '@/lib/investment-analysis';

export type EventImpactCardProps = {
  classification: InvestmentEventClassificationResult;
  application: InvestmentEventAssumptionApplicationResult;
  historicalPatternMatch?: InvestmentHistoricalPatternMatchResult | null;
  valuationStatusLabel?: string;
  interpretationNote?: string | null;
};

function titleCase(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function confidenceBadgeClass(confidence: InvestmentEventClassificationResult['confidence']): string {
  if (confidence === 'high') return 'border-emerald-300/80 bg-emerald-50 text-emerald-900';
  if (confidence === 'medium') return 'border-amber-300/80 bg-amber-50 text-amber-900';
  return 'border-slate-300 bg-slate-50 text-slate-800';
}

function validationClass(severity: 'warning' | 'error'): string {
  return severity === 'error'
    ? 'border-red-300/80 bg-red-50 text-red-900'
    : 'border-amber-300/80 bg-amber-50 text-amber-900';
}

function MetaStat(props: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
      <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">{props.label}</div>
      <div className="mt-1 text-base font-semibold text-[var(--cb-text-primary)]">{props.value}</div>
      {props.helper ? <div className="mt-1 text-xs text-[var(--cb-text-muted)]">{props.helper}</div> : null}
    </div>
  );
}

function ChangeRow({
  label,
  original,
  delta,
  updated,
  rationale,
  confidence,
}: {
  label: string;
  original: string;
  delta: string;
  updated: string;
  rationale: string;
  confidence: InvestmentEventClassificationResult['confidence'];
}) {
  return (
    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
      <div className="grid gap-3 lg:grid-cols-[160px_1fr_140px_1fr] lg:items-start">
        <div>
          <div className="text-sm font-medium text-[var(--cb-text-primary)]">{label}</div>
          <div className="mt-1 text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Assumption</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Before</div>
          <div className="mt-1 text-sm text-[var(--cb-text-primary)]">{original}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Delta</div>
          <div className="mt-1 text-sm font-medium text-[var(--cb-text-primary)]">{delta}</div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">After</div>
            <Badge variant="outline" className={cn('text-[10px]', confidenceBadgeClass(confidence))}>
              {titleCase(confidence)}
            </Badge>
          </div>
          <div className="mt-1 text-sm text-[var(--cb-text-primary)]">{updated}</div>
          <div className="mt-2 text-xs leading-5 text-[var(--cb-text-muted)]">{rationale}</div>
        </div>
      </div>
    </div>
  );
}

export function EventImpactCard({
  classification,
  application,
  historicalPatternMatch,
  valuationStatusLabel,
  interpretationNote,
}: EventImpactCardProps) {
  const taxonomyEntry =
    classification.category === 'unknown'
      ? null
      : INVESTMENT_EVENT_TAXONOMY_V1[classification.category];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>Event Impact</CardTitle>
            <CardDescription>
              Event-aware assumptions applied before deterministic valuation refresh.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {taxonomyEntry?.label ?? 'Unclassified Event'}
            </Badge>
            <Badge variant="outline" className={confidenceBadgeClass(classification.confidence)}>
              {titleCase(classification.confidence)} Confidence
            </Badge>
            {valuationStatusLabel ? <Badge variant="outline">{valuationStatusLabel}</Badge> : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Event Detected</div>
              <div className="mt-1 text-base font-semibold text-[var(--cb-text-primary)]">
                {classification.normalizedEventSummary}
              </div>
              {taxonomyEntry?.description ? (
                <div className="mt-2 text-sm leading-6 text-[var(--cb-text-muted)]">{taxonomyEntry.description}</div>
              ) : null}
            </div>

            <Separator />

            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Why It Changed</div>
              <p className="mt-1 text-sm leading-6 text-[var(--cb-text-primary)]">{application.summary}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--cb-text-muted)]">{classification.rationale}</p>
              {historicalPatternMatch?.headlineInterpretation ? (
                <p className="mt-2 text-xs leading-5 text-[var(--cb-text-muted)]">
                  {historicalPatternMatch.headlineInterpretation}
                </p>
              ) : null}
              {interpretationNote ? (
                <FormattedTextBlock
                  content={interpretationNote}
                  className="mt-2 space-y-2"
                  paragraphClassName="text-xs leading-5 text-[var(--cb-text-muted)]"
                />
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <MetaStat
              label="Scenario Bias"
              value={titleCase(application.scenarioBias)}
              helper="Directional framing for the refreshed case"
            />
            <MetaStat
              label="Adjustments Applied"
              value={String(application.changes.length)}
              helper="Editable and fully inspectable assumption changes"
            />
            <MetaStat
              label="Validation"
              value={application.validationIssues.length > 0 ? `${application.validationIssues.length} flags` : 'Clean'}
              helper={
                application.validationIssues.length > 0
                  ? 'Review flagged assumptions before relying on the refreshed case'
                  : 'Adjusted assumptions remain within the normal demo ranges'
              }
            />
          </div>
        </div>

        {historicalPatternMatch && historicalPatternMatch.patterns.length > 0 ? (
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">
              Historical Patterns
            </div>
            <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
              <p className="text-sm leading-6 text-[var(--cb-text-primary)]">
                {historicalPatternMatch.impactSummary}
              </p>
              <div className="mt-4 grid gap-3">
                {historicalPatternMatch.patterns.map((pattern) => (
                  <div key={pattern.id} className="rounded-lg border border-[var(--cb-border-subtle)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-[var(--cb-text-primary)]">{pattern.label}</div>
                      <Badge variant="outline" className="text-[10px]">
                        {pattern.period}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[var(--cb-text-muted)]">{pattern.summary}</p>
                    <p className="mt-2 text-xs leading-5 text-[var(--cb-text-muted)]">
                      <span className="font-medium text-[var(--cb-text-primary)]">Transmission:</span> {pattern.transmissionPath}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-[var(--cb-text-muted)]">
                      <span className="font-medium text-[var(--cb-text-primary)]">Typical model moves:</span>{' '}
                      {pattern.typicalModelAdjustments.join('; ')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div>
          <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">
            Assumption Adjustments Applied
          </div>
          <div className="space-y-3">
            {application.changes.map((change) => (
              <ChangeRow
                key={change.field}
                label={change.label}
                original={change.display.original}
                delta={change.display.delta}
                updated={change.display.updated}
                rationale={change.rationale}
                confidence={change.confidence}
              />
            ))}
          </div>
        </div>

        {application.validationIssues.length > 0 ? (
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">Review Flags</div>
            {application.validationIssues.map((issue) => (
              <div
                key={`${issue.field}-${issue.message}`}
                className={cn('rounded-xl border p-3 text-sm', validationClass(issue.severity))}
              >
                <span className="font-medium">{titleCase(issue.field)}:</span> {issue.message}
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
