"use client";

import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import type { AppliedDefault } from '@/lib/settings/schema';

interface DiagnosticsPanelProps {
  dataCompleteness?: {
    consensusEstimates?: 'available' | 'unavailable';
    ltmData?: 'available' | 'partial' | 'unavailable';
    [key: string]: 'available' | 'partial' | 'unavailable' | undefined;
  };
  appliedDefaults?: AppliedDefault[];
  warnings?: string[];
}

export function DiagnosticsPanel({
  dataCompleteness,
  appliedDefaults = [],
  warnings = [],
}: DiagnosticsPanelProps) {
  const hasContent = dataCompleteness || appliedDefaults.length > 0 || warnings.length > 0;

  if (!hasContent) {
    return (
      <p className="text-sm text-[var(--cb-text-muted)]">No diagnostics available.</p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Data Completeness */}
      {dataCompleteness && (
        <div>
          <h4 className="mb-2 text-xs font-semibold text-[var(--cb-text-muted)] uppercase">
            Data Completeness
          </h4>
          <ul className="space-y-1.5 text-sm">
            {Object.entries(dataCompleteness).map(([key, status]) => {
              if (!status) return null;
              const Icon =
                status === 'available'
                  ? CheckCircle2
                  : status === 'partial'
                  ? AlertTriangle
                  : XCircle;
              const color =
                status === 'available'
                  ? 'text-[var(--cb-green)]'
                  : status === 'partial'
                  ? 'text-amber-500'
                  : 'text-[var(--cb-text-muted)]';
              return (
                <li key={key} className="flex items-center gap-2">
                  <Icon className={`h-3 w-3 ${color}`} />
                  <span className="text-[var(--cb-text-muted)]">
                    {key.replace(/([A-Z])/g, ' $1').trim()}:{' '}
                    <span className="capitalize">{status}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Applied Defaults */}
      {appliedDefaults.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold text-[var(--cb-text-muted)] uppercase">
            Applied Defaults
          </h4>
          <ul className="space-y-1 text-sm">
            {appliedDefaults.map((default_, idx) => (
              <li key={idx} className="flex items-center gap-2 text-[var(--cb-text-muted)]">
                <Info className="h-3 w-3 text-[var(--cb-green)]" />
                <span>
                  {default_.path}: {String(default_.value)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold text-[var(--cb-text-muted)] uppercase">
            Warnings
          </h4>
          <ul className="space-y-1 text-sm">
            {warnings.map((warning, idx) => (
              <li key={idx} className="flex items-start gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
