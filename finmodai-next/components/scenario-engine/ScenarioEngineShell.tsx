"use client";

import React, { useMemo, useState } from "react";
import { ScenarioSidebar } from "./ScenarioSidebar";
import { ScenarioResultsPanel } from "./ScenarioResultsPanel";
import { ScenarioCharts } from "./ScenarioCharts";
import { ScenarioComparisonTable } from "./ScenarioComparisonTable";
import type { ScenarioDeltas, ScenarioName, ScenarioOutputs, ScenarioSeriesPoint } from "./types";

const YEARS = 5;

const BASELINE = {
  ticker: "DEMO",
  revenue: 600, // $MM
  growth: 0.08,
  ebitdaMargin: 0.24,
  capexPct: 0.03,
  nwcPct: 0.05,
  taxRate: 0.24,
  interestRate: 0.06,
  exitMultiple: 10,
  leverage: 3.5,
  netDebt: 350, // $MM
  cash: 50, // $MM
  minCash: 20, // $MM
};

const ZERO_DELTAS: ScenarioDeltas = {
  revenueGrowthDelta: 0,
  ebitdaMarginDelta: 0,
  exitMultipleDelta: 0,
  interestRateDeltaBps: 0,
  leverageDelta: 0,
};

const PRESETS: Record<string, ScenarioDeltas> = {
  Recession: { revenueGrowthDelta: -4, ebitdaMarginDelta: -2, exitMultipleDelta: -1.5, interestRateDeltaBps: 150, leverageDelta: -0.5, macroPreset: "Recession" },
  "Soft Landing": { revenueGrowthDelta: -1, ebitdaMarginDelta: -0.5, exitMultipleDelta: -0.5, interestRateDeltaBps: 50, leverageDelta: 0, macroPreset: "Soft Landing" },
  Bull: { revenueGrowthDelta: 2, ebitdaMarginDelta: 1, exitMultipleDelta: 1, interestRateDeltaBps: -50, leverageDelta: 0.25, macroPreset: "Bull" },
};

type ScenarioEngineShellProps = {
  companyName?: string;
  ticker?: string;
  modelType?: string;
};

export function ScenarioEngineShell({ companyName, ticker, modelType }: ScenarioEngineShellProps) {
  const [activeScenarioName, setActiveScenarioName] = useState<ScenarioName>("Base");
  const [deltas, setDeltas] = useState<ScenarioDeltas>(ZERO_DELTAS);

  const baseOutputs = useMemo(() => runScenario("Base", ZERO_DELTAS), []);
  const scenarioOutputs = useMemo(
    () => runScenario(activeScenarioName, deltas),
    [activeScenarioName, deltas]
  );

  const handleSelectScenario = (name: ScenarioName) => {
    setActiveScenarioName(name);
    if (name === "Base") {
      setDeltas(ZERO_DELTAS);
    } else if (name === "Downside") {
      setDeltas(PRESETS["Recession"]);
    } else if (name === "Upside") {
      setDeltas(PRESETS["Bull"]);
    }
  };

  const handlePreset = (key: keyof typeof PRESETS) => {
    setActiveScenarioName("Custom");
    setDeltas(PRESETS[key]);
  };

  const handleDeltaChange = (key: keyof ScenarioDeltas, value: number) => {
    setActiveScenarioName("Custom");
    setDeltas((prev) => ({ ...prev, [key]: value }));
  };

  const chartsData = useMemo(() => {
    return {
      ebitda: mergeSeries(baseOutputs.series, scenarioOutputs.series, "ebitda"),
      cash: mergeSeries(baseOutputs.series, scenarioOutputs.series, "cash"),
      exitEquity: [
        { name: "Base", value: baseOutputs.exitEquityValue },
        { name: scenarioOutputs.name, value: scenarioOutputs.exitEquityValue },
      ],
    };
  }, [baseOutputs, scenarioOutputs]);

  return (
    <div className="grid gap-6 lg:grid-cols-[360px,1fr]">
      <div className="lg:col-span-2 rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4 shadow-sm flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">Company</p>
          <p className="text-lg font-semibold text-[var(--cb-text-primary)]">
            {companyName || 'Demo Company'}{ticker ? ` (${ticker})` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--cb-text-muted)]">Model</p>
          <span className="inline-flex items-center rounded-full border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-1 text-sm font-semibold text-[var(--cb-text-primary)]">
            {modelType ? modelType.toUpperCase() : 'SCENARIO'}
          </span>
        </div>
      </div>
      <ScenarioSidebar
        activeScenario={activeScenarioName}
        deltas={deltas}
        onChangeDelta={handleDeltaChange}
        onSelectScenario={handleSelectScenario}
        onPreset={handlePreset}
        onReset={() => {
          setActiveScenarioName("Base");
          setDeltas(ZERO_DELTAS);
        }}
      />
      <div className="space-y-4">
        <ScenarioResultsPanel base={baseOutputs} scenario={scenarioOutputs} />
        <ScenarioCharts data={chartsData} />
        <ScenarioComparisonTable base={baseOutputs} scenario={scenarioOutputs} />
      </div>
    </div>
  );
}

