'use client';

import Decimal from 'decimal.js';
import React, { useMemo, useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ToastProvider';
import type { MaOutput, MaOutputs } from '@/lib/models/outputTypes';
import {
  buildMaComparisonRows,
  computeMaComputedOutputs,
  MaTableRow,
  ValueCell,
} from '@/lib/models/merger/maComparison';
import type { SerializedMaDealInputs } from '@/lib/models/merger/maDealInputs';

const FALLBACK_REASON = 'M&A v1 outputs unavailable';

const formatCurrencyMm = (value: number) => `$${value.toFixed(1)}MM`;
const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const formatShares = (value: number) => `${Math.round(value).toLocaleString()} shares`;

type ValueRowProps = {
  label: string;
  note: string;
  field?: MaOutput<number>;
  formatter?: (value: number) => string;
};

const OutputField = ({
  field,
  formatter = (value: number) => value.toString(),
  fallbackReason,
}: {
  field?: MaOutput<number>;
  formatter?: (value: number) => string;
  fallbackReason?: string;
}) => {
  if (field?.value !== undefined) {
    return (
      <span className="text-sm font-semibold text-[var(--cb-text-primary)]">
        {formatter(field.value)}
      </span>
    );
  }

  const reason = field?.reason ?? fallbackReason ?? FALLBACK_REASON;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-sm font-semibold text-[var(--cb-text-muted)]">—</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs bg-slate-900 border-slate-700 text-slate-100">
        {reason}
      </TooltipContent>
    </Tooltip>
  );
};

const ValueRow = ({ label, note, field, formatter }: ValueRowProps) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs text-[var(--cb-text-muted)]">{label}</p>
      <OutputField field={field} formatter={formatter} fallbackReason={`Missing ${label}`} />
    </div>
    <p className="text-xs text-[var(--cb-text-muted)]">{note}</p>
  </div>
);

interface MaPreviewProps {
  inputs: SerializedMaDealInputs;
  outputs: MaOutputs<number>;
  ticker: string;
}

const formatCellValue = (value: Decimal, units?: MaTableRow['units']) => {
  const numeric = value.toNumber();
  switch (units) {
    case 'shares':
      return formatShares(numeric);
    case 'percent':
      return formatPercent(numeric);
    default:
      return formatCurrencyMm(numeric);
  }
};

const renderValueCell = (cell: ValueCell, units?: MaTableRow['units']) => {
  if (cell.value !== undefined) {
    return (
      <span className="text-sm font-semibold text-[var(--cb-text-primary)]">
        {formatCellValue(cell.value, units)}
      </span>
    );
  }

  const reason = cell.reason ?? 'Missing data';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-sm font-semibold text-[var(--cb-text-muted)]">—</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs bg-slate-900 border-slate-700 text-slate-100">
        {reason}
      </TooltipContent>
    </Tooltip>
  );
};

