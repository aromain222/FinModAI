"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export type DiagnosticItem = {
  label: string;
  status: 'available' | 'partial' | 'unavailable';
  note?: string;
};

export interface DiagnosticsPanelProps {
  coverage?: DiagnosticItem[];
  defaults?: Array<{ path: string; value: any }>;
  warnings?: string[];
  debugData?: any; // Dev-only debug drawer
  className?: string;
}

/**
 * Diagnostics Panel - Shows data coverage, applied defaults, warnings
 * 
 * Includes dev-only debug drawer (collapsed by default).
 * Consistent across all models.
 */
export function DiagnosticsPanel({
  coverage = [],
  defaults = [],
  warnings = [],
  debugData,
  className = '',
}: DiagnosticsPanelProps) {
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const isDev = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const hasContent = coverage.length > 0 || defaults.length > 0 || warnings.length > 0 || (isDev && debugData);

  if (!hasContent) {
    return null;
  }

  return (
    <Card className={`border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] ${className}`}>
      <CardHeader>
        <CardTitle className="text-base">Diagnostics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Data Coverage */}
        {coverage.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-[var(--cb-text-primary)] mb-2">
              Data Coverage
            </h4>
            <div className="space-y-1.5">
              {coverage.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--cb-text-secondary)]">
                    {item.label}
                  </span>
                  <div className="flex items-center gap-2">
                    {item.status === 'available' && (
                      <Badge variant="outline" className="border-[var(--cb-green)]/50 text-[var(--cb-green)] text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Available
                      </Badge>
                    )}
                    {item.status === 'partial' && (
                      <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400 text-xs">
                        <Info className="h-3 w-3 mr-1" />
                        Partial
                      </Badge>
                    )}
                    {item.status === 'unavailable' && (
                      <Badge variant="outline" className="border-[var(--cb-danger)]/50 text-[var(--cb-danger)] text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Unavailable
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Applied Defaults */}
        {defaults.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-[var(--cb-text-primary)] mb-2">
              Applied Defaults
            </h4>
            <div className="space-y-1 text-xs text-[var(--cb-text-secondary)]">
              {defaults.map((default_, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Badge variant="outline" className="border-[var(--cb-green)]/30 text-[var(--cb-green)] text-xs px-1.5 py-0">
                    Default
                  </Badge>
                  <span>
                    {default_.path}: <span className="font-medium">{String(default_.value)}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--cb-text-muted)] italic mt-2">
              Defaults never replace user-required deal inputs.
            </p>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-[var(--cb-text-primary)] mb-2">
              Warnings
            </h4>
            <div className="space-y-1.5">
              {warnings.map((warning, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400"
                >
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Debug Drawer (Dev Only) */}
        {isDev && debugData && (
          <div>
            <button
              onClick={() => setIsDebugOpen(!isDebugOpen)}
              className="flex items-center gap-2 text-xs text-[var(--cb-text-muted)] hover:text-[var(--cb-text-primary)]"
            >
              {isDebugOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              <span>Debug Data</span>
            </button>
            {isDebugOpen && (
              <div className="mt-2 p-3 bg-[var(--cb-surface-alt)] rounded border border-[var(--cb-border-subtle)]">
                <pre className="text-xs overflow-auto max-h-96">
                  {JSON.stringify(debugData, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
