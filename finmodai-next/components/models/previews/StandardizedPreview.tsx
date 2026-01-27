/**
 * Standardized Model Preview Component
 * 
 * Displays model previews using the standardized format:
 * - KPIs (Key Performance Indicators)
 * - Assumptions Panel (grouped by category)
 * - Charts (Recharts)
 * - Checks (validation results)
 * 
 * This component supports both LBO, Comps, and Merger models.
 */

"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import { PreviewChartsPanel } from '@/components/models/PreviewChartsPanel';
import { cn } from '@/lib/utils';
import type { PreviewResult } from '@/lib/models/runModelPipeline';
import type { ChartSpec } from '@/types/chartSpecs';

interface StandardizedPreviewProps {
  preview: PreviewResult & {
    kpis?: Array<{
      label: string;
      value: string | number;
      format: 'currency' | 'percent' | 'multiple' | 'number' | 'text';
      unit?: string;
    }>;
    checks?: Array<{
      name: string;
      passed: boolean;
      message?: string;
      severity?: 'error' | 'warning' | 'info';
    }>;
  };
  modelType: 'lbo' | 'comps' | 'merger';
  ticker?: string;
  title?: string;
}

/**
 * Format value based on format type
 */
function formatValue(value: string | number, format: string, unit?: string): string {
  if (typeof value === 'string') {
    return value;
  }
  
  if (!Number.isFinite(value)) {
    return '—';
  }
  
  switch (format) {
    case 'currency':
      if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
      if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
      return `$${value.toFixed(0)}`;
    case 'percent':
      return `${(value * 100).toFixed(1)}%`;
    case 'multiple':
      return `${value.toFixed(2)}x`;
    case 'number':
      return value.toFixed(2);
    case 'text':
      return String(value);
    default:
      return unit ? `${value} ${unit}` : String(value);
  }
}

/**
 * Get check icon based on severity
 */
function getCheckIcon(severity?: string) {
  switch (severity) {
    case 'error':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case 'info':
      return <Info className="h-4 w-4 text-blue-500" />;
    default:
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  }
}

/**
 * Group assumptions by category
 */
function groupAssumptionsByCategory(assumptions: Array<{
  key: string;
  label: string;
  value: string | number | boolean;
  unit?: string;
  category?: 'Operating' | 'Capital Structure' | 'Valuation';
  isDerived?: boolean;
}>) {
  const grouped: Record<string, typeof assumptions> = {
    Operating: [],
    'Capital Structure': [],
    Valuation: [],
    Other: [],
  };
  
  assumptions.forEach((assumption) => {
    const category = assumption.category || 'Other';
    grouped[category].push(assumption);
  });
  
  return grouped;
}

/**
 * Convert PreviewResult charts to ChartSpec format for PreviewChartsPanel
 */
function convertChartsToChartSpec(charts?: Array<{
  type: 'line' | 'bar' | 'area' | 'scatter';
  title: string;
  data: Record<string, any>[];
  xKey: string;
  yKey?: string;
  yKeys?: string[];
}>): ChartSpec[] {
  if (!charts) return [];
  
  return charts.map((chart) => {
    if (chart.type === 'line') {
      // Convert to ChartSpec format
      const series = chart.yKeys
        ? chart.yKeys.map((key, idx) => ({
            key,
            label: key.charAt(0).toUpperCase() + key.slice(1),
            color: ['#10b981', '#60a5fa', '#f59e0b', '#f87171'][idx % 4],
          }))
        : chart.yKey
        ? [{ key: chart.yKey, label: chart.title, color: '#10b981' }]
        : [];
      
      return {
        type: 'line',
        title: chart.title,
        xKey: chart.xKey,
        series,
        data: chart.data,
      } as ChartSpec;
    } else if (chart.type === 'bar') {
      return {
        type: 'bar',
        title: chart.title,
        xKey: chart.xKey,
        series: chart.yKey
          ? [{ key: chart.yKey, label: chart.title, color: '#10b981' }]
          : [],
        data: chart.data,
      } as ChartSpec;
    } else {
      // Default to line for other types
      return {
        type: 'line',
        title: chart.title,
        xKey: chart.xKey,
        series: [],
        data: chart.data,
      } as ChartSpec;
    }
  });
}

