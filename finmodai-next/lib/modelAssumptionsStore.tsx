import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type ScenarioName = 'base' | 'bull' | 'bear';

export interface ScenarioInputs {
  revenueGrowth: number;
  ebitdaMargin: number;
  daPctRevenue: number;
  wacc: number;
  terminalGrowth: number;
  deltaNwcPct: number;
  capexPctRevenue: number;
  taxRate: number;
}

export interface ModelAssumptions {
  revenueGrowth: number;
  ebitdaMargin: number;
  daPctRevenue: number;
  wacc: number;
  terminalGrowth: number;
  deltaNwcPct: number;
  capexPctRevenue: number;
  taxRate: number;
  includeScenarios: boolean;
  activeScenario: ScenarioName;
  scenarios: Record<ScenarioName, ScenarioInputs>;
}

type ModelAssumptionsContextValue = {
  modelAssumptions: ModelAssumptions;
  setIncludeScenarios: (value: boolean) => void;
  setActiveScenario: (scenario: ScenarioName) => void;
  updateScenarioValue: (scenario: ScenarioName, key: keyof ScenarioInputs, value: number) => void;
  applyDemoScenarioDefaults: (payload: DemoScenarioSeed) => void;
  resetAssumptions: () => void;
};

export type DemoScenarioSeed = {
  ticker: string;
  sector: string | null;
  revenueLTM: number | null;
  ebitdaLTM: number | null;
};

const DEFAULT_BASE: ScenarioInputs = {
  revenueGrowth: 10,
  ebitdaMargin: 25,
  daPctRevenue: 5,
  wacc: 10,
  terminalGrowth: 2.5,
  deltaNwcPct: 1,
  capexPctRevenue: 4,
  taxRate: 25,
};

const buildBullScenario = (base: ScenarioInputs): ScenarioInputs => ({
  revenueGrowth: base.revenueGrowth + 2,
  ebitdaMargin: base.ebitdaMargin + 1,
  daPctRevenue: base.daPctRevenue,
  wacc: base.wacc - 1.5,
  terminalGrowth: base.terminalGrowth + 0.25,
  deltaNwcPct: base.deltaNwcPct,
  capexPctRevenue: base.capexPctRevenue,
  taxRate: base.taxRate,
});

const buildBearScenario = (base: ScenarioInputs): ScenarioInputs => ({
  revenueGrowth: base.revenueGrowth - 2,
  ebitdaMargin: base.ebitdaMargin - 1,
  daPctRevenue: base.daPctRevenue,
  wacc: base.wacc + 1.5,
  terminalGrowth: base.terminalGrowth - 0.25,
  deltaNwcPct: base.deltaNwcPct,
  capexPctRevenue: base.capexPctRevenue,
  taxRate: base.taxRate,
});

