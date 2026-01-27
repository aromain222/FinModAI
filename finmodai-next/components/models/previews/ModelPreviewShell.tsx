"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KpiItem {
  label: string;
  value: string | number | null | undefined;
  format?: 'currency' | 'percent' | 'multiple' | 'number' | 'text';
  unit?: string;
  description?: string;
}

interface ModelPreviewShellProps {
  // Header
  title: string;
  subtitle?: string;
  ticker?: string;
  modelType: 'DCF' | 'Comps' | 'LBO' | 'M&A';
  
  // KPI Strip
  kpis: KpiItem[];
  
  // Content
  children: React.ReactNode;
  
  // Right sidebar
  metadata?: {
    scenario?: string;
    timestamp?: string;
    [key: string]: any;
  };
  assumptions?: Array<{ label: string; value: string }>;
  methodology?: string;
  
  // Actions
  downloadUrl?: string;
  onGenerateReport?: () => void;
  
  // State
  isLoading?: boolean;
  isDegraded?: boolean;
  degradedMessage?: string;
}

export function ModelPreviewShell({
  title,
  subtitle,
  ticker,
  modelType,
  kpis,
  children,
  metadata,
  assumptions,
  methodology,
  downloadUrl,
  onGenerateReport,
  isLoading = false,
  isDegraded = false,
  degradedMessage,
}: ModelPreviewShellProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-[var(--cb-surface-alt)] animate-pulse rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-6">
            <div className="h-32 bg-[var(--cb-surface-alt)] animate-pulse rounded-xl" />
            <div className="h-96 bg-[var(--cb-surface-alt)] animate-pulse rounded-xl" />
          </div>
          <div className="space-y-6">
            <div className="h-48 bg-[var(--cb-surface-alt)] animate-pulse rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-[var(--cb-text-primary)]">{title}</h2>
            <span className="rounded-full border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-2.5 py-0.5 text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">
              {modelType}
            </span>
            {ticker && (
              <span className="rounded-full border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--cb-text-primary)]">
                {ticker}
              </span>
            )}
          </div>
          {subtitle && <p className="text-sm text-[var(--cb-text-muted)]">{subtitle}</p>}
        </div>
      </header>

      {/* Degraded State Banner */}
      {isDegraded && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <p className="text-sm text-[var(--cb-text-primary)]">
              {degradedMessage || 'Preview data partially unavailable. Workbook contains full output.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* LEFT COLUMN (~70%) */}
        <div className="space-y-6">
          {/* KPI Strip */}
          <KpiStrip items={kpis} />

          {/* Primary Content */}
          {children}
        </div>

        {/* RIGHT COLUMN (~30%) */}
        <div className="space-y-6">
          {/* Run Metadata */}
          <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
            <CardHeader>
              <CardTitle className="text-base">Run Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ticker && (
                <div>
                  <p className="text-xs text-[var(--cb-text-muted)]">Ticker</p>
                  <p className="text-sm font-mono text-[var(--cb-text-primary)]">{ticker}</p>
                </div>
              )}
              {metadata?.scenario && (
                <div>
                  <p className="text-xs text-[var(--cb-text-muted)]">Scenario</p>
                  <p className="text-sm text-[var(--cb-text-primary)]">{metadata.scenario}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-[var(--cb-text-muted)]">Generated</p>
                <p className="text-sm text-[var(--cb-text-primary)]">
                  {metadata?.timestamp || new Date().toLocaleDateString()}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Assumptions Summary */}
          {assumptions && assumptions.length > 0 && (
            <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
              <CardHeader>
                <CardTitle className="text-base">Key Assumptions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {assumptions.slice(0, 6).map((assumption, idx) => (
                  <div key={idx} className="flex justify-between text-xs">
                    <span className="text-[var(--cb-text-muted)]">{assumption.label}</span>
                    <span className="font-mono text-[var(--cb-text-primary)]">{assumption.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Methodology */}
          {methodology && (
            <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
              <CardHeader>
                <CardTitle className="text-base">Methodology</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-[var(--cb-text-muted)] leading-relaxed">{methodology}</p>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="space-y-3">
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
            {onGenerateReport && (
              <Button variant="outline" className="w-full" onClick={onGenerateReport}>
                <FileText className="mr-2 h-4 w-4" />
                Generate Report
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * KPI Strip Component
 */
interface KpiStripProps {
  items: KpiItem[];
}

export function KpiStrip({ items }: KpiStripProps) {
  return (
    <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
      <CardHeader>
        <CardTitle className="text-base">Key Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn(
          "grid gap-4",
          items.length <= 3 ? "grid-cols-1 sm:grid-cols-3" :
          items.length <= 4 ? "grid-cols-2 sm:grid-cols-4" :
          "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
        )}>
          {items.map((kpi, idx) => (
            <KpiCard key={idx} {...kpi} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Individual KPI Card
 */
function KpiCard({ label, value, format = 'text', unit, description }: KpiItem) {
  const formattedValue = formatKpiValue(value, format, unit);
  
  return (
    <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
      <p className="text-[var(--cb-text-muted)] uppercase tracking-wide text-[0.65rem] mb-1">
        {label}
      </p>
      <p className="text-xl font-semibold text-[var(--cb-text-primary)]" title={description}>
        {formattedValue}
      </p>
    </div>
  );
}

/**
 * Format KPI value based on type
 */
function formatKpiValue(
  value: string | number | null | undefined,
  format: string,
  unit?: string
): string {
  if (value === null || value === undefined) return '—';
  
  if (typeof value === 'string') return value;
  
  if (!Number.isFinite(value)) return '—';
  
  switch (format) {
    case 'currency':
      if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
      if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
      if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
      return `$${value.toFixed(0)}`;
    
    case 'percent':
      return `${(value * 100).toFixed(1)}%`;
    
    case 'multiple':
      return `${value.toFixed(1)}x`;
    
    case 'number':
      if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
      if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
      if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
      return value.toFixed(0);
    
    default:
      return unit ? `${value}${unit}` : String(value);
  }
}
