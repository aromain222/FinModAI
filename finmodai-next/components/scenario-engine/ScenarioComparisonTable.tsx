"use client";

import React from "react";
import type { ScenarioOutputs } from "./types";

type Props = {
  base: ScenarioOutputs;
  scenario: ScenarioOutputs;
};

export function ScenarioComparisonTable({ base, scenario }: Props) {
  const rows = [
    { label: "Revenue CAGR", base: pct(base.revenueCagr), scenario: pct(scenario.revenueCagr) },
    { label: "EBITDA Margin (exit)", base: pct(base.ebitdaMargin), scenario: pct(scenario.ebitdaMargin) },
    { label: "Exit Multiple", base: `${base.exitMultiple.toFixed(1)}x`, scenario: `${scenario.exitMultiple.toFixed(1)}x` },
    { label: "IRR", base: pct(base.irr), scenario: pct(scenario.irr) },
    { label: "MOIC", base: `${base.moic.toFixed(2)}x`, scenario: `${scenario.moic.toFixed(2)}x` },
    { label: "Net Debt @ Exit", base: money(base.netDebtExit), scenario: money(scenario.netDebtExit) },
    { label: "Cash @ Exit", base: money(base.cashExit), scenario: money(scenario.cashExit) },
  ];

  return (
    <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--cb-text-primary)]">Base vs Scenario</p>
          <p className="text-xs text-[var(--cb-text-muted)]">Side-by-side comparison over 5-year horizon</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--cb-text-muted)]">
              <th className="py-2 pr-3">Metric</th>
              <th className="py-2 pr-3">Base</th>
              <th className="py-2 pr-3">{scenario.name}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-[var(--cb-border-subtle)]">
                <td className="py-2 pr-3 text-[var(--cb-text-primary)]">{row.label}</td>
                <td className="py-2 pr-3 text-[var(--cb-text-body)]">{row.base}</td>
                <td className="py-2 pr-3 text-[var(--cb-text-body)]">{row.scenario}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function pct(value: number) {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function money(value: number) {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}B`;
  return `${sign}$${abs.toFixed(0)}M`;
}
