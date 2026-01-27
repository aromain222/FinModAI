"use client";

import React from "react";
import { cn } from "@/lib/utils";

type TerminalCardProps = {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  rightSlot?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

export function TerminalCard({ title, subtitle, rightSlot, className, children }: TerminalCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4 shadow-sm",
        className
      )}
    >
      {(title || subtitle || rightSlot) && (
        <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div className="space-y-0.5">
            {title ? <div className="text-sm font-semibold text-[var(--cb-text-primary)]">{title}</div> : null}
            {subtitle ? <div className="text-xs text-[var(--cb-text-muted)]">{subtitle}</div> : null}
          </div>
          {rightSlot}
        </div>
      )}
      {children}
    </div>
  );
}
