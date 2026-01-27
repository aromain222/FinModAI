"use client";

import React from "react";
import type { ScenarioDeltas, ScenarioName } from "./types";

type SidebarProps = {
  activeScenario: ScenarioName;
  deltas: ScenarioDeltas;
  onSelectScenario: (name: ScenarioName) => void;
  onChangeDelta: (key: keyof ScenarioDeltas, value: number) => void;
  onPreset: (key: "Recession" | "Soft Landing" | "Bull") => void;
  onReset: () => void;
};

const BUTTON_CLASSES =
  "rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] px-3 py-2 text-sm text-[var(--cb-text-primary)] hover:border-[var(--cb-green)] transition";

export function ScenarioSidebar({
  activeScenario,
  deltas,
  onSelectScenario,
  onChangeDelta,
  onPreset,
  onReset,
}: SidebarProps) {
  const controls: Array<{ key: keyof ScenarioDeltas; label: string; min: number; max: number; step: number; suffix: string }> = [
    { key: "revenueGrowthDelta", label: "Revenue growth Δ (pp)", min: -6, max: 6, step: 0.5, suffix: "pp" },
    { key: "ebitdaMarginDelta", label: "EBITDA margin Δ (pp)", min: -5, max: 5, step: 0.5, suffix: "pp" },
    { key: "exitMultipleDelta", label: "Exit multiple Δ (turns)", min: -3, max: 3, step: 0.25, suffix: "x" },
    { key: "interestRateDeltaBps", label: "Interest rate Δ (bps)", min: -200, max: 200, step: 25, suffix: "bps" },
    { key: "leverageDelta", label: "Leverage Δ (turns)", min: -1.5, max: 1.5, step: 0.1, suffix: "x" },
  ];

  return (
    <aside className="space-y-4 rounded-3xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">Scenario</p>
          <h3 className="text-lg font-semibold text-[var(--cb-text-primary)]">Controls</h3>
        </div>
        <button
          className="text-xs text-[var(--cb-text-muted)] underline-offset-4 hover:text-[var(--cb-text-primary)]"
          onClick={onReset}
        >
          Reset to Base
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["Base", "Downside", "Upside", "Custom"] as ScenarioName[]).map((name) => (
          <button
            key={name}
            className={`${BUTTON_CLASSES} ${activeScenario === name ? "border-[var(--cb-green)] bg-[var(--cb-green)]/5" : ""}`}
            onClick={() => onSelectScenario(name)}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">Presets</p>
        <div className="flex flex-wrap gap-2">
          {(["Recession", "Soft Landing", "Bull"] as const).map((preset) => (
            <button
              key={preset}
              className={BUTTON_CLASSES}
              onClick={() => onPreset(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {controls.map((control) => (
          <div key={control.key} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[var(--cb-text-muted)]">
              <span>{control.label}</span>
              <span className="text-[var(--cb-text-primary)]">
                {deltas[control.key]} {control.suffix}
              </span>
            </div>
            <input
              type="range"
              min={control.min}
              max={control.max}
              step={control.step}
              value={deltas[control.key]}
              onChange={(e) => onChangeDelta(control.key, Number(e.target.value))}
              className="w-full accent-[var(--cb-green)]"
            />
            <div className="flex justify-between text-[11px] text-[var(--cb-text-muted)]">
              <span>
                {control.min}
                {control.suffix}
              </span>
              <span>
                {control.max}
                {control.suffix}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3 text-xs text-[var(--cb-text-muted)]">
        <p className="font-semibold text-[var(--cb-text-primary)]">Demo Data</p>
        <p>Using demo baseline with 5-year horizon. Adjust deltas to stress the model; outputs are computed instantly in-browser.</p>
      </div>
    </aside>
  );
}
