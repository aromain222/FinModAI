"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface PreviewShellProps {
  title: string;
  subtitle?: string;
  badgeText?: string;
  ticker?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}

export function PreviewShell({
  title,
  subtitle,
  badgeText,
  ticker,
  rightSlot,
  children,
}: PreviewShellProps) {
  return (
    <div className="space-y-4 rounded-3xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-6 shadow-sm">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-[var(--cb-text-primary)]">{title}</h2>
            {badgeText ? (
              <span className="rounded-full border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-2.5 py-0.5 text-[11px] uppercase tracking-wide text-[var(--cb-text-muted)]">
                {badgeText}
              </span>
            ) : null}
            {ticker ? (
              <span className="rounded-full border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--cb-text-primary)]">
                {ticker}
              </span>
            ) : null}
          </div>
          {subtitle ? <p className="text-sm text-[var(--cb-text-muted)]">{subtitle}</p> : null}
        </div>
        {rightSlot ? <div className="flex items-center gap-2">{rightSlot}</div> : null}
      </header>
      {children}
    </div>
  );
}
