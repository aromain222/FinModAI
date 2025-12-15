"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ScenarioName = "bear" | "base" | "bull";

interface ScenarioInputs {
  revenueGrowth: number; // %
  ebitdaMargin: number; // %
  exitMultiple: number; // x
  leverage: number; // x
}

interface ScenarioResult {
  name: ScenarioName;
  label: string;
  revenueExit: number;
  ebitdaExit: number;
  enterpriseValue: number;
  netDebt: number;
  equityValue: number;
  pricePerShare: number;
}

type ScenarioState = Record<ScenarioName, ScenarioInputs>;

const DEFAULT_INPUTS: ScenarioState = {
  bear: { revenueGrowth: 2, ebitdaMargin: 19, exitMultiple: 8, leverage: 3.5 },
  base: { revenueGrowth: 5, ebitdaMargin: 24, exitMultiple: 10, leverage: 3 },
  bull: { revenueGrowth: 8, ebitdaMargin: 28, exitMultiple: 12, leverage: 2.5 },
};

export function ScenarioEngineApp({ initialTicker }: { initialTicker?: string }) {
  const [ticker, setTicker] = useState(initialTicker ?? "AAPL");
  const [sharesMm, setSharesMm] = useState(100);
  const [baseRevenueMm, setBaseRevenueMm] = useState(2000);
  const [inputs, setInputs] = useState<ScenarioState>(DEFAULT_INPUTS);

  const scenarios = useMemo<ScenarioResult[]>(
    () => [
      buildScenarioResult("bear", "Bear", inputs.bear, baseRevenueMm, sharesMm),
      buildScenarioResult("base", "Base", inputs.base, baseRevenueMm, sharesMm),
      buildScenarioResult("bull", "Bull", inputs.bull, baseRevenueMm, sharesMm),
    ],
    [inputs, baseRevenueMm, sharesMm]
  );

  const handleScenarioChange = (name: ScenarioName, field: keyof ScenarioInputs, value: number) => {
    setInputs((prev) => ({
      ...prev,
      [name]: {
        ...prev[name],
        [field]: value,
      },
    }));
  };

  return (
    <div className="space-y-8 text-[var(--cb-text-body)]">
      <section className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--cb-text-primary)]">Scenario inputs</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <InputField
            label="Ticker"
            value={ticker}
            onChange={(value) => setTicker(value.toUpperCase())}
            placeholder="AAPL"
          />
          <InputField
            label="Shares (mm)"
            type="number"
            value={sharesMm}
            onChange={(value) => setSharesMm(Number(value) || 0)}
            min="1"
          />
          <InputField
            label="Base revenue (mm)"
            type="number"
            value={baseRevenueMm}
            onChange={(value) => setBaseRevenueMm(Number(value) || 0)}
            min="0"
          />
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        {(["bear", "base", "bull"] as ScenarioName[]).map((name) => (
          <ScenarioCard
            key={name}
            name={name}
            label={titleForScenario(name)}
            inputs={inputs[name]}
            onChange={handleScenarioChange}
            highlight={name === "base"}
          />
        ))}
      </section>

      <section className="space-y-6 rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-[var(--cb-text-primary)]">Football field</h2>
          <p className="text-sm text-[var(--cb-text-muted)]">
            Visualizing Base, Bull, and Bear outcomes based on a 5-year hold with your exit multiple and leverage
            assumptions.
          </p>
        </div>
        <ScenarioFootballField scenarios={scenarios} />
        <ScenarioSummary scenarios={scenarios} inputs={inputs} />
      </section>
    </div>
  );
}

export function buildScenarioResult(
  name: ScenarioName,
  label: string,
  inputs: ScenarioInputs,
  baseRevenueMm: number,
  sharesMm: number
): ScenarioResult {
  const growthFactor = Math.pow(1 + inputs.revenueGrowth / 100, 5);
  const revenueExit = baseRevenueMm * growthFactor;
  const ebitdaExit = revenueExit * (inputs.ebitdaMargin / 100);
  const enterpriseValue = ebitdaExit * inputs.exitMultiple;
  const netDebt = ebitdaExit * inputs.leverage;
  const equityValue = enterpriseValue - netDebt;
  const pricePerShare = sharesMm > 0 ? equityValue / sharesMm : 0;

  return {
    name,
    label,
    revenueExit,
    ebitdaExit,
    enterpriseValue,
    netDebt,
    equityValue,
    pricePerShare,
  };
}

interface InputFieldProps {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  min?: string;
}

function InputField({ label, value, onChange, type = "text", placeholder, min }: InputFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">{label}</Label>
      <Input
        type={type}
        value={value}
        min={min}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="border-cb-line text-cb-ink focus-visible:ring-cb-blue"
      />
    </div>
  );
}

interface ScenarioCardProps {
  name: ScenarioName;
  label: string;
  inputs: ScenarioInputs;
  onChange: (name: ScenarioName, field: keyof ScenarioInputs, value: number) => void;
  highlight?: boolean;
}

