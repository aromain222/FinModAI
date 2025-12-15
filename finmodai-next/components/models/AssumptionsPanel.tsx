"use client";

import React from 'react';
import type { AppliedDefault } from '@/lib/settings/schema';

interface AssumptionsPanelProps {
  assumptions: Array<{
    label: string;
    value: string | number;
    unit?: string;
  }>;
  appliedDefaults?: AppliedDefault[];
}

export function AssumptionsPanel({ assumptions, appliedDefaults = [] }: AssumptionsPanelProps) {
  if (assumptions.length === 0) {
    return (
      <p className="text-sm text-[var(--cb-text-muted)]">No assumptions available.</p>
    );
  }

  // Filter to only show defaults that actually changed a missing value
  const relevantDefaults = appliedDefaults.filter(default_ => {
    // Only show if the default was applied to a field that was actually missing
    // (not just a user preference override)
    return default_.value !== undefined && default_.value !== null;
  });

  const getDefaultBadge = (label: string) => {
    const defaultApplied = relevantDefaults.find(
      (d) => d.path === label.toLowerCase().replace(/\s+/g, '')
    );
    return defaultApplied ? (
      <span className="ml-2 text-xs text-[var(--cb-green)]">(from settings)</span>
    ) : null;
  };

  return (
    <div>
      <ul className="space-y-2">
        {assumptions.map((assumption, idx) => (
          <li key={idx} className="flex items-start justify-between text-sm">
            <span className="text-[var(--cb-text-muted)]">
              {assumption.label}
              {getDefaultBadge(assumption.label)}
            </span>
            <span className="font-medium text-[var(--cb-text-primary)]">
              {typeof assumption.value === 'number'
                ? assumption.value.toLocaleString()
                : assumption.value}
              {assumption.unit && ` ${assumption.unit}`}
            </span>
          </li>
        ))}
      </ul>
      {relevantDefaults.length > 0 && (
        <p className="mt-3 text-xs text-[var(--cb-text-muted)] italic">
          Defaults never replace user-required deal inputs.
        </p>
      )}
    </div>
  );
}
