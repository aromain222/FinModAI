"use client";

import React from "react";
import type { ScenarioOutputs } from "./types";

type ScenarioResultsPanelProps = {
  base: ScenarioOutputs;
  scenario: ScenarioOutputs;
};

const CARD_CLASSES =
  "rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4 shadow-sm";

export function ScenarioResultsPanel({ base, scenario }: ScenarioResultsPanelProps) {
  const kpis = [
    { label: "IRR", value: pct(scenario.irr), delta: scenario.irr - base.irr },
    { label: "MOIC", value: `${scenario.moic.toFixed(2)}x`, delta: scenario.moic - base.moic },
    { label: "Exit Equity Value", value: money(scenario.exitEquityValue), delta: scenario.exitEquityValue - base.exitEquityValue },
    { label: "Net Debt @ Exit", value: money(scenario.netDebtExit), delta: base.netDebtExit - scenario.netDebtExit },
  ];

  const flags: string[] = [];
  if (scenario.minCashBreach) flags.push("Min cash breached in forecast");
  if (scenario.covenantStress) flags.push("Leverage or coverage stress detected");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`${CARD_CLASSES}`}>
            <p className="text-[0.7rem] uppercase tracking-wide text-[var(--cb-text-muted)]">{kpi.label}</p>
            <p className="mt-1 text-xl font-semibold text-[var(--cb-text-primary)]">{kpi.value}</p>
            <p className={`text-xs ${kpi.delta >= 0 ? "text-[var(--cb-green)]" : "text-red-400"}`}>
              {kpi.delta >= 0 ? "▲" : "▼"} {fmtDelta(kpi.label, kpi.delta)}
            </p>
          </div>
        ))}
      </div>
      {flags.length > 0 && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-200">
          <p className="font-semibold text-red-200">Risk Flags</p>
          <ul className="list-disc list-inside space-y-1">
            {flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </div>
      )}
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

function fmtDelta(label: string, delta: number) {
  if (label === "MOIC") return `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}x vs base`;
  if (label === "IRR") return `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}pp vs base`;
  return `${delta >= 0 ? "+" : ""}${money(delta).replace("$", "")} vs base`;
}
