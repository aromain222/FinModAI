"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface PreviewSectionProps {
  title?: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function PreviewSection({ title, subtitle, rightSlot, children, className }: PreviewSectionProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4 shadow-sm",
        className
      )}
    >
      {(title || subtitle || rightSlot) && (
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            {title ? <p className="text-sm font-semibold text-[var(--cb-text-primary)]">{title}</p> : null}
            {subtitle ? <p className="text-xs text-[var(--cb-text-muted)]">{subtitle}</p> : null}
          </div>
          {rightSlot}
        </div>
      )}
      {children}
    </section>
  );
}
