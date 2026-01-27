"use client";

import { CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ModelChecksPreview } from '@/lib/models/outputTypes';

type CheckEntry = {
  key: keyof ModelChecksPreview;
  label: string;
};

export function ModelChecksSummary({ checks, entries }: { checks?: ModelChecksPreview; entries: CheckEntry[] }) {
  if (!checks || entries.length === 0) return null;

  const relevantEntries = entries.filter((entry) => typeof checks[entry.key] !== 'undefined');
  if (relevantEntries.length === 0) return null;

  const issues = checks.issues ?? [];

  return (
    <div className="mb-4 rounded-md border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--cb-text-primary)]">Model Checks</h3>
        {checks.safeMode ? (
          <Badge variant="outline" className="border-amber-500/30 text-amber-200">
            Safe Mode
          </Badge>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {relevantEntries.map((entry) => {
          const passed = Boolean(checks[entry.key]);
          return (
            <div key={entry.key} className="flex items-center gap-2 text-xs text-[var(--cb-text-muted)]">
              {passed ? (
                <CheckCircle2 className="h-4 w-4 text-[var(--cb-green)]" />
              ) : (
                <XCircle className="h-4 w-4 text-[var(--cb-danger)]" />
              )}
              <span className="font-medium text-[var(--cb-text-primary)]">{entry.label}</span>
            </div>
          );
        })}
      </div>
      {issues.length > 0 && (
        <div className="mt-3 text-[var(--cb-text-muted)] text-[0.7rem]">
          <div className="font-semibold text-[var(--cb-text-secondary)]">Issues:</div>
          <ul className="list-disc list-inside">
            {issues.slice(0, 3).map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
            {issues.length > 3 && <li>...and {issues.length - 3} more</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
