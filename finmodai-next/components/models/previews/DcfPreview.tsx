"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { DCFOutput } from '@/lib/models/outputTypes';
import { formatMoney, formatPrice, formatPct, formatMultiple } from '@/lib/models/formatHelpers';
import { MissingBadge } from '@/components/models/MissingBadge';
import { DcfDebugDrawer } from '@/components/models/DcfDebugDrawer';
import { AlertTriangle } from 'lucide-react';

interface DcfPreviewProps {
  output: DCFOutput;
  ticker: string;
  onEditAssumptions?: () => void;
  rawDcfOutput?: any; // For debug drawer
}

export function DcfPreview({ output, ticker, onEditAssumptions, rawDcfOutput: rawDcfOutputProp }: DcfPreviewProps) {
  // Raw DCF output coming from the parent/result payload
  // Try multiple prop paths to find the full model result object
  const rawDcfOutput = rawDcfOutputProp ?? null;
  
  // Safe dev client check (only runs on client, only in dev)
  const isDevClient = 
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  
  // Debug logs BEFORE mapping (dev only)
  if (isDevClient) {
    console.log('[DCF PREVIEW] raw input keys:', rawDcfOutput ? Object.keys(rawDcfOutput) : null);
    console.log('[DCF PREVIEW] raw.dcfSummary?.valuation:', rawDcfOutput?.dcfSummary?.valuation);
    console.log('[DCF PREVIEW] raw.dcfSummary?.results:', rawDcfOutput?.dcfSummary?.results);
  }
  
  // Debug logs AFTER mapping (dev only) - output is already parsed/mapped
  if (isDevClient) {
    console.log('[DCF PREVIEW] mapped output (output):', output);
    console.log('[DCF PREVIEW] output.valuation:', output.valuation);
    console.log('[DCF PREVIEW] output.valuation.impliedValuePerShare:', output.valuation.impliedValuePerShare);
    console.log('[DCF PREVIEW] output.valuation.enterpriseValue:', output.valuation.enterpriseValue);
    console.log('[DCF PREVIEW] output.valuation.equityValue:', output.valuation.equityValue);
    console.log('[DCF PREVIEW] output.valuationBridge:', output.valuationBridge);
  }
  
  // Use missingInputs from parsed output if available, otherwise detect
  const missingInputs = output.missingInputs || [];
  
  // Fix the "Cannot compute valuation yet" check - use mapped values from output
  // The output is already parsed, so we check the valuation fields directly
  // Use mapped values ONLY (from the parsed DCFOutput structure)
  const canComputeValuation = 
    output.valuation.impliedValuePerShare != null &&
    output.valuation.enterpriseValue != null &&
    output.valuation.equityValue != null;
  const hasCurrentPrice = output.valuation.currentPrice !== null && output.valuation.currentPrice !== undefined;
  const hasUpsideDownside = output.valuation.upsideDownside !== null && output.valuation.upsideDownside !== undefined;

  // Determine terminal method
  const terminalMethod = output.assumptions.exitMultiple !== null && output.assumptions.exitMultiple !== undefined
    ? 'exit-multiple'
    : output.assumptions.terminalGrowth !== null && output.assumptions.terminalGrowth !== undefined
    ? 'terminal-growth'
    : null;

  return (
    <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader>
        <CardTitle className="text-lg">DCF Valuation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Missing Inputs Callout - ONLY show if canComputeValuation is false AND we have missing inputs */}
        {!canComputeValuation && missingInputs.length > 0 && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-50/50 p-4 dark:bg-amber-950/20">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2">
                  Cannot compute valuation yet
                </h3>
                <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-300 mb-3">
                  {missingInputs.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-0.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                {onEditAssumptions && (
                  <Button
                    onClick={onEditAssumptions}
                    size="sm"
                    variant="outline"
                    className="border-amber-600 text-amber-700 hover:bg-amber-100 dark:border-amber-500 dark:text-amber-400 dark:hover:bg-amber-950/40"
                  >
                    Edit assumptions
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Top Strip: Key Metrics */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--cb-border-subtle)] pb-4">
          <div className="flex-1">
            <div className="text-xs text-[var(--cb-text-muted)] mb-1">Implied Value / Share</div>
            <div className="text-2xl font-bold text-[var(--cb-text-primary)]">
              {formatPrice(output.valuation.impliedValuePerShare)}
            </div>
            {!canComputeValuation && (
              <div className="mt-1 text-xs text-[var(--cb-text-muted)]">
                Missing required inputs to compute valuation.
              </div>
            )}
            {hasCurrentPrice && hasUpsideDownside && (
              <div className="mt-2 space-y-1">
                <div className="text-xs text-[var(--cb-text-muted)]">
                  Current: {formatPrice(output.valuation.currentPrice)}
                </div>
                <div className={`text-sm font-medium ${
                  (output.valuation.upsideDownside || 0) > 0
                    ? 'text-[var(--cb-green)]'
                    : (output.valuation.upsideDownside || 0) < 0
                    ? 'text-[var(--cb-danger)]'
                    : 'text-[var(--cb-text-muted)]'
                }`}>
                  {output.valuation.upsideDownside! > 0 ? '+' : ''}
                  {formatPct(output.valuation.upsideDownside! / 100)}
                </div>
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-[var(--cb-text-muted)] mb-1">Enterprise Value</div>
            <div className="text-lg font-semibold text-[var(--cb-text-primary)]">
              {formatMoney(output.valuation.enterpriseValue)}
            </div>
          </div>
        </div>

        {/* Missing Badges - ONLY show if canComputeValuation is false */}
        {!canComputeValuation && (
          <div className="flex flex-wrap gap-2">
            {output.valuationBridge.pvOfFCF === null && (
              <MissingBadge label="Missing FCF" />
            )}
            {output.valuationBridge.netDebt === null && (
              <MissingBadge label="Missing net debt" />
            )}
            {output.valuation.impliedValuePerShare === null && output.valuation.equityValue !== null && (
              <MissingBadge label="Missing shares" />
            )}
            {output.valuationBridge.pvOfTerminalValue === null && (
              <MissingBadge label="Missing terminal value inputs" />
            )}
          </div>
        )}

        {/* Assumptions Row (Chips) */}
        <div>
          <div className="flex flex-wrap gap-2">
            {output.assumptions.wacc !== null && (
              <Badge variant="outline" className="text-xs">
                WACC: {formatPct(output.assumptions.wacc)}
              </Badge>
            )}
            {terminalMethod === 'terminal-growth' && output.assumptions.terminalGrowth !== null && (
              <Badge variant="outline" className="text-xs">
                Terminal Growth: {formatPct(output.assumptions.terminalGrowth)}
              </Badge>
            )}
            {terminalMethod === 'exit-multiple' && output.assumptions.exitMultiple !== null && (
              <Badge variant="outline" className="text-xs">
                Exit Multiple: {formatMultiple(output.assumptions.exitMultiple)}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              Forecast: {output.assumptions.projectionHorizon} years
            </Badge>
            {output.assumptions.taxRate !== null && (
              <Badge variant="outline" className="text-xs">
                Tax Rate: {formatPct(output.assumptions.taxRate)}
              </Badge>
            )}
            {output.assumptions.reinvestmentRate !== null && (
              <Badge variant="outline" className="text-xs">
                Reinvestment: {formatPct(output.assumptions.reinvestmentRate)}
              </Badge>
            )}
            {output.assumptions.capexPct !== null && (
              <Badge variant="outline" className="text-xs">
                Capex: {formatPct(output.assumptions.capexPct)}
              </Badge>
            )}
          </div>
        </div>

        {/* Two-Column Body */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Left: Projections Table */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-[var(--cb-text-primary)]">
              Projections (FY+1 to FY+3)
            </h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    {output.projections.years.map((year, idx) => (
                      <TableHead key={idx} className="text-right">
                        {year}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Revenue</TableCell>
                    {output.projections.revenue.map((val, idx) => (
                      <TableCell key={idx} className="text-right">
                        {formatMoney(val)}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">EBITDA</TableCell>
                    {output.projections.ebitda.map((val, idx) => (
                      <TableCell key={idx} className="text-right">
                        {formatMoney(val)}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Free Cash Flow</TableCell>
                    {output.projections.freeCashFlow.map((val, idx) => (
                      <TableCell key={idx} className="text-right font-semibold">
                        {formatMoney(val)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Right: Valuation Bridge */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-[var(--cb-text-primary)]">
              Valuation Bridge
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--cb-text-muted)]">PV of FCF</span>
                <span className="font-medium text-[var(--cb-text-primary)]">
                  {formatMoney(output.valuationBridge.pvOfFCF)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--cb-text-muted)]">PV of Terminal Value</span>
                <span className="font-medium text-[var(--cb-text-primary)]">
                  {formatMoney(output.valuationBridge.pvOfTerminalValue)}
                </span>
              </div>
              <div className="flex justify-between border-t border-[var(--cb-border-subtle)] pt-2 font-semibold">
                <span className="text-[var(--cb-text-primary)]">Enterprise Value</span>
                <span className="text-[var(--cb-text-primary)]">
                  {formatMoney(output.valuationBridge.enterpriseValue)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--cb-text-muted)]">Net Debt</span>
                <span className="font-medium text-[var(--cb-text-primary)]">
                  {formatMoney(output.valuationBridge.netDebt)}
                </span>
              </div>
              <div className="flex justify-between border-t border-[var(--cb-border-subtle)] pt-2 font-semibold">
                <span className="text-[var(--cb-text-primary)]">Equity Value</span>
                <span className="text-[var(--cb-text-primary)]">
                  {formatMoney(output.valuationBridge.equityValue)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Mini Sensitivity Grid (3x3) */}
        {output.sensitivity && output.sensitivity.waccRange.length >= 3 && (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-[var(--cb-text-primary)]">
              Sensitivity Analysis
            </h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {output.sensitivity.terminalGrowthRange
                        ? 'Terminal Growth →'
                        : output.sensitivity.exitMultipleRange
                        ? 'Exit Multiple →'
                        : 'WACC →'}
                    </TableHead>
                    {(output.sensitivity.terminalGrowthRange ||
                      output.sensitivity.exitMultipleRange ||
                      output.sensitivity.waccRange.slice(0, 3)).map((val, idx) => (
                      <TableHead key={idx} className="text-right">
                        {output.sensitivity.terminalGrowthRange
                          ? formatPct(val)
                          : output.sensitivity.exitMultipleRange
                          ? formatMultiple(val)
                          : formatPct(val)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {output.sensitivity.waccRange.slice(0, 3).map((wacc, waccIdx) => (
                    <TableRow key={waccIdx}>
                      <TableCell className="font-medium">
                        WACC {formatPct(wacc)}
                      </TableCell>
                      {output.sensitivity.grid[waccIdx]?.slice(0, 3).map((value, valIdx) => (
                        <TableCell key={valIdx} className="text-right">
                          {value !== null ? formatPrice(value) : '—'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Debug Drawer (Dev Only) */}
        {isDevClient && rawDcfOutput && (
          <DcfDebugDrawer
            rawDcfOutput={rawDcfOutput}
            mappedPreview={output}
          />
        )}
      </CardContent>
    </Card>
  );
}
