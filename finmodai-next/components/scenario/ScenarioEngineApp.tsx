"use client";

/**
 * Scenario Engine v1 – rebuilt for stress testing and scenario planning.
 * Two-column layout: left = builder (templates + levers + save/load), right = results (KPIs, charts, flags, comparison).
 * All calculations are deterministic and local; no network calls or new deps.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TemplateKey =
  | "base"
  | "downside"
  | "upside"
  | "recession"
  | "rate_shock"
  | "margin_compression"
  | "demand_drop";

type LeverDeltas = {
  growthDeltaPctPts: number;
  priceDeltaPct: number;
  volumeDeltaPct: number;
  marginDeltaPctPts: number;
  cogsDeltaPctPts: number;
  opexDeltaPctPts: number;
  nwcPctRevDeltaPts: number;
  capexPctRevDeltaPts: number;
  interestRateBpsDelta: number;
  exitMultipleDelta: number;
};

type ScenarioTemplate = {
  key: TemplateKey;
  label: string;
  description: string;
  levers: LeverDeltas;
};

type BaseInputs = {
  ticker: string;
  revenueMm: number;
  baseGrowthPct: number;
  baseMarginPct: number;
  nwcPctRevenue: number;
  capexPctRevenue: number;
  taxRatePct: number;
  interestRatePct: number;
  exitMultiple: number;
  netDebtMm: number;
  sharesOutstandingMm: number;
  years: number;
};

type YearPoint = {
  year: string;
  revenueMm: number;
  ebitdaMm: number;
  ebitdaMarginPct: number;
  fcfMm: number;
  netDebtMm: number;
  leverage: number;
};

type ScenarioOutputs = {
  name: string;
  template: TemplateKey;
  levers: LeverDeltas;
  series: YearPoint[];
  enterpriseValue: number;
  equityValue: number;
  exitEbitda: number;
  exitMultipleUsed: number;
  irrPct: number;
  moic: number;
  cumulativeFcf: number;
};

type SavedScenario = {
  id: string;
  name: string;
  template: TemplateKey;
  levers: LeverDeltas;
};

const TEMPLATES: ScenarioTemplate[] = [
  { key: "base", label: "Base", description: "Management base case with neutral levers.", levers: zeroLevers() },
  { key: "downside", label: "Downside", description: "Soft demand, modest margin pressure.", levers: { ...zeroLevers(), growthDeltaPctPts: -2, marginDeltaPctPts: -1, exitMultipleDelta: -1, interestRateBpsDelta: 50 } },
  { key: "upside", label: "Upside", description: "Stronger demand, mild margin lift.", levers: { ...zeroLevers(), growthDeltaPctPts: 2, marginDeltaPctPts: 1, exitMultipleDelta: 1, interestRateBpsDelta: -25 } },
  { key: "recession", label: "Recession", description: "Demand shock and leverage stress.", levers: { ...zeroLevers(), growthDeltaPctPts: -4, marginDeltaPctPts: -2, nwcPctRevDeltaPts: 1, capexPctRevDeltaPts: -0.5, exitMultipleDelta: -2, interestRateBpsDelta: 100 } },
  { key: "rate_shock", label: "Rate shock", description: "Higher rates and lower multiple.", levers: { ...zeroLevers(), interestRateBpsDelta: 125, exitMultipleDelta: -1 } },
  { key: "margin_compression", label: "Margin compression", description: "Pricing/COGS pressure hits margins.", levers: { ...zeroLevers(), marginDeltaPctPts: -3, cogsDeltaPctPts: 1, growthDeltaPctPts: -1 } },
  { key: "demand_drop", label: "Demand drop", description: "Volume decline, recovery later.", levers: { ...zeroLevers(), growthDeltaPctPts: -3, volumeDeltaPct: -2, marginDeltaPctPts: -1, exitMultipleDelta: -1 } },
];

const DEFAULT_BASE_INPUTS: BaseInputs = {
  ticker: "DEMO",
  revenueMm: 2000,
  baseGrowthPct: 8,
  baseMarginPct: 22,
  nwcPctRevenue: 5,
  capexPctRevenue: 3,
  taxRatePct: 22,
  interestRatePct: 6,
  exitMultiple: 10,
  netDebtMm: 500,
  sharesOutstandingMm: 250,
  years: 5,
};

function zeroLevers(): LeverDeltas {
  return {
    growthDeltaPctPts: 0,
    priceDeltaPct: 0,
    volumeDeltaPct: 0,
    marginDeltaPctPts: 0,
    cogsDeltaPctPts: 0,
    opexDeltaPctPts: 0,
    nwcPctRevDeltaPts: 0,
    capexPctRevDeltaPts: 0,
    interestRateBpsDelta: 0,
    exitMultipleDelta: 0,
  };
}

const STORAGE_KEY = "cb-scenario-engine-saved";

export function ScenarioEngineApp({ initialTicker }: { initialTicker?: string }) {
  // Builder state
  const [baseInputs, setBaseInputs] = useState<BaseInputs>({
    ...DEFAULT_BASE_INPUTS,
    ticker: initialTicker ? initialTicker.toUpperCase() : DEFAULT_BASE_INPUTS.ticker,
  });
  const [templateKey, setTemplateKey] = useState<TemplateKey>("base");
  const [leverDeltas, setLeverDeltas] = useState<LeverDeltas>(TEMPLATES[0].levers);
  const [activeScenario, setActiveScenario] = useState<ScenarioOutputs | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [selectedComparisonIds, setSelectedComparisonIds] = useState<string[]>([]);
  const [scenarioName, setScenarioName] = useState("Custom Scenario");

  // Load saved scenarios
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedScenario[];
        setSavedScenarios(parsed);
      }
    } catch (err) {
      console.warn("[scenario] failed to load saved scenarios", err);
    }
  }, []);

  // Persist saved scenarios
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedScenarios));
    } catch {
      // ignore write errors
    }
  }, [savedScenarios]);

  // Reset levers when template changes
  useEffect(() => {
    const tpl = TEMPLATES.find((t) => t.key === templateKey) ?? TEMPLATES[0];
    setLeverDeltas(tpl.levers);
  }, [templateKey]);

  const baseScenario = useMemo(
    () => computeScenarioOutputs("Base", "base", baseInputs, zeroLevers()),
    [baseInputs]
  );

  const currentScenario = useMemo(
    () => computeScenarioOutputs("Current", templateKey, baseInputs, leverDeltas),
    [baseInputs, templateKey, leverDeltas]
  );

  // Initialize active scenario
  useEffect(() => {
    if (!activeScenario) {
      setActiveScenario(currentScenario);
    }
  }, [activeScenario, currentScenario]);

  const comparisonRows = useMemo(() => {
    const selectedSaved = savedScenarios.filter((s) => selectedComparisonIds.includes(s.id));
    const mappedSaved = selectedSaved
      .map((s) => computeScenarioOutputs(s.name, s.template, baseInputs, s.levers))
      .slice(0, 2);
    const scenarios: ScenarioOutputs[] = [baseScenario, activeScenario ?? currentScenario, ...mappedSaved].slice(0, 3);

    const metrics = [
      {
        label: "Enterprise Value",
        format: formatMillions,
        values: scenarios.map((s) => s.enterpriseValue),
      },
      {
        label: "Equity Value",
        format: formatMillions,
        values: scenarios.map((s) => s.equityValue),
      },
      {
        label: "Exit EBITDA",
        format: formatMillions,
        values: scenarios.map((s) => s.exitEbitda),
      },
      {
        label: "Net Debt (exit)",
        format: formatMillions,
        values: scenarios.map((s) => s.series[s.series.length - 1]?.netDebtMm ?? 0),
      },
      {
        label: "Leverage (exit)",
        format: (v: number) => `${v.toFixed(1)}x`,
        values: scenarios.map((s) => s.series[s.series.length - 1]?.leverage ?? 0),
      },
      {
        label: "Cumulative FCF",
        format: formatMillions,
        values: scenarios.map((s) => s.cumulativeFcf),
      },
      {
        label: "IRR",
        format: (v: number) => `${(v * 100).toFixed(1)}%`,
        values: scenarios.map((s) => s.irrPct),
      },
      {
        label: "MOIC",
        format: (v: number) => `${v.toFixed(2)}x`,
        values: scenarios.map((s) => s.moic),
      },
    ];

    return { scenarios, metrics };
  }, [activeScenario, baseScenario, currentScenario, savedScenarios, selectedComparisonIds, baseInputs]);

  const riskFlags = useMemo(() => {
    const ref = baseScenario;
    const cur = activeScenario ?? currentScenario;
    const minFcf = Math.min(...cur.series.map((p) => p.fcfMm));
    const maxLeverage = Math.max(...cur.series.map((p) => p.leverage));
    const marginDelta = cur.series[cur.series.length - 1]?.ebitdaMarginPct - ref.series[ref.series.length - 1]?.ebitdaMarginPct;
    const evDeltaPct = ref.enterpriseValue === 0 ? 0 : (cur.enterpriseValue - ref.enterpriseValue) / ref.enterpriseValue;
    return [
      minFcf < 0 ? "Liquidity risk: negative FCF in the horizon." : null,
      maxLeverage > 4.5 ? "Leverage risk: Net debt / EBITDA above 4.5x." : null,
      marginDelta < -3 ? "Margin compression risk: EBITDA margin drops >3 pp vs base." : null,
      Math.abs(evDeltaPct) > 0.15 ? "Valuation sensitivity: EV moves >15% vs base." : null,
    ].filter(Boolean) as string[];
  }, [activeScenario, currentScenario, baseScenario]);

  const handleLeverChange = (key: keyof LeverDeltas, value: number) => {
    setLeverDeltas((prev) => ({ ...prev, [key]: value }));
  };

  const handleRunScenario = () => {
    setActiveScenario(currentScenario);
  };

  const handleSaveScenario = () => {
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
    const entry: SavedScenario = { id, name: scenarioName || "Saved Scenario", template: templateKey, levers: leverDeltas };
    setSavedScenarios((prev) => [entry, ...prev].slice(0, 10));
    if (!selectedComparisonIds.includes(id)) {
      setSelectedComparisonIds((prev) => [...prev, id].slice(0, 2));
    }
  };

  const handleDeleteSaved = (id: string) => {
    setSavedScenarios((prev) => prev.filter((s) => s.id !== id));
    setSelectedComparisonIds((prev) => prev.filter((v) => v !== id));
  };

  const toggleComparison = (id: string) => {
    setSelectedComparisonIds((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= 2) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[360px,1fr]">
      {/* Builder Sidebar */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">Model</p>
              <h3 className="text-lg font-semibold text-[var(--cb-text-primary)]">Scenario Builder</h3>
            </div>
            <span className="rounded-full bg-[var(--cb-surface-alt)] px-3 py-1 text-xs text-[var(--cb-text-muted)]">Demo mode</span>
          </div>
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--cb-text-muted)]">Ticker</Label>
              <Input
                value={baseInputs.ticker}
                onChange={(e) => setBaseInputs((prev) => ({ ...prev, ticker: e.target.value.toUpperCase() }))}
                placeholder="DEMO"
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberInput
                label="Base revenue (mm)"
                value={baseInputs.revenueMm}
                onChange={(v) => setBaseInputs((prev) => ({ ...prev, revenueMm: v }))}
                min={100}
              />
              <NumberInput
                label="Base growth %"
                value={baseInputs.baseGrowthPct}
                onChange={(v) => setBaseInputs((prev) => ({ ...prev, baseGrowthPct: v }))}
                step={0.5}
              />
              <NumberInput
                label="EBITDA margin %"
                value={baseInputs.baseMarginPct}
                onChange={(v) => setBaseInputs((prev) => ({ ...prev, baseMarginPct: v }))}
                step={0.5}
              />
              <NumberInput
                label="Net debt (mm)"
                value={baseInputs.netDebtMm}
                onChange={(v) => setBaseInputs((prev) => ({ ...prev, netDebtMm: v }))}
              />
              <NumberInput
                label="Interest rate %"
                value={baseInputs.interestRatePct}
                onChange={(v) => setBaseInputs((prev) => ({ ...prev, interestRatePct: v }))}
                step={0.25}
              />
              <NumberInput
                label="Exit multiple (x)"
                value={baseInputs.exitMultiple}
                onChange={(v) => setBaseInputs((prev) => ({ ...prev, exitMultiple: v }))}
                step={0.25}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[var(--cb-text-primary)]">Scenario Templates</h4>
            <span className="text-[11px] text-[var(--cb-text-muted)]">Base / Downside / Upside</span>
          </div>
          <div className="space-y-2">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.key}
                onClick={() => setTemplateKey(tpl.key)}
                className={cn(
                  "w-full rounded-xl border px-3 py-2 text-left transition",
                  templateKey === tpl.key
                    ? "border-[var(--cb-green)] bg-[var(--cb-surface-alt)]"
                    : "border-[var(--cb-border-subtle)] hover:border-[var(--cb-green)]/60"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[var(--cb-text-primary)]">{tpl.label}</span>
                  {templateKey === tpl.key && <span className="text-[11px] text-[var(--cb-green)]">Selected</span>}
                </div>
                <p className="text-[12px] text-[var(--cb-text-muted)]">{tpl.description}</p>
              </button>
            ))}
          </div>
        </div>

        <LeverPanel
          leverDeltas={leverDeltas}
          onChange={handleLeverChange}
          onReset={() => {
            const tpl = TEMPLATES.find((t) => t.key === templateKey) ?? TEMPLATES[0];
            setLeverDeltas(tpl.levers);
          }}
          templateKey={templateKey}
        />

        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-5 shadow-sm space-y-3">
          <Button className="w-full" onClick={handleRunScenario}>
            Run scenario
          </Button>
          <div className="space-y-2">
            <Label className="text-xs text-[var(--cb-text-muted)]">Save scenario</Label>
            <div className="flex gap-2">
              <Input
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)]"
                placeholder="Scenario name"
              />
              <Button variant="outline" onClick={handleSaveScenario}>
                Save
              </Button>
            </div>
          </div>
          {savedScenarios.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">Saved</p>
              <div className="space-y-2">
                {savedScenarios.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-[var(--cb-text-primary)]">{s.name}</p>
                      <p className="text-[11px] text-[var(--cb-text-muted)]">{s.template}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedComparisonIds.includes(s.id)}
                        onChange={() => toggleComparison(s.id)}
                        className="accent-[var(--cb-green)]"
                        title="Include in comparison"
                      />
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteSaved(s.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results Panel */}
      <div className="space-y-4">
        <KpiStrip base={baseScenario} scenario={activeScenario ?? currentScenario} />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <ChartCard title="Revenue & EBITDA" subtitle="Path vs scenario">
            <MultiLineChart
              data={mergeSeries(baseScenario.series, activeScenario ?? currentScenario, "revenueMm", "ebitdaMm")}
              lines={[
                { dataKey: "base_revenue", label: "Revenue (Base)", color: "#6b7280" },
                { dataKey: "scenario_revenue", label: "Revenue (Scenario)", color: "var(--cb-green)" },
                { dataKey: "base_ebitda", label: "EBITDA (Base)", color: "#94a3b8", strokeDasharray: "4 4" },
                { dataKey: "scenario_ebitda", label: "EBITDA (Scenario)", color: "#22d3ee", strokeDasharray: "4 2" },
              ]}
              formatY={formatMillionsShort}
            />
          </ChartCard>
          <ChartCard title="Free Cash Flow" subtitle="FCF path with working capital & capex deltas">
            <MultiLineChart
              data={mergeSeries(baseScenario.series, activeScenario ?? currentScenario, "fcfMm")}
              lines={[
                { dataKey: "base_value", label: "FCF (Base)", color: "#94a3b8" },
                { dataKey: "scenario_value", label: "FCF (Scenario)", color: "var(--cb-green)" },
              ]}
              formatY={formatMillionsShort}
            />
          </ChartCard>
          <ChartCard title="Net Debt / Leverage" subtitle="Debt path and leverage ratio">
            <MultiLineChart
              data={mergeSeries(baseScenario.series, activeScenario ?? currentScenario, "netDebtMm", "leverage")}
              lines={[
                { dataKey: "base_netDebtMm", label: "Net Debt (Base)", color: "#94a3b8" },
                { dataKey: "scenario_netDebtMm", label: "Net Debt (Scenario)", color: "var(--cb-green)" },
                { dataKey: "base_leverage", label: "Leverage (Base)", color: "#a78bfa", strokeDasharray: "3 3" },
                { dataKey: "scenario_leverage", label: "Leverage (Scenario)", color: "#22d3ee", strokeDasharray: "3 3" },
              ]}
              formatY={(v) => (Math.abs(v) < 40 ? `${v.toFixed(1)}x` : formatMillionsShort(v))}
            />
          </ChartCard>
        </div>

        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-lg font-semibold text-[var(--cb-text-primary)]">Risk Flags</h4>
              <p className="text-sm text-[var(--cb-text-muted)]">Scenario-specific warnings based on FCF, leverage, and valuation moves.</p>
            </div>
          </div>
          {riskFlags.length === 0 ? (
            <p className="text-sm text-[var(--cb-text-muted)]">No immediate risks detected for this scenario.</p>
          ) : (
            <ul className="space-y-2 text-sm text-[var(--cb-text-primary)]">
              {riskFlags.map((flag, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-[var(--cb-green)]" />
                  <span>{flag}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-lg font-semibold text-[var(--cb-text-primary)]">Scenario Comparison</h4>
              <p className="text-sm text-[var(--cb-text-muted)]">Select up to three scenarios to compare side-by-side.</p>
            </div>
          </div>
          <ComparisonTable scenarios={comparisonRows.scenarios} metrics={comparisonRows.metrics} />
        </div>
      </div>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  step = 1,
  min,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-[var(--cb-text-muted)]">{label}</Label>
      <Input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)]"
      />
    </div>
  );
}

function LeverPanel({
  leverDeltas,
  onChange,
  onReset,
  templateKey,
}: {
  leverDeltas: LeverDeltas;
  onChange: (key: keyof LeverDeltas, value: number) => void;
  onReset: () => void;
  templateKey: TemplateKey;
}) {
  const leverConfigs: Array<{
    key: keyof LeverDeltas;
    label: string;
    min: number;
    max: number;
    step: number;
    suffix: string;
    group: "Demand" | "Profitability" | "Cash" | "Financing";
    defaultValue: number;
  }> = [
    { key: "growthDeltaPctPts", label: "Revenue growth delta", min: -6, max: 6, step: 0.5, suffix: "pp", group: "Demand", defaultValue: 0 },
    { key: "priceDeltaPct", label: "Price delta", min: -5, max: 5, step: 0.5, suffix: "%", group: "Demand", defaultValue: 0 },
    { key: "volumeDeltaPct", label: "Volume delta", min: -5, max: 5, step: 0.5, suffix: "%", group: "Demand", defaultValue: 0 },
    { key: "marginDeltaPctPts", label: "EBITDA margin delta", min: -5, max: 5, step: 0.5, suffix: "pp", group: "Profitability", defaultValue: 0 },
    { key: "cogsDeltaPctPts", label: "COGS delta", min: -3, max: 3, step: 0.25, suffix: "pp", group: "Profitability", defaultValue: 0 },
    { key: "opexDeltaPctPts", label: "Opex delta", min: -3, max: 3, step: 0.25, suffix: "pp", group: "Profitability", defaultValue: 0 },
    { key: "nwcPctRevDeltaPts", label: "NWC % rev delta", min: -2, max: 3, step: 0.25, suffix: "pp", group: "Cash", defaultValue: 0 },
    { key: "capexPctRevDeltaPts", label: "Capex % rev delta", min: -2, max: 2, step: 0.25, suffix: "pp", group: "Cash", defaultValue: 0 },
    { key: "interestRateBpsDelta", label: "Interest rate delta", min: -150, max: 200, step: 25, suffix: "bps", group: "Financing", defaultValue: 0 },
    { key: "exitMultipleDelta", label: "Exit multiple delta", min: -3, max: 3, step: 0.25, suffix: "x", group: "Financing", defaultValue: 0 },
  ];

  const grouped = ["Demand", "Profitability", "Cash", "Financing"] as const;

  return (
    <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-[var(--cb-text-primary)]">Levers</h4>
          <p className="text-xs text-[var(--cb-text-muted)]">Adjust per template; defaults shown per lever.</p>
        </div>
        <Button size="sm" variant="outline" onClick={onReset}>
          Reset to {templateKey}
        </Button>
      </div>
      <div className="space-y-4">
        {grouped.map((group) => (
          <div key={group} className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">{group}</p>
            <div className="space-y-3">
              {leverConfigs
                .filter((c) => c.group === group)
                .map((config) => (
                  <div key={config.key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-[var(--cb-text-muted)]">
                      <span>{config.label}</span>
                      <span className="text-[11px] text-[var(--cb-text-muted)]">
                        Default {config.defaultValue}{config.suffix} · Now{" "}
                        <span className="text-[var(--cb-text-primary)]">{leverDeltas[config.key]}{config.suffix}</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min={config.min}
                      max={config.max}
                      step={config.step}
                      value={leverDeltas[config.key]}
                      onChange={(e) => onChange(config.key, Number(e.target.value))}
                      className="w-full accent-[var(--cb-green)]"
                    />
                    <div className="flex justify-between text-[11px] text-[var(--cb-text-muted)]">
                      <span>{config.min}{config.suffix}</span>
                      <span>{config.max}{config.suffix}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiStrip({ base, scenario }: { base: ScenarioOutputs; scenario: ScenarioOutputs }) {
  const metrics = [
    {
      label: "Enterprise Value",
      base: base.enterpriseValue,
      value: scenario.enterpriseValue,
      formatter: formatMillions,
    },
    {
      label: "Equity Value",
      base: base.equityValue,
      value: scenario.equityValue,
      formatter: formatMillions,
    },
    {
      label: "Net Debt (exit)",
      base: base.series[base.series.length - 1]?.netDebtMm ?? 0,
      value: scenario.series[scenario.series.length - 1]?.netDebtMm ?? 0,
      formatter: formatMillions,
    },
    {
      label: "IRR (est.)",
      base: base.irrPct,
      value: scenario.irrPct,
      formatter: (v: number) => `${(v * 100).toFixed(1)}%`,
    },
    {
      label: "MOIC",
      base: base.moic,
      value: scenario.moic,
      formatter: (v: number) => `${v.toFixed(2)}x`,
    },
    {
      label: "Cumulative FCF",
      base: base.cumulativeFcf,
      value: scenario.cumulativeFcf,
      formatter: formatMillions,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4 shadow-sm md:grid-cols-3 xl:grid-cols-6">
      {metrics.map((metric) => {
        const delta = metric.base === 0 ? 0 : (metric.value - metric.base) / Math.abs(metric.base);
        return (
          <div key={metric.label} className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">{metric.label}</p>
            <p className="text-lg font-semibold text-[var(--cb-text-primary)]">{metric.formatter(metric.value)}</p>
            <p className={cn("text-xs", delta >= 0 ? "text-[var(--cb-green)]" : "text-red-400")}>
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(1)}% vs Base
            </p>
          </div>
        );
      })}
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4 shadow-sm space-y-2">
      <div>
        <p className="text-sm font-semibold text-[var(--cb-text-primary)]">{title}</p>
        {subtitle && <p className="text-xs text-[var(--cb-text-muted)]">{subtitle}</p>}
      </div>
      <div className="h-64">{children}</div>
    </div>
  );
}

function MultiLineChart({
  data,
  lines,
  formatY,
}: {
  data: any[];
  lines: Array<{ dataKey: string; label: string; color: string; strokeDasharray?: string }>;
  formatY: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
        <XAxis dataKey="year" tick={{ fontSize: 11, fill: "var(--cb-text-muted)" }} />
        <YAxis tick={{ fontSize: 11, fill: "var(--cb-text-muted)" }} tickFormatter={formatY} />
        <Tooltip
          formatter={(value: number) => formatY(value)}
          contentStyle={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)" }}
        />
        <Legend />
        {lines.map((line) => (
          <Line
            key={line.dataKey}
            type="monotone"
            dataKey={line.dataKey}
            name={line.label}
            stroke={line.color}
            strokeWidth={2}
            dot={false}
            strokeDasharray={line.strokeDasharray}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function ComparisonTable({ scenarios, metrics }: { scenarios: ScenarioOutputs[]; metrics: { label: string; format: (v: number) => string; values: number[] }[] }) {
  if (scenarios.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-[var(--cb-text-muted)]">
            <th className="py-2 pr-3">Metric</th>
            {scenarios.map((s) => (
              <th key={s.name} className="py-2 pr-3 font-semibold text-[var(--cb-text-primary)]">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => (
            <tr key={metric.label} className="border-t border-[var(--cb-border-subtle)]">
              <td className="py-2 pr-3 text-[var(--cb-text-primary)]">{metric.label}</td>
              {metric.values.slice(0, scenarios.length).map((val, idx) => (
                <td key={idx} className="py-2 pr-3 text-[var(--cb-text-body)]">
                  {metric.format(val)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Core computation
function computeScenarioOutputs(
  name: string,
  template: TemplateKey,
  base: BaseInputs,
  levers: LeverDeltas
): ScenarioOutputs {
  const years = Math.max(3, Math.min(7, base.years));
  const growthPct = base.baseGrowthPct + levers.growthDeltaPctPts;
  const marginPct = base.baseMarginPct + levers.marginDeltaPctPts - levers.cogsDeltaPctPts - levers.opexDeltaPctPts;
  const nwcPct = base.nwcPctRevenue + levers.nwcPctRevDeltaPts;
  const capexPct = base.capexPctRevenue + levers.capexPctRevDeltaPts;
  const interestPct = base.interestRatePct + levers.interestRateBpsDelta / 100;
  const exitMultiple = base.exitMultiple + levers.exitMultipleDelta;

  const series: YearPoint[] = [];
  let revenue = base.revenueMm;
  let netDebt = base.netDebtMm;
  let cumulativeFcf = 0;

  for (let year = 1; year <= years; year++) {
    const demandLift = (levers.priceDeltaPct + levers.volumeDeltaPct) / 100;
    revenue = revenue * (1 + (growthPct / 100) + demandLift);
    const ebitdaMargin = clamp(marginPct / 100, 0.05, 0.6);
    const ebitda = revenue * ebitdaMargin;
    const capex = revenue * (capexPct / 100);
    const nwcInvestment = revenue * (nwcPct / 100) - (series[year - 2]?.revenueMm ?? revenue) * (nwcPct / 100);
    const interest = Math.max(netDebt, 0) * (interestPct / 100);
    const taxesBase = ebitda - capex - nwcInvestment - interest;
    const taxes = taxesBase > 0 ? taxesBase * (base.taxRatePct / 100) : 0;
    const fcf = ebitda - capex - nwcInvestment - interest - taxes;
    cumulativeFcf += fcf;
    netDebt = Math.max(netDebt - fcf, 0);
    const leverage = ebitda > 0 ? netDebt / ebitda : 0;

    series.push({
      year: `Y${year}`,
      revenueMm: revenue,
      ebitdaMm: ebitda,
      ebitdaMarginPct: ebitdaMargin * 100,
      fcfMm: fcf,
      netDebtMm: netDebt,
      leverage,
    });
  }

  const exitEbitda = series[series.length - 1]?.ebitdaMm ?? 0;
  const enterpriseValue = exitEbitda * Math.max(exitMultiple, 0);
  const equityValue = enterpriseValue - netDebt;
  const startingEquity = base.exitMultiple * (base.revenueMm * (base.baseMarginPct / 100)) - base.netDebtMm;
  const moic = startingEquity > 0 ? equityValue / startingEquity : 1;
  const irrPct = moic > 0 ? Math.pow(moic, 1 / years) - 1 : 0;

  return {
    name,
    template,
    levers,
    series,
    enterpriseValue,
    equityValue,
    exitEbitda,
    exitMultipleUsed: exitMultiple,
    irrPct,
    moic,
    cumulativeFcf,
  };
}

function mergeSeries(
  base: YearPoint[],
  scenario: YearPoint[],
  primaryKey: keyof YearPoint,
  secondaryKey?: keyof YearPoint
) {
  return base.map((point, idx) => ({
    year: point.year,
    ...(secondaryKey
      ? {
          [`base_${primaryKey}`]: point[primaryKey],
          [`scenario_${primaryKey}`]: scenario[idx]?.[primaryKey] ?? null,
          [`base_${secondaryKey}`]: point[secondaryKey],
          [`scenario_${secondaryKey}`]: scenario[idx]?.[secondaryKey] ?? null,
        }
      : {
          base_value: point[primaryKey],
          scenario_value: scenario[idx]?.[primaryKey] ?? null,
        }),
  }));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatMillions(value: number) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}B`;
  return `${sign}$${abs.toFixed(0)}M`;
}

function formatMillionsShort(value: number) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}B`;
  if (abs >= 1) return `${sign}${abs.toFixed(0)}M`;
  return `${sign}${abs.toFixed(1)}M`;
}
