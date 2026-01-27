"use client";

import React, { useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CompsOutput } from '@/lib/models/outputTypes';
import { CompsDistributionChart, type MetricType } from '@/components/comps/CompsDistributionChart';
import { CompsAssumptions } from '@/components/comps/CompsAssumptions';
import { ImpliedValuationRange } from '@/components/comps/ImpliedValuationRange';
import { useCompsPreviewState } from '@/lib/hooks/useCompsPreviewState';
import { ModelChecksSummary } from '@/components/models/ModelChecksSummary';
import { PreviewChartsPanel } from '@/components/models/PreviewChartsPanel';
import type { ChartSpec } from '@/types/chartSpecs';
import { PreviewShell } from './PreviewShell';

/**
 * Helper math utilities for compsum preview filtering
 */
function calculateMeanAndStdDev(values: number[]) {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0 };
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

function detectOutliers(values: number[], thresholdSigma = 2): Set<number> {
  if (values.length === 0) return new Set();
  const { mean, stdDev } = calculateMeanAndStdDev(values);
  if (stdDev === 0) return new Set();
  const result = new Set<number>();
  for (const value of values) {
    const zScore = Math.abs((value - mean) / stdDev);
    if (zScore > thresholdSigma) {
      result.add(value);
    }
  }
  return result;
}

