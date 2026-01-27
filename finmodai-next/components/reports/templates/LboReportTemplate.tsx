"use client";

import React from "react";
import { Card } from "@/components/ui/card";

export function LboReportTemplate({ payload }: { payload: any }) {
  const valuation = payload?.valuation || {};
  const returns = payload?.returns || {};
  const deal = payload?.dealTerms || {};

  const kpis = [
    { label: "Enterprise Value", value: money(valuation.enterpriseValue) },
    { label: "Equity Value", value: money(valuation.equityValue) },
    { label: "Net Debt", value: money(valuation.netDebt) },
    { label: "IRR", value: pct(returns.irr) },
    { label: "MOIC", value: multiple(returns.moic) },
  ];

  const dealRows = [
    { label: "Entry Multiple", value: multiple(deal.entryMultiple) },
    { label: "Exit Multiple", value: multiple(deal.exitMultiple) },
    { label: "Hold Period", value: years(deal.holdPeriod) },
    { label: "Leverage", value: multiple(deal.leverageMultiple) },
  ];

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border border-[var(--cb-border-subtle)] bg-[#12161C] p-5 shadow-panel">
        <h3 className="text-lg font-semibold text-white">Valuation & Returns</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
              <p className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">{kpi.label}</p>
              <p className="text-base font-semibold text-[var(--cb-text-primary)]">{kpi.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="rounded-3xl border border-[var(--cb-border-subtle)] bg-[#12161C] p-5 shadow-panel">
        <h3 className="text-lg font-semibold text-white">Deal Terms</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {dealRows.map((row) => (
            <div key={row.label} className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
              <p className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">{row.label}</p>
              <p className="text-base font-semibold text-[var(--cb-text-primary)]">{row.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="rounded-3xl border border-[var(--cb-border-subtle)] bg-[#12161C] p-5 shadow-panel">
        <h3 className="text-lg font-semibold text-white">Commentary</h3>
        <p className="mt-2 text-sm text-[var(--cb-text-body)]">
          {payload?.commentary ?? "Deal-level commentary not provided."}
        </p>
      </Card>
    </div>
  );
}

function money(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "—";
  const abs = Math.abs(value as number);
  const sign = (value as number) < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${abs.toFixed(0)}M`;
}

function pct(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "—";
  return `${((value as number) * 100).toFixed(1)}%`;
}

function multiple(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "—";
  return `${(value as number).toFixed(2)}x`;
}

function years(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "—";
  return `${value} yrs`;
}