function ScenarioCard({ name, label, inputs, onChange, highlight }: ScenarioCardProps) {
  const sliderConfigs: { key: keyof ScenarioInputs; label: string; min: number; max: number; step: number; format: (v: number) => string }[] =
    [
      { key: "revenueGrowth", label: "Revenue growth", min: -5, max: 20, step: 0.5, format: (v) => `${v.toFixed(1)}%` },
      { key: "ebitdaMargin", label: "EBITDA margin", min: 5, max: 50, step: 0.5, format: (v) => `${v.toFixed(1)}%` },
      { key: "exitMultiple", label: "Exit multiple", min: 4, max: 18, step: 0.1, format: (v) => `${v.toFixed(1)}x` },
      { key: "leverage", label: "Leverage (Net debt / EBITDA)", min: 0, max: 5, step: 0.1, format: (v) => `${v.toFixed(1)}x` },
    ];

  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm transition ${
        highlight
          ? "border-[var(--cb-green)] bg-[var(--cb-surface-alt)] shadow-lg shadow-[var(--cb-green)]/10"
          : "border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]"
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[var(--cb-text-primary)]">{label}</h3>
        {highlight && (
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--cb-green)]">Base</span>
        )}
      </div>
      <div className="mt-4 space-y-4">
        {sliderConfigs.map((config) => {
          const sliderValue = inputs[config.key];
          const clampedValue = Math.min(config.max, Math.max(config.min, sliderValue));
          
          return (
            <div key={config.key} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)] flex-1 min-w-0">
                  {config.label}
                </span>
                <span className={cn(
                  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap flex-shrink-0',
                  'border-[var(--cb-green)]/30 bg-[var(--cb-surface-alt)] text-[var(--cb-green)]',
                  'dark:border-[var(--cb-green)]/50 dark:bg-[var(--cb-surface)] dark:text-[var(--cb-green)]'
                )}>
                  {config.format(clampedValue)}
                </span>
              </div>
              <input
                type="range"
                min={config.min}
                max={config.max}
                step={config.step}
                value={clampedValue}
                onInput={(event) => {
                  const newValue = Number((event.target as HTMLInputElement).value);
                  onChange(name, config.key, newValue);
                }}
                onChange={(event) => {
                  const newValue = Number(event.target.value);
                  onChange(name, config.key, newValue);
                }}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--cb-border-subtle)] accent-[var(--cb-green)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--cb-text-muted)] dark:text-[var(--cb-text-secondary)]">
                <span>{config.format(config.min)}</span>
                <span>{config.format(config.max)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ScenarioFootballFieldProps {
  scenarios: ScenarioResult[];
  mode?: "equity" | "price";
}

function ScenarioFootballField({ scenarios, mode = "price" }: ScenarioFootballFieldProps) {
  const positiveValues = scenarios.map((scenario) =>
    Math.max(mode === "price" ? scenario.pricePerShare : scenario.equityValue, 0)
  );
  const maxValue = Math.max(...positiveValues, 1);

  const colors: Record<ScenarioName, string> = {
    bear: "bg-[var(--cb-text-muted)]",
    base: "bg-[var(--cb-green)]/80",
    bull: "bg-[var(--cb-green)]",
  };

  return (
    <div className="space-y-4">
      {scenarios.map((scenario) => {
        const rawValue = mode === "price" ? scenario.pricePerShare : scenario.equityValue;
        const safeValue = Math.max(rawValue, 0);
        const width = Math.max((safeValue / maxValue) * 100, 2);
        return (
          <div key={scenario.name} className="space-y-1">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">
              <span>{scenario.label}</span>
              <span className="font-semibold text-[var(--cb-text-primary)]">
                {mode === "price" ? formatPrice(rawValue) : formatMillions(rawValue)}
              </span>
            </div>
            <div className="h-4 rounded-full bg-[var(--cb-border-subtle)]/40">
              <div className={`h-full rounded-full ${colors[scenario.name]}`} style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
      <p className="text-xs text-[var(--cb-text-muted)]">
        Football field based on a five-year hold, exit EBITDA multiples, and leverage assumptions you configured above.
      </p>
    </div>
  );
}

function ScenarioSummary({ scenarios, inputs }: { scenarios: ScenarioResult[]; inputs: ScenarioState }) {
  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-[var(--cb-green)]">Scenario summary</p>
      <ul className="space-y-3 text-sm text-[var(--cb-text-primary)]">
        {scenarios.map((scenario) => (
          <li key={scenario.name} className="leading-relaxed">
            <strong>{scenario.label}:</strong> exits at {formatMillions(scenario.equityValue)} equity (
            {formatPrice(scenario.pricePerShare)} per share) on{" "}
            {describeScenarioInputs(inputs[scenario.name])}.
          </li>
        ))}
      </ul>
    </div>
  );
}

function describeScenarioInputs(inputs: ScenarioInputs): string {
  return `${inputs.revenueGrowth.toFixed(1)}% growth, ${inputs.ebitdaMargin.toFixed(1)}% EBITDA margin, ${inputs.exitMultiple.toFixed(
    1
  )}x exit, ${inputs.leverage.toFixed(1)}x net debt / EBITDA`;
}

function titleForScenario(name: ScenarioName): string {
  switch (name) {
    case "bear":
      return "Bear";
    case "base":
      return "Base";
    case "bull":
      return "Bull";
  }
}

const formatMillions = (value: number): string => {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1000) {
    return `${sign}$${(abs / 1000).toFixed(1)}B`;
  }
  return `${sign}$${abs.toLocaleString()}M`;
};

const formatPrice = (value: number): string => `$${value.toFixed(2)}`;
