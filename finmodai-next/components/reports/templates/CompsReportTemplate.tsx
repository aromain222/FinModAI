"use client";

import React from "react";
import { Card } from "@/components/ui/card";

export function CompsReportTemplate({ payload }: { payload: any }) {
  const summary = payload?.summary || {};
  const target = payload?.target || {};

  const multiples = [
    { label: "EV/Revenue", value: multiple(target.evRevenue) },
    { label: "EV/EBITDA", value: multiple(target.evEbitda) },
    { label: "P/E", value: multiple(target.pe) },
  ];

  const ranges = [
    { label: "EV/Revenue Range", value: range(summary.evRevenue) },
    { label: "EV/EBITDA Range", value: range(summary.evEbitda) },
    { label: "P/E Range", value: range(summary.pe) },
  ];

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border border-[var(--cb-border-subtle)] bg-[#12161C] p-5 shadow-panel">
        <h3 className="text-lg font-semibold text-white">Target Snapshot</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {multiples.map((item) => (
            <div key={item.label} className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
              <p className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">{item.label}</p>
              <p className="text-base font-semibold text-[var(--cb-text-primary)]">{item.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="rounded-3xl border border-[var(--cb-border-subtle)] bg-[#12161C] p-5 shadow-panel">
        <h3 className="text-lg font-semibold text-white">Peer Distribution</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {ranges.map((item) => (
            <div key={item.label} className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
              <p className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">{item.label}</p>
              <p className="text-base font-semibold text-[var(--cb-text-primary)]">{item.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="rounded-3xl border border-[var(--cb-border-subtle)] bg-[#12161C] p-5 shadow-panel">
        <h3 className="text-lg font-semibold text-white">Narrative</h3>
        <p className="mt-2 text-sm text-[var(--cb-text-body)]">{payload?.commentary ?? "No commentary provided."}</p>
      </Card>
    </div>
  );
}

function multiple(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "—";
  return `${(value as number).toFixed(1)}x`;
}

function range(r: { p25?: number; p75?: number } | null | undefined) {
  if (!r) return "—";
  const lo = r.p25;
  const hi = r.p75;
  if (!Number.isFinite(lo ?? NaN) || !Number.isFinite(hi ?? NaN)) return "—";
  return `${(lo as number).toFixed(1)}x – ${(hi as number).toFixed(1)}x`;
}