function runScenario(name: ScenarioName, deltas: ScenarioDeltas): ScenarioOutputs {
  const years = YEARS;
  const growth = BASELINE.growth * (1 + deltas.revenueGrowthDelta / 100);
  const margin = clamp(BASELINE.ebitdaMargin * (1 + deltas.ebitdaMarginDelta / 100), 0.05, 0.6);
  const exitMultiple = Math.max(BASELINE.exitMultiple + deltas.exitMultipleDelta, 0);
  const interestRate = Math.max(BASELINE.interestRate + deltas.interestRateDeltaBps / 100, 0);
  const leverageTarget = BASELINE.leverage + deltas.leverageDelta;

  let revenue = BASELINE.revenue;
  let prevNwc = BASELINE.revenue * BASELINE.nwcPct;
  let netDebt = BASELINE.netDebt;
  let cash = BASELINE.cash;
  let minCashBreach = false;
  let covenantStress = false;

  const series: ScenarioSeriesPoint[] = [];

  for (let year = 1; year <= years; year++) {
    revenue = Math.max(revenue * (1 + growth), 0);
    const nwc = revenue * BASELINE.nwcPct;
    const nwcChange = nwc - prevNwc;
    prevNwc = nwc;

    const ebitda = Math.max(revenue * margin, 0);
    const capex = revenue * BASELINE.capexPct;
    const interest = Math.max(netDebt, 0) * interestRate;
    const taxable = ebitda - capex - interest - nwcChange;
    const tax = taxable > 0 ? taxable * BASELINE.taxRate : 0;
    const fcf = ebitda - capex - interest - nwcChange - tax;

    cash += fcf;
    if (cash < BASELINE.minCash) {
      minCashBreach = true;
    }

    if (fcf > 0) {
      netDebt = Math.max(netDebt - fcf, 0);
    }

    const leverage = ebitda > 0 ? netDebt / ebitda : 0;
    if (leverage > Math.max(leverageTarget, 4.5)) {
      covenantStress = true;
    }

    series.push({
      year: `Y${year}`,
      revenue,
      ebitda,
      cash,
      netDebt,
    });
  }

  const exitEbitda = series[series.length - 1]?.ebitda ?? 0;
  const exitEnterpriseValue = exitEbitda * exitMultiple;
  const exitEquityValue = exitEnterpriseValue - Math.max(netDebt, 0);
  const revenueCagr = Math.pow((series[series.length - 1]?.revenue ?? BASELINE.revenue) / BASELINE.revenue, 1 / years) - 1;
  const ebitdaMargin = exitEbitda > 0 && (series[series.length - 1]?.revenue ?? 0) > 0
    ? exitEbitda / (series[series.length - 1]?.revenue ?? 1)
    : 0;

  const startingEbitda = BASELINE.revenue * BASELINE.ebitdaMargin;
  const startingEnterprise = startingEbitda * BASELINE.exitMultiple;
  const startingEquity = startingEnterprise - BASELINE.netDebt;
  const moic = startingEquity > 0 ? exitEquityValue / startingEquity : 1;
  const irr = moic > 0 ? Math.pow(moic, 1 / years) - 1 : 0;

  return {
    name,
    deltas,
    revenueCagr,
    ebitdaMargin,
    exitMultiple,
    exitEnterpriseValue,
    exitEquityValue,
    irr,
    moic,
    netDebtExit: Math.max(netDebt, 0),
    cashExit: series[series.length - 1]?.cash ?? 0,
    minCashBreach,
    covenantStress,
    series,
  };
}

function mergeSeries(base: ScenarioSeriesPoint[], scenario: ScenarioSeriesPoint[], key: "ebitda" | "cash") {
  return base.map((point, idx) => ({
    year: point.year,
    base: point[key],
    scenario: scenario[idx]?.[key] ?? 0,
  }));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
