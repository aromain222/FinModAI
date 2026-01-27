"use client";

import React from "react";
import { cn } from "@/lib/utils";

export type KpiItem = {
  label: string;
  value: string;
  hint?: string;
  accent?: "positive" | "negative";
};

export function KpiGrid({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4"
        >
          <div className="text-[0.7rem] uppercase tracking-wide text-[var(--cb-text-muted)]">{item.label}</div>
          <div
            className={cn(
              "mt-1 text-xl font-semibold text-[var(--cb-text-primary)]",
              item.accent === "positive" && "text-[var(--cb-green)]",
              item.accent === "negative" && "text-red-400"
            )}
          >
            {item.value}
          </div>
          {item.hint ? <div className="text-xs text-[var(--cb-text-muted)]">{item.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}
