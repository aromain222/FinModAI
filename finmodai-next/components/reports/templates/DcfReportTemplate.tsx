"use client";

import React from "react";
import { Card } from "@/components/ui/card";

export function DcfReportTemplate({ payload }: { payload: any }) {
  const valuation = payload?.valuation || {};
  const assumptions = payload?.assumptions || {};
  const bridge = payload?.bridge || {};

  const rows = [
    { label: "Implied Value / Share", value: formatMoney(valuation.impliedValuePerShare) },
    { label: "Enterprise Value", value: formatMoney(valuation.enterpriseValue) },
    { label: "Equity Value", value: formatMoney(valuation.equityValue) },
    { label: "Upside / Downside", value: formatPct(valuation.upsideDownside) },
  ];

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border border-[var(--cb-border-subtle)] bg-[#12161C] p-5 shadow-panel">
        <h3 className="text-lg font-semibold text-white">Valuation Summary</h3>
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
        <h3 className="text-lg font-semibold text-white">Key Assumptions</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Assumption label="WACC" value={formatPct(assumptions.wacc)} />
          <Assumption label="Terminal Growth" value={formatPct(assumptions.terminalGrowth)} />
          <Assumption label="Forecast Years" value={assumptions.forecastYears ?? "—"} />
        </div>
      </Card>

      <Card className="rounded-3xl border border-[var(--cb-border-subtle)] bg-[#12161C] p-5 shadow-panel">
        <h3 className="text-lg font-semibold text-white">Valuation Bridge</h3>
        <div className="mt-3 space-y-2 text-sm text-[var(--cb-text-body)]">
          <Row label="PV of FCF" value={formatMoney(bridge.pvOfFCF)} />
          <Row label="PV of Terminal" value={formatMoney(bridge.pvOfTerminalValue)} />
          <Row label="Net Debt" value={formatMoney(bridge.netDebt)} />
        </div>
      </Card>
    </div>
  );
}

function Assumption({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
      <p className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">{label}</p>
      <p className="text-base font-semibold text-[var(--cb-text-primary)]">{value ?? "—"}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] px-3 py-2">
      <span className="text-[var(--cb-text-muted)]">{label}</span>
      <span className="font-semibold text-[var(--cb-text-primary)]">{value}</span>
    </div>
  );
}

function formatMoney(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "—";
  const abs = Math.abs(value as number);
  const sign = (value as number) < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${abs.toFixed(0)}M`;
}

function formatPct(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "—";
  return `${(value as number * 100).toFixed(1)}%`;
}