const buildDefaults = (): ModelAssumptions => {
  const base = { ...DEFAULT_BASE };
  return {
    ...base,
    includeScenarios: true,
    activeScenario: 'base',
    scenarios: {
      base,
      bull: buildBullScenario(base),
      bear: buildBearScenario(base),
    },
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sectorDefaults(sector: string | null): Pick<
  ScenarioInputs,
  'revenueGrowth' | 'daPctRevenue' | 'capexPctRevenue' | 'deltaNwcPct' | 'wacc' | 'terminalGrowth' | 'taxRate'
> {
  const s = (sector || '').toLowerCase();
  if (s.includes('technology')) {
    return { revenueGrowth: 10, daPctRevenue: 5, capexPctRevenue: 4, deltaNwcPct: 1, wacc: 10, terminalGrowth: 2.5, taxRate: 25 };
  }
  if (s.includes('health')) {
    return { revenueGrowth: 7, daPctRevenue: 4, capexPctRevenue: 4, deltaNwcPct: 1, wacc: 9.5, terminalGrowth: 2.5, taxRate: 25 };
  }
  if (s.includes('financial')) {
    return { revenueGrowth: 6, daPctRevenue: 2, capexPctRevenue: 2, deltaNwcPct: 0.5, wacc: 10, terminalGrowth: 2.25, taxRate: 25 };
  }
  if (s.includes('consumer')) {
    return { revenueGrowth: 6, daPctRevenue: 4, capexPctRevenue: 4, deltaNwcPct: 1, wacc: 10.5, terminalGrowth: 2.25, taxRate: 25 };
  }
  if (s.includes('energy')) {
    return { revenueGrowth: 4, daPctRevenue: 8, capexPctRevenue: 8, deltaNwcPct: 1, wacc: 11.5, terminalGrowth: 2.0, taxRate: 25 };
  }
  return { revenueGrowth: 6, daPctRevenue: 4, capexPctRevenue: 4, deltaNwcPct: 1, wacc: 10.5, terminalGrowth: 2.25, taxRate: 25 };
}

function buildBaseFromDemoSeed(seed: DemoScenarioSeed): ScenarioInputs {
  const defaults = sectorDefaults(seed.sector);
  const revenue = typeof seed.revenueLTM === 'number' && Number.isFinite(seed.revenueLTM) && seed.revenueLTM > 0 ? seed.revenueLTM : null;
  const ebitda = typeof seed.ebitdaLTM === 'number' && Number.isFinite(seed.ebitdaLTM) ? seed.ebitdaLTM : null;
  const marginPct = revenue && ebitda != null ? (ebitda / revenue) * 100 : null;
  return {
    revenueGrowth: defaults.revenueGrowth,
    ebitdaMargin: marginPct != null ? clamp(marginPct, 5, 60) : DEFAULT_BASE.ebitdaMargin,
    daPctRevenue: defaults.daPctRevenue,
    wacc: defaults.wacc,
    terminalGrowth: defaults.terminalGrowth,
    deltaNwcPct: defaults.deltaNwcPct,
    capexPctRevenue: defaults.capexPctRevenue,
    taxRate: defaults.taxRate,
  };
}

const ModelAssumptionsContext = createContext<ModelAssumptionsContextValue | null>(null);

export function ModelAssumptionsProvider({ children }: { children: React.ReactNode }) {
  const [modelAssumptions, setModelAssumptions] = useState<ModelAssumptions>(() => buildDefaults());

  const setIncludeScenarios = useCallback((value: boolean) => {
    setModelAssumptions((prev) => ({ ...prev, includeScenarios: value }));
  }, []);

  const setActiveScenario = useCallback((scenario: ScenarioName) => {
    setModelAssumptions((prev) => {
      const active = prev.scenarios[scenario];
      return {
        ...prev,
        activeScenario: scenario,
        revenueGrowth: active.revenueGrowth,
        ebitdaMargin: active.ebitdaMargin,
        daPctRevenue: active.daPctRevenue,
        wacc: active.wacc,
        terminalGrowth: active.terminalGrowth,
        deltaNwcPct: active.deltaNwcPct,
        capexPctRevenue: active.capexPctRevenue,
        taxRate: active.taxRate,
      };
    });
  }, []);

  const updateScenarioValue = useCallback(
    (scenario: ScenarioName, key: keyof ScenarioInputs, value: number) => {
      setModelAssumptions((prev) => {
        const nextScenario = { ...prev.scenarios[scenario], [key]: value };
        const nextScenarios =
          scenario === 'base'
            ? {
                base: nextScenario,
                bull: buildBullScenario(nextScenario),
                bear: buildBearScenario(nextScenario),
              }
            : { ...prev.scenarios, [scenario]: nextScenario };
        const activeScenario = prev.activeScenario;
        const active = activeScenario === scenario ? nextScenario : nextScenarios[activeScenario];
        return {
          ...prev,
          scenarios: nextScenarios,
          revenueGrowth: active.revenueGrowth,
          ebitdaMargin: active.ebitdaMargin,
          daPctRevenue: active.daPctRevenue,
          wacc: active.wacc,
          terminalGrowth: active.terminalGrowth,
          deltaNwcPct: active.deltaNwcPct,
          capexPctRevenue: active.capexPctRevenue,
          taxRate: active.taxRate,
        };
      });
    },
    []
  );

  const applyDemoScenarioDefaults = useCallback((seed: DemoScenarioSeed) => {
    setModelAssumptions((prev) => {
      const base = buildBaseFromDemoSeed(seed);
      const bull = buildBullScenario(base);
      const bear = buildBearScenario(base);
      const activeScenario = prev.activeScenario;
      const active = activeScenario === 'bull' ? bull : activeScenario === 'bear' ? bear : base;
      return {
        ...prev,
        scenarios: { base, bull, bear },
        revenueGrowth: active.revenueGrowth,
        ebitdaMargin: active.ebitdaMargin,
        daPctRevenue: active.daPctRevenue,
        wacc: active.wacc,
        terminalGrowth: active.terminalGrowth,
        deltaNwcPct: active.deltaNwcPct,
        capexPctRevenue: active.capexPctRevenue,
        taxRate: active.taxRate,
      };
    });
  }, []);

  const resetAssumptions = useCallback(() => {
    setModelAssumptions(buildDefaults());
  }, []);

  const value = useMemo(
    () => ({
      modelAssumptions,
      setIncludeScenarios,
      setActiveScenario,
      updateScenarioValue,
      applyDemoScenarioDefaults,
      resetAssumptions,
    }),
    [
      applyDemoScenarioDefaults,
      modelAssumptions,
      resetAssumptions,
      setActiveScenario,
      setIncludeScenarios,
      updateScenarioValue,
    ]
  );

  return <ModelAssumptionsContext.Provider value={value}>{children}</ModelAssumptionsContext.Provider>;
}

export function useModelAssumptions() {
  const ctx = useContext(ModelAssumptionsContext);
  if (!ctx) {
    throw new Error('useModelAssumptions must be used within ModelAssumptionsProvider');
  }
  return ctx;
}
