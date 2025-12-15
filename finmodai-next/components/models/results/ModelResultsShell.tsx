"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Edit, RefreshCw, Copy } from 'lucide-react';

export type ModelResultsShellProps = {
  title: string; // "MSFT — DCF"
  subtitle?: string;
  badges?: { label: string; tone: 'neutral' | 'success' | 'warning' }[];
  actions: {
    onDownload?: () => void;
    onEditInputs?: () => void;
    onRunAgain?: () => void;
    onDuplicate?: () => void;
  };
  kpis: React.ReactNode; // KPI strip block
  main: React.ReactNode; // main blocks (tables, bridges, preview)
  sidebar: React.ReactNode; // diagnostics, assumptions, coverage
  bottom?: React.ReactNode; // sensitivity, notes, audit trail
};

/**
 * Universal full-screen results shell for all models
 * 
 * Provides consistent layout, typography, and spacing across all model results.
 * Replaces cramped card-based layouts with a professional tear sheet experience.
 */
export function ModelResultsShell({
  title,
  subtitle,
  badges = [],
  actions,
  kpis,
  main,
  sidebar,
  bottom,
}: ModelResultsShellProps) {
  return (
    <div className="w-full max-w-none min-h-screen px-6 lg:px-10 py-8 bg-[var(--cb-background)]">
      {/* Header Row */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-[var(--cb-text-primary)] mb-2">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-[var(--cb-text-secondary)]">
              {subtitle}
            </p>
          )}
          {badges.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {badges.map((badge, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className={
                    badge.tone === 'success'
                      ? 'border-[var(--cb-green)]/50 text-[var(--cb-green)]'
                      : badge.tone === 'warning'
                      ? 'border-amber-500/50 text-amber-600 dark:text-amber-400'
                      : 'border-[var(--cb-border-subtle)] text-[var(--cb-text-secondary)]'
                  }
                >
                  {badge.label}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
          {actions.onDownload && (
            <Button
              onClick={actions.onDownload}
              className="bg-[var(--cb-green)] hover:bg-[var(--cb-green)]/90 text-white"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Excel
            </Button>
          )}
          {actions.onEditInputs && (
            <Button
              onClick={actions.onEditInputs}
              variant="outline"
              className="border-[var(--cb-border-subtle)]"
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit Inputs
            </Button>
          )}
          {actions.onRunAgain && (
            <Button
              onClick={actions.onRunAgain}
              variant="outline"
              className="border-[var(--cb-border-subtle)]"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Run Again
            </Button>
          )}
          {actions.onDuplicate && (
            <Button
              onClick={actions.onDuplicate}
              variant="outline"
              className="border-[var(--cb-border-subtle)]"
            >
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </Button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      {kpis && (
        <div className="mb-8">
          {kpis}
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Main Column (8 cols) */}
        <div className="xl:col-span-8 space-y-6">
          {main}
        </div>

        {/* Sidebar (4 cols) */}
        <div className="xl:col-span-4 space-y-6">
          {sidebar}
        </div>
      </div>

      {/* Bottom Section (full width) */}
      {bottom && (
        <div className="mt-8 pt-8 border-t border-[var(--cb-border-subtle)]">
          {bottom}
        </div>
      )}
    </div>
  );
}