export function StandardizedPreview({ preview, modelType, ticker, title }: StandardizedPreviewProps) {
  const { kpis = [], assumptions = [], charts = [], checks = [], summary } = preview;
  
  const groupedAssumptions = groupAssumptionsByCategory(assumptions);
  const chartSpecs = convertChartsToChartSpec(charts);
  
  return (
    <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg">{title || `${modelType.toUpperCase()} Model`}</CardTitle>
          {summary && (
            <Badge variant="outline" className="border-[var(--cb-green)] text-[var(--cb-green)] bg-[var(--cb-green)]/10 text-sm">
              {summary}
            </Badge>
          )}
        </div>
        {ticker && <p className="text-xs text-[var(--cb-text-muted)]">Ticker: {ticker}</p>}
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Checks Summary */}
        {checks.length > 0 && (
          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4 space-y-2">
            <h3 className="text-sm font-semibold text-[var(--cb-text-primary)] mb-3">Model Checks</h3>
            <div className="space-y-2">
              {checks.map((check, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex items-start gap-2 text-sm',
                    check.passed
                      ? 'text-[var(--cb-green)]'
                      : check.severity === 'error'
                      ? 'text-[var(--cb-danger)]'
                      : check.severity === 'warning'
                      ? 'text-[var(--cb-warning)]'
                      : 'text-[var(--cb-text-muted)]'
                  )}
                >
                  {getCheckIcon(check.severity)}
                  <div className="flex-1">
                    <span className="font-medium">{check.name}:</span>
                    {check.message && <span className="ml-2">{check.message}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* KPIs */}
        {kpis.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {kpis.map((kpi, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4 text-sm"
              >
                <p className="text-[var(--cb-text-muted)] uppercase tracking-wide text-[0.65rem]">{kpi.label}</p>
                <p className="mt-1 text-xl font-semibold text-[var(--cb-text-primary)]">
                  {formatValue(kpi.value, kpi.format, kpi.unit)}
                </p>
              </div>
            ))}
          </div>
        )}
        
        {/* Charts */}
        {chartSpecs.length > 0 && (
          <div className="space-y-4">
            <PreviewChartsPanel charts={chartSpecs} title="Analysis Charts" chartHeightClass="h-48" />
          </div>
        )}
        
        {/* Assumptions Panel */}
        {assumptions.length > 0 && (
          <Accordion type="single" collapsible defaultValue="assumptions">
            <AccordionItem value="assumptions" className="border-0">
              <AccordionTrigger className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4 text-sm font-semibold text-[var(--cb-text-primary)]">
                Key Assumptions
              </AccordionTrigger>
              <AccordionContent className="px-0 pt-4">
                <div className="space-y-4">
                  {Object.entries(groupedAssumptions).map(([category, items]) => {
                    if (items.length === 0) return null;
                    
                    return (
                      <div key={category} className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4 text-sm">
                        <h4 className="font-semibold text-[var(--cb-text-primary)] mb-3">{category}</h4>
                        <div className="space-y-2">
                          {items.map((assumption, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between py-1 border-b border-[var(--cb-border-subtle)] last:border-0"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-[var(--cb-text-muted)]">{assumption.label}</span>
                                {assumption.isDerived && (
                                  <Badge variant="outline" className="text-[0.65rem] h-4 px-1">
                                    Derived
                                  </Badge>
                                )}
                              </div>
                              <span className="font-semibold text-[var(--cb-text-primary)]">
                                {typeof assumption.value === 'boolean'
                                  ? assumption.value
                                    ? 'Yes'
                                    : 'No'
                                  : assumption.unit
                                  ? `${assumption.value} ${assumption.unit}`
                                  : String(assumption.value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