export function MaPreview({ inputs, outputs, ticker }: MaPreviewProps) {
  const { showToast } = useToast();
  const [runState, setRunState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [runError, setRunError] = useState<string | null>(null);

  if (!inputs || !outputs) {
    return (
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardContent className="text-sm text-[var(--cb-text-muted)]">
          M&A preview data for {ticker} is unavailable. Generate the model to see detailed metrics.
        </CardContent>
      </Card>
    );
  }

  const computedOutputs = useMemo(() => computeMaComputedOutputs(inputs), [inputs]);
  const comparisonRows = useMemo(
    () => buildMaComparisonRows(inputs, computedOutputs, outputs),
    [inputs, computedOutputs, outputs]
  );

  const accretionField = outputs.accretionPct;
  const standaloneEpsField = outputs.standaloneEps;
  const proFormaEpsField = outputs.proFormaEps;

  if (process.env.NODE_ENV !== 'production') {
    const checks: Array<[string, MaOutput<number>?]> = [
      ['targetEquityValue', outputs.targetEquityValue],
      ['newSharesIssued', outputs.newSharesIssued],
      ['proFormaNetIncome', outputs.proFormaNetIncome],
      ['proFormaShares', outputs.proFormaShares],
      ['standaloneEps', standaloneEpsField],
      ['proFormaEps', proFormaEpsField],
      ['accretionPct', accretionField],
    ];
    checks.forEach(([name, field]) => {
      if (field && field.value === undefined && !field.reason) {
        throw new Error(`MaPreview: ${name} is missing both value and reason`);
      }
    });

    if (
      accretionField.value !== undefined &&
      (standaloneEpsField.value === undefined || proFormaEpsField.value === undefined)
    ) {
      throw new Error('MaPreview: accretionPct computed without EPS values');
    }
  }

  const considerationSum = new Decimal(inputs.consideration.cashPct)
    .plus(new Decimal(inputs.consideration.stockPct));
  const considerationMismatch = !considerationSum.equals(new Decimal(100));

  const accretionLabel =
    accretionField.value === undefined
      ? 'Pending'
      : accretionField.value > 0
        ? 'Accretive'
        : accretionField.value < 0
          ? 'Dilutive'
          : 'Flat';
  const accretionColor =
    accretionField.value === undefined
      ? 'text-[var(--cb-text-muted)]'
      : accretionField.value > 0
        ? 'text-emerald-400'
        : accretionField.value < 0
          ? 'text-rose-400'
          : 'text-slate-500';

  const assumptions = [
    {
      label: 'Acquirer share price',
      value: formatCurrencyMm(inputs.acquirer.sharePrice),
    },
    {
      label: 'Target share price',
      value: formatCurrencyMm(inputs.target.sharePrice),
    },
    {
      label: 'Acquirer net income',
      value: formatCurrencyMm(inputs.acquirer.netIncome),
    },
    {
      label: 'Target net income',
      value: formatCurrencyMm(inputs.target.netIncome),
    },
    {
      label: 'Synergies',
      value:
        inputs.synergies?.revenueSynergiesMm || inputs.synergies?.costSynergiesMm
          ? `$${(
              (inputs.synergies?.revenueSynergiesMm ?? 0) +
              (inputs.synergies?.costSynergiesMm ?? 0)
            ).toFixed(1)}MM run-rate`
          : 'None assumed',
    },
    {
      label: 'Transaction fees',
      value: formatCurrencyMm(inputs.transaction.feesMm),
    },
  ];

  const handleRunFullModel = async () => {
    if (runState === 'loading') return;
    setRunError(null);
    setRunState('loading');

    try {
      const response = await fetch('/api/ma/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(inputs),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => null);
        const message = json?.message ?? 'Failed to generate workbook';
        throw new Error(message);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition');
      const filenameMatch = disposition?.match(/filename=(?:\"?)([^\";]+)/i);
      const defaultFilename = `CapitalBase_MA_${inputs.acquirer.ticker}_${inputs.target.ticker}_${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`;
      const filename = filenameMatch?.[1] ?? defaultFilename;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      showToast({ title: 'Generated', description: 'M&A workbook is downloading.' });
      setRunState('idle');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to download workbook';
      setRunError(message);
      setRunState('error');
    }
  };

  return (
    <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">M&A Deal Preview</CardTitle>
            <p className="text-xs text-[var(--cb-text-muted)]">
              {inputs.acquirer.ticker} → {inputs.target.ticker}
            </p>
          </div>
          <Badge
            variant={
              accretionField.value === undefined
                ? 'secondary'
                : accretionField.value > 0
                  ? 'default'
                  : accretionField.value < 0
                    ? 'destructive'
                    : 'outline'
            }
          >
            {accretionLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <TooltipProvider>
          <section className="space-y-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">
              Transaction Overview
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <ValueRow
                label="Target Equity Value"
                note="Share price × shares outstanding (includes premium)."
                field={outputs.targetEquityValue}
                formatter={formatCurrencyMm}
              />
              <div className="space-y-1">
                <p className="text-xs text-[var(--cb-text-muted)]">Offer Premium</p>
                <span className="text-sm font-semibold text-[var(--cb-text-primary)]">
                  {formatPercent(inputs.pricing.offerPremiumPct)}
                </span>
                <p className="text-xs text-[var(--cb-text-muted)]">Applied to target share price.</p>
              </div>
              <ValueRow
                label="Implied Purchase Price"
                note="Target equity value with premium."
                field={outputs.targetEquityValue}
                formatter={formatCurrencyMm}
              />
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">
                Consideration & Share Impact
              </div>
              {considerationMismatch && (
                <div className="rounded-full border border-rose-500/50 bg-rose-500/10 px-3 py-0.5 text-xs font-semibold text-rose-500">
                  Mix not 100%
                </div>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs text-[var(--cb-text-muted)]">Cash Consideration (%)</p>
                <span className="text-sm font-semibold text-[var(--cb-text-primary)]">
                  {formatPercent(inputs.consideration.cashPct)}
                </span>
                <p className="text-xs text-[var(--cb-text-muted)]">Cash portion of purchase price.</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-[var(--cb-text-muted)]">Stock Consideration (%)</p>
                <span className="text-sm font-semibold text-[var(--cb-text-primary)]">
                  {formatPercent(inputs.consideration.stockPct)}
                </span>
                <p className="text-xs text-[var(--cb-text-muted)]">
                  Alignment with equity consideration.
                </p>
              </div>
              <ValueRow
                label="New Shares Issued"
                note="From stock consideration."
                field={outputs.newSharesIssued}
                formatter={formatShares}
              />
              <ValueRow
                label="Pro Forma Shares Outstanding"
                note="Acquirer shares + new issuance."
                field={outputs.proFormaShares}
                formatter={formatShares}
              />
            </div>
          </section>

          <section className="space-y-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">
              Standalone vs Pro Forma
            </div>
            <div className="overflow-hidden rounded-lg border border-[var(--cb-border-muted)] bg-[var(--cb-surface-subtle)]">
              <div className="grid gap-3 border-b border-[var(--cb-border-muted)] px-4 py-3 text-xs font-semibold uppercase text-[var(--cb-text-muted)] sm:grid-cols-[1.5fr,1fr,1fr,1fr]">
                <span>Metric</span>
                <span className="hidden text-right sm:block">Standalone</span>
                <span className="hidden text-right sm:block">Pro Forma</span>
                <span className="hidden text-right sm:block">Notes</span>
              </div>
              <div className="divide-y divide-[var(--cb-border-muted)]">
                {comparisonRows.map((row) => (
                  <div
                    key={row.label}
                    className="grid items-start gap-3 px-4 py-3 text-sm text-[var(--cb-text-primary)] sm:grid-cols-[1.5fr,1fr,1fr,1fr]"
                  >
                    <div>
                      <p className="font-semibold">{row.label}</p>
                      {row.units && (
                        <p className="text-xs text-[var(--cb-text-muted)]">{row.units}</p>
                      )}
                    </div>
                    <div className="text-right">{renderValueCell(row.standalone, row.units)}</div>
                    <div className="text-right">{renderValueCell(row.proForma, row.units)}</div>
                    <div className="text-xs text-[var(--cb-text-muted)]">
                      {row.note ?? '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {runError && (
                <div className="rounded-lg border border-rose-500/60 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  <p className="font-semibold text-rose-200">Unable to generate workbook</p>
                  <p>{runError}</p>
                </div>
              )}
              <Button
                variant="default"
                disabled={runState === 'loading'}
                onClick={handleRunFullModel}
              >
                {runState === 'loading' ? 'Generating...' : 'Run Full Model'}
              </Button>
              <p className="text-xs text-[var(--cb-text-muted)]">
                The full model workbook uses the same inputs shown above.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">
                EPS Impact
              </div>
              <span className={`text-sm font-semibold ${accretionColor}`}>
                {accretionField.value !== undefined ? formatPercent(accretionField.value) : '—'}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <ValueRow
                label="Standalone EPS"
                note="Acquirer net income / shares."
                field={standaloneEpsField}
                formatter={(value) => `$${value.toFixed(2)}`}
              />
              <ValueRow
                label="Pro Forma EPS"
                note="Combined net income / pro forma shares."
                field={proFormaEpsField}
                formatter={(value) => `$${value.toFixed(2)}`}
              />
              <div className="space-y-1">
                <p className="text-xs text-[var(--cb-text-muted)]">Accretion / Dilution (%)</p>
                {accretionField.value !== undefined ? (
                  <span className={`text-sm font-semibold ${accretionColor}`}>
                    {formatPercent(accretionField.value)}
                  </span>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-sm font-semibold text-[var(--cb-text-muted)]">—</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs bg-slate-900 border-slate-700 text-slate-100">
                      {accretionField.reason ?? FALLBACK_REASON}
                    </TooltipContent>
                  </Tooltip>
                )}
                <p className="text-xs text-[var(--cb-text-muted)]">
                  Pro forma EPS vs standalone EPS.
                </p>
              </div>
            </div>
          </section>
        </TooltipProvider>

        <Accordion type="single" defaultValue="assumptions">
          <AccordionItem value="assumptions">
            <AccordionTrigger className="px-0">
              Key Assumptions
            </AccordionTrigger>
            <AccordionContent className="px-0">
              <div className="grid gap-4 text-sm text-[var(--cb-text-primary)] sm:grid-cols-2">
                {assumptions.map((assumption) => (
                  <div key={assumption.label} className="space-y-1">
                    <p className="text-xs text-[var(--cb-text-muted)]">{assumption.label}</p>
                    <p className="text-sm font-semibold">{assumption.value}</p>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <p className="text-xs text-[var(--cb-text-muted)]">
          Some advanced M&A features (scenarios, earnouts, advanced financing) are not yet supported in v1.
        </p>
      </CardContent>
    </Card>
  );
}
