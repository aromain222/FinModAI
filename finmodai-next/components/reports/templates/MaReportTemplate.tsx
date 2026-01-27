"use client";

import React from "react";
import { Card } from "@/components/ui/card";

export function MaReportTemplate({ payload }: { payload: any }) {
  const consideration = payload?.consideration || {};
  const eps = payload?.epsImpact || {};
  const synergies = payload?.synergies || {};

  const rows = [
    { label: "Cash %", value: pct(consideration.cashPct) },
    { label: "Stock %", value: pct(consideration.stockPct) },
    { label: "New Shares Issued", value: numberFmt(payload?.newSharesIssued, "M") },
    { label: "Pro Forma Shares", value: numberFmt(payload?.proFormaShares, "M") },
  ];

  const epsRows = [
    { label: "Standalone EPS", value: money(eps.standalone) },
    { label: "Pro Forma EPS", value: money(eps.proForma) },
    { label: "Accretion / Dilution", value: pct(eps.accretionPct) },
  ];

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border border-[var(--cb-border-subtle)] bg-[#12161C] p-5 shadow-panel">
        <h3 className="text-lg font-semibold text-white">Consideration & Share Impact</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
              <p className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">{row.label}</p>
              <p className="text-base font-semibold text-[var(--cb-text-primary)]">{row.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="rounded-3xl border border-[var(--cb-border-subtle)] bg-[#12161C] p-5 shadow-panel">
        <h3 className="text-lg font-semibold text-white">EPS Impact</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {epsRows.map((row) => (
            <div key={row.label} className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
              <p className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">{row.label}</p>
              <p className="text-base font-semibold text-[var(--cb-text-primary)]">{row.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="rounded-3xl border border-[var(--cb-border-subtle)] bg-[#12161C] p-5 shadow-panel">
        <h3 className="text-lg font-semibold text-white">Synergies & Commentary</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
            <p className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">Cost Synergies</p>
            <p className="text-base font-semibold text-[var(--cb-text-primary)]">{money(synergies.cost)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
            <p className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">Revenue Synergies</p>
            <p className="text-base font-semibold text-[var(--cb-text-primary)]">{money(synergies.revenue)}</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-[var(--cb-text-body)]">{payload?.commentary ?? "No commentary provided."}</p>
      </Card>
    </div>
  );
}

function pct(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "—";
  return `${((value as number) * 100).toFixed(1)}%`;
}

function numberFmt(value: number | null | undefined, suffix: string) {
  if (!Number.isFinite(value ?? NaN)) return "—";
  return `${(value as number).toFixed(1)}${suffix}`;
}

function money(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "—";
  const abs = Math.abs(value as number);
  const sign = (value as number) < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${abs.toFixed(0)}M`;
}