function calculatePercentiles(values: number[]) {
  if (values.length === 0) {
    return { median: 0, p25: 0, p75: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => {
    const idx = Math.floor(p * (sorted.length - 1));
    return sorted[idx] ?? 0;
  };
  return {
    p25: percentile(0.25),
    median: percentile(0.5),
    p75: percentile(0.75),
  };
}

function getDefaultMetric(output: CompsOutput): MetricType {
  const hasEvRevenue = typeof output.target.evRevenue === 'number' && output.target.evRevenue > 0;
  const hasEvEbitda = typeof output.target.evEbitda === 'number' && output.target.evEbitda > 0;
  const hasPe = typeof output.target.pe === 'number' && output.target.pe > 0;
  if (hasPe) return 'pe';
  if (hasEvEbitda) return 'evEbitda';
  if (hasEvRevenue) return 'evRevenue';
  return 'evRevenue';
}

function getMetricLabel(metric: MetricType) {
  switch (metric) {
    case 'evRevenue':
      return 'EV/Revenue';
    case 'evEbitda':
      return 'EV/EBITDA';
    case 'pe':
      return 'P/E';
  }
}

function getMetricValue(peer: CompsOutput['peers'][0] | CompsOutput['target'], metric: MetricType) {
  switch (metric) {
    case 'evRevenue':
      return peer.evRevenue;
    case 'evEbitda':
      return peer.evEbitda;
    case 'pe':
      return peer.pe;
  }
}

function getSummaryForMetric(output: CompsOutput, metric: MetricType) {
  switch (metric) {
    case 'evRevenue':
      return output.summary.evRevenue;
    case 'evEbitda':
      return output.summary.evEbitda;
    case 'pe':
      return output.summary.pe;
  }
}

function formatMultiple(value?: number) {
  if (!Number.isFinite(value ?? NaN)) return '—';
  return `${value?.toFixed(1)}x`;
}

interface CompsPreviewProps {
  output: CompsOutput;
  ticker: string;
  targetBaseFinancial?: number;
  downloadUrl?: string;
}

export function CompsPreview({ output, ticker, targetBaseFinancial, downloadUrl }: CompsPreviewProps) {
  // Defensive defaults at the top
  const peers = output?.peers ?? [];
  const hasPeers = peers.length > 0;
  const safeTicker = ticker ?? output?.target?.ticker ?? '';
  const defaultMetric = useMemo(() => getDefaultMetric(output), [output]);
  const { selectedMetric, setSelectedMetric } = useCompsPreviewState(safeTicker, defaultMetric);

  const { outlierValues, filteredSummary } = useMemo(() => {
    const peerValues = peers
      .map((peer) => getMetricValue(peer, selectedMetric))
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    if (peerValues.length === 0) {
      return {
        outlierValues: new Set<number>(),
        filteredSummary: output?.summary?.[selectedMetric] ?? { median: 0, p25: 0, p75: 0 },
      };
    }

    const outliers = detectOutliers(peerValues, 2);
    const filteredValues = peerValues.filter((value) => !outliers.has(value));
    const recalculated =
      filteredValues.length > 0 ? calculatePercentiles(filteredValues) : (output?.summary?.[selectedMetric] ?? { median: 0, p25: 0, p75: 0 });

    return {
      outlierValues: outliers,
      filteredSummary: recalculated,
    };
  }, [peers, output, selectedMetric]);

  const isOutlier = useMemo(
    () => (peer: CompsOutput['peers'][0]) => {
      const value = getMetricValue(peer, selectedMetric);
      return value !== undefined && Number.isFinite(value) && outlierValues.has(value);
    },
    [outlierValues, selectedMetric]
  );

  const targetValue = getMetricValue(output?.target ?? {}, selectedMetric);
  const metricLabel = getMetricLabel(selectedMetric);

  // Safe KPI values with fallbacks
  const medianEvRevenue = output?.summary?.evRevenue?.median;
  const medianEvEbitda = output?.summary?.evEbitda?.median;
  const medianPe = output?.summary?.pe?.median;

  const peerTableRows = hasPeers
    ? [
        { ...output.target, ticker: output.target?.ticker || 'Target', isTarget: true },
        ...peers.map((peer) => ({ ...peer, isTarget: false })),
      ]
    : [];

  return (
    <PreviewShell
      title="Comps Preview"
      subtitle="Trading multiples analysis"
      badgeText="Comps"
      ticker={safeTicker}
    >
      <TooltipProvider>
        {/* 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          {/* LEFT COLUMN (~70%) */}
          <div className="space-y-6">
            {/* KPI Summary Row - Always visible */}
            <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
              <CardHeader>
                <CardTitle className="text-base">Key Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
                    <p className="text-[var(--cb-text-muted)] uppercase tracking-wide text-[0.65rem]">Peer Count</p>
                    <p className="mt-1 text-xl font-semibold text-[var(--cb-text-primary)]">
                      {hasPeers ? peers.length : '—'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
                    <p className="text-[var(--cb-text-muted)] uppercase tracking-wide text-[0.65rem]">Median EV/Revenue</p>
                    <p className="mt-1 text-xl font-semibold text-[var(--cb-text-primary)]">
                      {formatMultiple(medianEvRevenue)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
                    <p className="text-[var(--cb-text-muted)] uppercase tracking-wide text-[0.65rem]">Median EV/EBITDA</p>
                    <p className="mt-1 text-xl font-semibold text-[var(--cb-text-primary)]">
                      {formatMultiple(medianEvEbitda)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
                    <p className="text-[var(--cb-text-muted)] uppercase tracking-wide text-[0.65rem]">Median P/E</p>
                    <p className="mt-1 text-xl font-semibold text-[var(--cb-text-primary)]">
                      {formatMultiple(medianPe)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Peers Table or Empty State */}
            <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Peer Multiples</CardTitle>
                  {hasPeers && (
                    <Tabs value={selectedMetric} onValueChange={(value) => setSelectedMetric(value as MetricType)}>
                      <TabsList className="grid w-[240px] grid-cols-3">
                        <TabsTrigger value="evRevenue" className="text-xs">EV/Rev</TabsTrigger>
                        <TabsTrigger value="evEbitda" className="text-xs">EV/EBITDA</TabsTrigger>
                        <TabsTrigger value="pe" className="text-xs">P/E</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {hasPeers ? (
                  <div className="overflow-x-auto">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="border-b border-[var(--cb-border-subtle)]">Company</TableHead>
                          <TableHead
                            className={cn(
                              'text-right border-b border-[var(--cb-border-subtle)]',
                              selectedMetric === 'evRevenue' && 'bg-[var(--cb-green)]/10'
                            )}
                          >
                            EV/Revenue
                          </TableHead>
                          <TableHead
                            className={cn(
                              'text-right border-b border-[var(--cb-border-subtle)]',
                              selectedMetric === 'evEbitda' && 'bg-[var(--cb-green)]/10'
                            )}
                          >
                            EV/EBITDA
                          </TableHead>
                          <TableHead
                            className={cn(
                              'text-right border-b border-[var(--cb-border-subtle)]',
                              selectedMetric === 'pe' && 'bg-[var(--cb-green)]/10'
                            )}
                          >
                            P/E
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {peerTableRows.map((peer, idx) => (
                          <TableRow
                            key={`${peer.ticker}-${idx}`}
                            className={peer.isTarget ? 'bg-[var(--cb-green)]/10' : undefined}
                          >
                            <TableCell className="text-[var(--cb-text-primary)] font-semibold">
                              {peer.ticker || 'Unknown'}
                            </TableCell>
                            <TableCell className="text-right">{formatMultiple(peer.evRevenue)}</TableCell>
                            <TableCell className="text-right">{formatMultiple(peer.evEbitda)}</TableCell>
                            <TableCell className="text-right">{formatMultiple(peer.pe)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <p className="text-sm text-[var(--cb-text-primary)] font-medium">
                      No comparable companies were identified for this run based on the selected filters.
                    </p>
                    <p className="mt-2 text-xs text-[var(--cb-text-muted)]">
                      The Excel workbook contains the full model output.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN (~30%) */}
          <div className="space-y-6">
            {/* Run Metadata */}
            <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
              <CardHeader>
                <CardTitle className="text-base">Run Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-[var(--cb-text-muted)]">Ticker</p>
                  <p className="text-sm font-mono text-[var(--cb-text-primary)]">{safeTicker || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--cb-text-muted)]">Sector</p>
                  <p className="text-sm text-[var(--cb-text-primary)]">{output?.target?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--cb-text-muted)]">Generated</p>
                  <p className="text-sm text-[var(--cb-text-primary)]">{new Date().toLocaleDateString()}</p>
                </div>
              </CardContent>
            </Card>

            {/* Methodology */}
            <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
              <CardHeader>
                <CardTitle className="text-base">Methodology</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-[var(--cb-text-muted)] leading-relaxed">
                  Trading comparables analysis uses peer company multiples to estimate relative valuation. 
                  Peers are selected based on sector, business model, and financial profile similarity.
                </p>
              </CardContent>
            </Card>

            {/* Download Excel - Always visible */}
            {downloadUrl && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.open(downloadUrl, '_blank')}
              >
                <Download className="mr-2 h-4 w-4" />
                Download Excel
              </Button>
            )}
          </div>
        </div>
      </TooltipProvider>
    </PreviewShell>
  );
}
