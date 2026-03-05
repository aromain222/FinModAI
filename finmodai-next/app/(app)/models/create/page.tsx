"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Home, ArrowLeft, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { DownloadWorkbookButton } from '@/components/models/DownloadWorkbookButton';
import { ModelResultsShell } from '@/components/models/ModelResultsShell';
import { AssumptionsPanel } from '@/components/models/AssumptionsPanel';
import type { LboAdvancedOptions } from '@/types/lbo';
import { DiagnosticsPanel } from '@/components/models/DiagnosticsPanel';
import { extractModelAssumptions } from '@/lib/models/extractAssumptions';
import { downloadWorkbook, type DownloadWorkbookParams } from '@/lib/downloadWorkbook';
import { ModelGenerationTimer } from '@/components/models/ModelGenerationTimer';
import { TickerAutocomplete } from '@/components/tickers/TickerAutocomplete';
import type { TickerResult } from '@/components/tickers/TickerAutocomplete';
import type { GenerateModelResponse } from '@/types/models';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/lib/branding';
import { MissingInputsModal } from '@/components/models/MissingInputsModal';
import { buildMissingInputSpecs, type MissingInputSpec } from '@/lib/models/shared/missingInputSpecs';
import { validateModelInputs } from '@/lib/modelInputValidation';
import { MergerInputsPanel } from '@/components/models/MergerInputsPanel';
import { getMissingMergerInputs } from '@/lib/models/merger/schema';
import type { MergerModelInput } from '@/lib/models/merger/schema';
import { OperatingInputsPanel } from '@/components/models/OperatingInputsPanel';
import { getMissingOperatingInputs } from '@/lib/models/operating/schema';
import type { OperatingModelInput } from '@/lib/models/operating/schema';
import { AppliedDefaultsList, AppliedDefaultBadge } from '@/components/models/AppliedDefaultBadge';
import { ModelPreviewRenderer } from '@/components/models/ModelPreviewRenderer';
import {
  ModelAssumptionsProvider,
  useModelAssumptions,
  type ScenarioInputs,
  type ScenarioName,
} from '@/lib/modelAssumptionsStore';
import { isDemoMode } from '@/lib/demo/isDemoMode';
import { LoadingPanel } from '@/components/loading';
import { LOADING_TABS } from '@/lib/loadingCopy';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search } from 'lucide-react';
import { QUICK_LBO_DEFAULT_SUMMARY } from '@/lib/models/lbo/quick';
import { useToast } from '@/hooks/use-toast';
import { ToastEnhanced } from '@/components/ui/toast-enhanced';
import { LIVE_DATA_FALLBACK_NOTICE } from '@/lib/modelInputs/defensive';

const MODEL_OPTIONS = [
  { value: 'three-statement', label: 'Three Statement Model', description: 'Full P&L, Balance Sheet, Cash Flow' },
  { value: 'dcf', label: 'Discounted Cash Flow (DCF)', description: 'Intrinsic valuation with terminal value' },
  { value: 'reverse-dcf', label: 'Reverse DCF (Demo)', description: 'Solve implied growth from price and DCF assumptions' },
  { value: 'debt-capacity-lite', label: 'Debt Capacity Lite', description: 'Quick max debt estimate from EBITDA constraints' },
  { value: 'comps', label: 'Trading Comps Model', description: 'Peer group valuation multiples' },
  { value: 'scorecard', label: 'Fundamentals Scorecard', description: 'Deterministic ratio scorecard with sector context' },
  // Merger and Operating remain hidden from UI
  { value: 'lbo', label: 'Leveraged Buyout (LBO)', description: 'Returns analysis with debt paydown' },
  { value: 'merger', label: 'Merger Model', description: 'Combined IS + EPS bridge + accretion/dilution' },
  { value: 'operating', label: 'Operating Model', description: 'Monthly FP&A + cash runway + variance analysis' }
] as const;

/** Model types shown in create dropdown */
const CREATE_MODEL_OPTIONS = MODEL_OPTIONS.filter(
  (o) =>
    o.value === 'three-statement' ||
    o.value === 'dcf' ||
    o.value === 'reverse-dcf' ||
    o.value === 'debt-capacity-lite' ||
    o.value === 'comps' ||
    o.value === 'scorecard'
);

type ModelType = (typeof MODEL_OPTIONS)[number]['value'];
type CompanyMode = 'public' | 'private';
type ManualInputFieldKey =
  | 'companyName'
  | 'revenue'
  | 'revenueGrowthPct'
  | 'ebitMarginPct'
  | 'taxRatePct'
  | 'capexPctRevenue'
  | 'nwcPctRevenue'
  | 'ebitda'
  | 'netIncome'
  | 'sharesOutstanding'
  | 'price'
  | 'marketCap';

const PRIVATE_REQUIRED_FIELDS_BY_MODEL: Partial<Record<ModelType, ManualInputFieldKey[]>> = {
  'three-statement': [
    'companyName',
    'revenue',
    'revenueGrowthPct',
    'ebitMarginPct',
    'taxRatePct',
    'capexPctRevenue',
    'nwcPctRevenue',
  ],
  dcf: [
    'companyName',
    'revenue',
    'revenueGrowthPct',
    'ebitMarginPct',
    'taxRatePct',
    'capexPctRevenue',
    'nwcPctRevenue',
  ],
  'reverse-dcf': [
    'companyName',
    'revenue',
    'revenueGrowthPct',
    'ebitMarginPct',
    'taxRatePct',
    'capexPctRevenue',
    'nwcPctRevenue',
  ],
  'debt-capacity-lite': ['companyName', 'revenue'],
  comps: ['companyName', 'revenue'],
  scorecard: ['companyName', 'revenue'],
};

const PRIVATE_FIELD_LABELS: Record<ManualInputFieldKey, string> = {
  companyName: 'Company name',
  revenue: 'Revenue (LTM)',
  revenueGrowthPct: 'Revenue growth (%)',
  ebitMarginPct: 'EBIT / EBITDA margin (%)',
  taxRatePct: 'Tax rate (%)',
  capexPctRevenue: 'Capex % revenue',
  nwcPctRevenue: 'NWC % revenue',
  ebitda: 'EBITDA (LTM)',
  netIncome: 'Net income (LTM)',
  sharesOutstanding: 'Shares outstanding',
  price: 'Share price',
  marketCap: 'Market cap',
};

type ModelData = {
  ticker: string;
  modelType: string;
  summary: string;
  keyAssumptions: string[];
  baseCase: {
    impliedValuePerShare: number;
    upsideDownsideVsSpot: string;
    notes: string;
  };
  scenarios?: Array<{
    name: string;
    assumptions: string[];
    valuationHighlights: string[];
  }>;
};

type InsightCard = { title: string; body: string };

type AdvancedLboFormState = {
  managementRolloverPct: string;
  preferredEquityAmount: string;
  subordinatedNotesAmount: string;
  minimumCashAtClose: string;
};

type AdvancedDcfFormState = {
  beta: string;
  equityRiskPremium: string;
  costOfDebt: string;
};

const createDefaultAdvancedLboState = (): AdvancedLboFormState => ({
  managementRolloverPct: '',
  preferredEquityAmount: '',
  subordinatedNotesAmount: '',
  minimumCashAtClose: '',
});

const createDefaultAdvancedDcfState = (): AdvancedDcfFormState => ({
  beta: '',
  equityRiskPremium: '',
  costOfDebt: '',
});

const createDefaultDcfSensitivityState = () => ({
  waccRangePct: '2.0',
  waccStepPct: '0.5',
  terminalGrowthRangePct: '1.0',
  terminalGrowthStepPct: '0.25',
});

const createDefaultLboSensitivityState = () => ({
  entryRange: '2.0',
  entryStep: '0.5',
  exitRange: '2.0',
  exitStep: '0.5',
});

const createDefaultDebtCapacityLiteState = () => ({
  maxLeverage: '4.0',
  minInterestCoverage: '2.0',
  interestRatePct: '7.0',
});

const SCENARIO_LIMITS: Record<keyof ScenarioInputs, { min: number; max: number }> = {
  revenueGrowth: { min: -20, max: 60 },
  ebitdaMargin: { min: -20, max: 60 },
  daPctRevenue: { min: 0, max: 20 },
  wacc: { min: 3, max: 25 },
  terminalGrowth: { min: -2, max: 6 },
  deltaNwcPct: { min: -10, max: 10 },
  capexPctRevenue: { min: 0, max: 20 },
  taxRate: { min: 0, max: 40 },
};

const SCENARIO_SLIDER_LIMITS = {
  revenueGrowth: { min: -20, max: 60, step: 1 },
  ebitdaMargin: { min: -20, max: 60, step: 1 },
  daPctRevenue: { min: 0, max: 20, step: 0.5 },
  wacc: { min: 3, max: 25, step: 0.5 },
  terminalGrowth: { min: -2, max: 6, step: 0.25 },
  deltaNwcPct: { min: -10, max: 10, step: 0.5 },
  capexPctRevenue: { min: 0, max: 20, step: 0.5 },
  taxRate: { min: 0, max: 40, step: 0.5 },
} as const;

const clampValue = (value: number, key: keyof ScenarioInputs) =>
  Math.min(SCENARIO_LIMITS[key].max, Math.max(SCENARIO_LIMITS[key].min, value));

const mapScenarioInputsForApi = (inputs: ScenarioInputs) => ({
  revenueGrowthPct: inputs.revenueGrowth,
  ebitdaMarginPct: inputs.ebitdaMargin,
  daPctRevenuePct: inputs.daPctRevenue,
  waccPct: inputs.wacc,
  terminalGrowthPct: inputs.terminalGrowth,
  deltaNwcPct: inputs.deltaNwcPct,
  capexPctRevenuePct: inputs.capexPctRevenue,
  taxRatePct: inputs.taxRate,
});

const SCENARIO_ORDER: ScenarioName[] = ['base', 'bull', 'bear'];

const SCENARIO_LABELS: Record<ScenarioName, string> = {
  base: 'Base Case',
  bull: 'Bull Case',
  bear: 'Bear Case',
};

type ScenarioSliderConfig = {
  key: keyof ScenarioInputs;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  icon: typeof TrendingUp;
  iconClassName: string;
};

const DCF_SLIDER_CONFIGS: ScenarioSliderConfig[] = [
  {
    key: 'revenueGrowth',
    label: 'Revenue Growth',
    min: SCENARIO_SLIDER_LIMITS.revenueGrowth.min,
    max: SCENARIO_SLIDER_LIMITS.revenueGrowth.max,
    step: SCENARIO_SLIDER_LIMITS.revenueGrowth.step,
    format: (value) => `${value.toFixed(1)}%`,
    icon: TrendingUp,
    iconClassName: 'text-green-600',
  },
  {
    key: 'ebitdaMargin',
    label: 'EBITDA Margin',
    min: SCENARIO_SLIDER_LIMITS.ebitdaMargin.min,
    max: SCENARIO_SLIDER_LIMITS.ebitdaMargin.max,
    step: SCENARIO_SLIDER_LIMITS.ebitdaMargin.step,
    format: (value) => `${value.toFixed(1)}%`,
    icon: Activity,
    iconClassName: 'text-blue-600',
  },
  {
    key: 'deltaNwcPct',
    label: 'ΔNWC % of Revenue',
    min: SCENARIO_SLIDER_LIMITS.deltaNwcPct.min,
    max: SCENARIO_SLIDER_LIMITS.deltaNwcPct.max,
    step: SCENARIO_SLIDER_LIMITS.deltaNwcPct.step,
    format: (value) => `${value.toFixed(1)}%`,
    icon: Activity,
    iconClassName: 'text-emerald-600',
  },
  {
    key: 'capexPctRevenue',
    label: 'Capex % of Revenue',
    min: SCENARIO_SLIDER_LIMITS.capexPctRevenue.min,
    max: SCENARIO_SLIDER_LIMITS.capexPctRevenue.max,
    step: SCENARIO_SLIDER_LIMITS.capexPctRevenue.step,
    format: (value) => `${value.toFixed(1)}%`,
    icon: Activity,
    iconClassName: 'text-cyan-600',
  },
  {
    key: 'taxRate',
    label: 'Effective Tax Rate',
    min: SCENARIO_SLIDER_LIMITS.taxRate.min,
    max: SCENARIO_SLIDER_LIMITS.taxRate.max,
    step: SCENARIO_SLIDER_LIMITS.taxRate.step,
    format: (value) => `${value.toFixed(1)}%`,
    icon: Activity,
    iconClassName: 'text-amber-600',
  },
  {
    key: 'wacc',
    label: 'WACC (Discount Rate)',
    min: SCENARIO_SLIDER_LIMITS.wacc.min,
    max: SCENARIO_SLIDER_LIMITS.wacc.max,
    step: SCENARIO_SLIDER_LIMITS.wacc.step,
    format: (value) => `${value.toFixed(1)}%`,
    icon: TrendingDown,
    iconClassName: 'text-orange-600',
  },
  {
    key: 'terminalGrowth',
    label: 'Terminal Growth Rate',
    min: SCENARIO_SLIDER_LIMITS.terminalGrowth.min,
    max: SCENARIO_SLIDER_LIMITS.terminalGrowth.max,
    step: SCENARIO_SLIDER_LIMITS.terminalGrowth.step,
    format: (value) => `${value.toFixed(1)}%`,
    icon: Activity,
    iconClassName: 'text-purple-600',
  },
];

const THREE_STATEMENT_SLIDER_CONFIGS: ScenarioSliderConfig[] = [
  {
    key: 'revenueGrowth',
    label: 'Revenue Growth',
    min: SCENARIO_SLIDER_LIMITS.revenueGrowth.min,
    max: SCENARIO_SLIDER_LIMITS.revenueGrowth.max,
    step: SCENARIO_SLIDER_LIMITS.revenueGrowth.step,
    format: (value) => `${value.toFixed(1)}%`,
    icon: TrendingUp,
    iconClassName: 'text-green-600',
  },
  {
    key: 'ebitdaMargin',
    label: 'EBITDA Margin',
    min: SCENARIO_SLIDER_LIMITS.ebitdaMargin.min,
    max: SCENARIO_SLIDER_LIMITS.ebitdaMargin.max,
    step: SCENARIO_SLIDER_LIMITS.ebitdaMargin.step,
    format: (value) => `${value.toFixed(1)}%`,
    icon: Activity,
    iconClassName: 'text-blue-600',
  },
  {
    key: 'daPctRevenue',
    label: 'D&A % of Revenue',
    min: SCENARIO_SLIDER_LIMITS.daPctRevenue.min,
    max: SCENARIO_SLIDER_LIMITS.daPctRevenue.max,
    step: SCENARIO_SLIDER_LIMITS.daPctRevenue.step,
    format: (value) => `${value.toFixed(1)}%`,
    icon: Activity,
    iconClassName: 'text-indigo-600',
  },
  {
    key: 'capexPctRevenue',
    label: 'Capex % of Revenue',
    min: SCENARIO_SLIDER_LIMITS.capexPctRevenue.min,
    max: SCENARIO_SLIDER_LIMITS.capexPctRevenue.max,
    step: SCENARIO_SLIDER_LIMITS.capexPctRevenue.step,
    format: (value) => `${value.toFixed(1)}%`,
    icon: Activity,
    iconClassName: 'text-cyan-600',
  },
  {
    key: 'deltaNwcPct',
    label: 'ΔNWC % of Revenue',
    min: SCENARIO_SLIDER_LIMITS.deltaNwcPct.min,
    max: SCENARIO_SLIDER_LIMITS.deltaNwcPct.max,
    step: SCENARIO_SLIDER_LIMITS.deltaNwcPct.step,
    format: (value) => `${value.toFixed(1)}%`,
    icon: Activity,
    iconClassName: 'text-emerald-600',
  },
  {
    key: 'taxRate',
    label: 'Effective Tax Rate',
    min: SCENARIO_SLIDER_LIMITS.taxRate.min,
    max: SCENARIO_SLIDER_LIMITS.taxRate.max,
    step: SCENARIO_SLIDER_LIMITS.taxRate.step,
    format: (value) => `${value.toFixed(1)}%`,
    icon: Activity,
    iconClassName: 'text-amber-600',
  },
];

// Extended response type that includes OpenAI-enriched assumptions
type EnrichedModelResponse = GenerateModelResponse & {
  assumptions?: any; // ThreeStatementAssumptions (unified for all model types)
  summaryText?: string; // AI-generated summary of the base case
  state?: 'draft' | 'assumptions_required' | 'computable' | 'generating' | 'generated' | 'failed';
  missingInputs?: string[];
  requiredInputs?: MissingInputSpec[];
  estimatedInputs?: Array<{ key: string; value: number; source: string; confidence: 'low' | 'medium' | 'high' }>;
};

type BreakEvenResult = {
  converged: boolean;
  modelType: 'dcf' | 'lbo';
  solveFor: string;
  solvedValue: number;
  achievedValue: number | null;
  targetValue: number;
  residualError: number | null;
  iterations: number;
  reason?: string;
  fixedAssumptions?: Record<string, number | string>;
};
const EMPTY_PREVIEW = { sheetName: '', columns: [] as string[], rows: [] as (string | number | null)[][] };

/**
 * Parse manual input string to number (handles "100M", "1.5B", "1000", etc.)
 * Returns value in raw dollars (not millions)
 */
function parseManualInput(value: string): number {
  if (!value || value.trim() === '') return NaN;
  
  const trimmed = value.trim().toUpperCase().replace(/\s/g, '');
  
  // Handle notation like "100M", "1.5B", "500K"
  if (trimmed.endsWith('K')) {
    const num = parseFloat(trimmed.slice(0, -1));
    return isNaN(num) ? NaN : num * 1_000;
  } else if (trimmed.endsWith('M')) {
    const num = parseFloat(trimmed.slice(0, -1));
    return isNaN(num) ? NaN : num * 1_000_000;
  } else if (trimmed.endsWith('B')) {
    const num = parseFloat(trimmed.slice(0, -1));
    return isNaN(num) ? NaN : num * 1_000_000_000;
  } else if (trimmed.endsWith('T')) {
    const num = parseFloat(trimmed.slice(0, -1));
    return isNaN(num) ? NaN : num * 1_000_000_000_000;
  }
  
  // Try parsing as plain number (assume it's already in the correct units)
  const num = parseFloat(trimmed.replace(/,/g, ''));
  return isNaN(num) ? NaN : num;
}

const normalizeNarrativeText = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && typeof (parsed as any).summary === 'string') {
          return (parsed as any).summary as string;
        }
        return JSON.stringify(parsed, null, 2);
      } catch {
        return value;
      }
    }
    return value;
  }
  if (typeof value === 'object') {
    const parsed = value as Record<string, unknown>;
    if (typeof parsed.summary === 'string') {
      return parsed.summary;
    }
    try {
      return JSON.stringify(parsed, null, 2);
    } catch {
      return null;
    }
  }
  return String(value);
};

const firstNumeric = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'number' && Number.isFinite(item)) return item;
    }
  }
  return undefined;
};

const getMatrixExtents = (matrix: Array<Array<number | null | undefined>>): { min: number; max: number } | null => {
  const numbers: number[] = [];
  matrix.forEach((row) => {
    row.forEach((value) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        numbers.push(value);
      }
    });
  });
  if (numbers.length === 0) return null;
  return {
    min: Math.min(...numbers),
    max: Math.max(...numbers),
  };
};

const getHeatColor = (
  value: number | null | undefined,
  extents: { min: number; max: number } | null
): string | undefined => {
  if (value === null || value === undefined || !Number.isFinite(value) || !extents) return undefined;
  const span = extents.max - extents.min;
  const ratio = span > 0 ? (value - extents.min) / span : 0.5;
  const hue = 8 + ratio * 132; // red -> green
  return `hsl(${hue.toFixed(0)} 72% 86%)`;
};


function CreateModelPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const demoEnabled = isDemoMode(searchParams);
  const {
    modelAssumptions,
    setIncludeScenarios,
    setActiveScenario,
    updateScenarioValue,
    applyDemoScenarioDefaults,
    resetAssumptions,
  } = useModelAssumptions();
  const formRef = useRef<HTMLFormElement>(null);
  const initialType = useMemo(() => {
    const param = searchParams.get('type');
    return CREATE_MODEL_OPTIONS.some((option) => option.value === param) ? (param as ModelType) : 'three-statement';
  }, [searchParams]);

  const [modelType, setModelType] = useState<ModelType>(initialType);
  
  // Initialize ticker: check query param first, then localStorage (if "remember last ticker" is enabled), else blank
  const initialTicker = useMemo(() => {
    // Check query param
    const tickerParam = searchParams.get('ticker');
    if (tickerParam) {
      return tickerParam.toUpperCase();
    }
    
    // Check localStorage for "remember last ticker" setting (if enabled)
    if (typeof window !== 'undefined') {
      const rememberTicker = localStorage.getItem('cb_remember_ticker') === '1';
      if (rememberTicker) {
        const lastTicker = localStorage.getItem('cb_last_ticker');
        if (lastTicker) {
          return lastTicker.toUpperCase();
        }
      }
    }
    
    // Default: blank
    return '';
  }, [searchParams]);
  
  const [ticker, setTicker] = useState(initialTicker);
  const [companyMode, setCompanyMode] = useState<CompanyMode>('public');
  const isPrivateMode = companyMode === 'private';
  type DemoCompany = { ticker: string; company_name: string | null; sector: string | null };
  const [demoCompanies, setDemoCompanies] = useState<DemoCompany[]>([]);
  const [demoSearch, setDemoSearch] = useState('');
  const [demoSectorFilter, setDemoSectorFilter] = useState<string>('');
  const demoTickers = useMemo(() => demoCompanies.map((c) => c.ticker.toUpperCase()), [demoCompanies]);
  const normalizedTicker = ticker.trim().toUpperCase();
  const demoDataActive = demoEnabled;
  const demoTickerAllowed =
    !demoDataActive ||
    !normalizedTicker ||
    demoTickers.length === 0 ||
    demoTickers.includes(normalizedTicker);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const lastScenarioSeedTickerRef = useRef<string | null>(null);

  const [demoFetched, setDemoFetched] = useState(false);
  const [demoLoadError, setDemoLoadError] = useState(false);

  useEffect(() => {
    if (!demoDataActive) return;
    setDemoFetched(false);
    setDemoLoadError(false);
    let active = true;
    const url = '/api/demo/tickers?demo=true';
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        const list = Array.isArray(data?.companies) ? data.companies : [];
        setDemoCompanies(
          list.map((row: { ticker?: string; company_name?: string | null; sector?: string | null }) => ({
            ticker: String(row.ticker ?? '').trim().toUpperCase(),
            company_name: row.company_name != null ? String(row.company_name) : null,
            sector: row.sector != null ? String(row.sector).trim() || null : null,
          }))
        );
        setDemoFetched(true);
      })
      .catch(() => {
        if (active) {
          setDemoCompanies([]);
          setDemoLoadError(true);
          setDemoFetched(true);
        }
      });
    return () => {
      active = false;
    };
  }, [demoDataActive]);

  useEffect(() => {
    if (!demoDataActive) return;
    if (isPrivateMode) return;
    if (!normalizedTicker) return;
    if (!demoTickerAllowed) return;
    if (lastScenarioSeedTickerRef.current === normalizedTicker) return;

    let active = true;
    fetch(`/api/demo/fundamentals?ticker=${encodeURIComponent(normalizedTicker)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data?.error) return;
        if (typeof data?.ticker !== 'string') return;
        lastScenarioSeedTickerRef.current = normalizedTicker;
        applyDemoScenarioDefaults({
          ticker: data.ticker,
          sector: typeof data.sector === 'string' ? data.sector : null,
          revenueLTM: typeof data.revenueLTM === 'number' ? data.revenueLTM : null,
          ebitdaLTM: typeof data.ebitdaLTM === 'number' ? data.ebitdaLTM : null,
        });
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [applyDemoScenarioDefaults, demoDataActive, demoTickerAllowed, isPrivateMode, normalizedTicker]);

  const demoUniqueSectors = useMemo(() => {
    const set = new Set<string>();
    demoCompanies.forEach((c) => {
      if (c.sector) set.add(c.sector);
    });
    return Array.from(set).sort();
  }, [demoCompanies]);

  const demoFilteredCompanies = useMemo(() => {
    let list = demoCompanies;
    const q = demoSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.ticker.toLowerCase().includes(q) ||
          (c.company_name ?? '').toLowerCase().includes(q)
      );
    }
    if (demoSectorFilter) {
      list = list.filter((c) => (c.sector ?? '') === demoSectorFilter);
    }
    return list;
  }, [demoCompanies, demoSearch, demoSectorFilter]);
  
  // Scenario configuration (global state)
  const activeScenarioTab = modelAssumptions.activeScenario;
  // Scenario controls remain editable; no locking after generation.
  const [showAdvancedDcf, setShowAdvancedDcf] = useState(false);
  const [advancedDcfForm, setAdvancedDcfForm] = useState<AdvancedDcfFormState>(() => createDefaultAdvancedDcfState());
  const [showAdvancedLbo, setShowAdvancedLbo] = useState(false);
  const [advancedLboForm, setAdvancedLboForm] = useState<AdvancedLboFormState>(() => createDefaultAdvancedLboState());
  
  // Comps-specific configuration
  const [customComps, setCustomComps] = useState('');
  const [useOnlyCustom, setUseOnlyCustom] = useState(false);
  
  // Merger-specific configuration
  const [mergerInputs, setMergerInputs] = useState<Partial<MergerModelInput>>({});
  const [mergerInputsValid, setMergerInputsValid] = useState(false);
  
  // Operating-specific configuration
  const [operatingInputs, setOperatingInputs] = useState<Partial<OperatingModelInput>>({});
  const [operatingInputsValid, setOperatingInputsValid] = useState(false);
  
  // Manual financial inputs (for data that can't be fetched via API/AI/web scraping)
  const [showManualInputs, setShowManualInputs] = useState(false);
  const [manualInputs, setManualInputs] = useState({
    companyName: '',
    currency: 'USD',
    revenueHistory: '',
    revenueGrowthPct: '8.0',
    ebitMarginPct: '20.0',
    taxRatePct: '25.0',
    daPctRevenue: '4.0',
    capexPctRevenue: '4.0',
    nwcPctRevenue: '2.0',
    price: '',
    revenue: '',
    ebitda: '',
    ebit: '',
    netIncome: '',
    sharesOutstanding: '',
    netDebt: '',
    marketCap: '',
    grossProfit: '',
    operatingIncome: '',
    totalDebt: '',
    cash: '',
  });
  const privateRequiredFields = useMemo<ManualInputFieldKey[]>(
    () => PRIVATE_REQUIRED_FIELDS_BY_MODEL[modelType] ?? ['companyName', 'revenue'],
    [modelType]
  );
  const isPrivateFieldRequired = useCallback(
    (field: ManualInputFieldKey) => isPrivateMode && privateRequiredFields.includes(field),
    [isPrivateMode, privateRequiredFields]
  );
  const privateRequirementsSummary = useMemo(
    () => privateRequiredFields.map((field) => PRIVATE_FIELD_LABELS[field]).join(', '),
    [privateRequiredFields]
  );

  const [missingInputOverrides, setMissingInputOverrides] = useState<Record<string, any>>({});
  // Keep a ref so "Apply & Re-run" can submit immediately with the latest patch
  // (React state updates are async, and we retry generation right away).
  const missingInputOverridesRef = useRef<Record<string, any>>({});

  useEffect(() => {
    missingInputOverridesRef.current = missingInputOverrides;
  }, [missingInputOverrides]);
  
  // Track which fields are missing (determined after data fetch attempt)
  const [missingFields, setMissingFields] = useState<Set<string>>(new Set());
  
  // Applied defaults and warnings from API
  const [appliedDefaults, setAppliedDefaults] = useState<any[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<string[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelData, setModelData] = useState<ModelData | null>(null);
  const [generatedModel, setGeneratedModel] = useState<EnrichedModelResponse | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [lastDurationMs, setLastDurationMs] = useState<number | undefined>(undefined);
  const [timerStats, setTimerStats] = useState<{ p50Ms: number | null; p80Ms: number | null } | undefined>();
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportText, setReportText] = useState<string | null>(null);
  const [reportPayload, setReportPayload] = useState<any>(null);
  const [insightCards, setInsightCards] = useState<InsightCard[]>([]);
  const [reportPdfUrl, setReportPdfUrl] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'error'>('idle');
  const scenarioControlsDisabled = loading;
  const [lastRequestBody, setLastRequestBody] = useState<Record<string, any> | null>(null);
  const clearReverseDcfAnchorError = useCallback(() => {
    setError((prev) =>
      prev && prev.toLowerCase().includes('reverse dcf requires') ? null : prev
    );
  }, []);
  const aiSummaryText = normalizeNarrativeText(modelData?.summary);
  const aiKeyAssumptions = Array.isArray(modelData?.keyAssumptions) ? modelData.keyAssumptions : [];
  const hasAiSummaryCard = Boolean(aiSummaryText) || aiKeyAssumptions.length > 0;
  const recomputeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scenarioFeatureEnabled =
    modelType === 'dcf' ||
    modelType === 'lbo' ||
    modelType === 'three-statement';
  const assumptionErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!scenarioFeatureEnabled) return errors;
    const base = modelAssumptions.scenarios.base;
    if (!Number.isFinite(base.wacc)) {
      errors.wacc = 'WACC is required.';
    }
    if (!Number.isFinite(base.terminalGrowth)) {
      errors.terminalGrowth = 'Terminal growth is required.';
    }
    if (
      Number.isFinite(base.wacc) &&
      Number.isFinite(base.terminalGrowth) &&
      base.wacc <= base.terminalGrowth
    ) {
      errors.wacc = 'WACC must be greater than terminal growth.';
      errors.terminalGrowth = 'Terminal growth must be below WACC.';
    }
    return errors;
  }, [modelAssumptions, scenarioFeatureEnabled]);
  
  // Required inputs validation
  const [missingInputsModalOpen, setMissingInputsModalOpen] = useState(false);
  const [missingInputs, setMissingInputs] = useState<string[]>([]);
  const [estimatedInputs, setEstimatedInputs] = useState<Array<{ key: string; value: number; source: string; confidence: 'low' | 'medium' | 'high' }>>([]);
  const [missingInputSpecsOverride, setMissingInputSpecsOverride] = useState<MissingInputSpec[]>([]);
  const missingInputSpecs = useMemo(() => {
    if (missingInputSpecsOverride.length > 0) return missingInputSpecsOverride;
    return buildMissingInputSpecs(modelType, missingInputs);
  }, [modelType, missingInputs, missingInputSpecsOverride]);
  
  // LBO required inputs state
  const [quickLboMode, setQuickLboMode] = useState(true);
  const [lboRequiredInputs, setLboRequiredInputs] = useState({
    entryMultiple: '10.0',
    exitMultiple: '10.0',
    transactionFeesPercent: '1.5',
    exitFeesPercent: '1.0',
    debtPercent: '60',
    equityPercent: '40',
    interestRate: '7.0',
    amortizationPercent: '5.0',
    cashSweepPercent: '100',
    revenueGrowth: '5.0',
    ebitdaMargin: '25.0',
    capexPctRevenue: '4.0',
    deltaNwcPctRevenue: '2.0',
    taxRate: '25.0',
    holdingPeriodYears: '5',
    minimumCashBalance: '0',
  });
  const [reverseDcfInputs, setReverseDcfInputs] = useState({
    waccPct: '10.0',
    terminalGrowthPct: '2.5',
    projectionYears: '5',
    targetPrice: '',
  });
  const [debtCapacityLiteInputs, setDebtCapacityLiteInputs] = useState(
    createDefaultDebtCapacityLiteState
  );
  const [dcfSensitivityInputs, setDcfSensitivityInputs] = useState(createDefaultDcfSensitivityState);
  const [lboSensitivityInputs, setLboSensitivityInputs] = useState(createDefaultLboSensitivityState);
  const [sensitivityLoading, setSensitivityLoading] = useState(false);
  const [sensitivityError, setSensitivityError] = useState<string | null>(null);
  const [breakEvenSolveFor, setBreakEvenSolveFor] = useState<'revenueGrowth' | 'ebitdaMargin' | 'exitMultiple' | 'entryMultiple'>('revenueGrowth');
  const [breakEvenTargetPrice, setBreakEvenTargetPrice] = useState('');
  const [breakEvenTargetIrr, setBreakEvenTargetIrr] = useState('');
  const [breakEvenLoading, setBreakEvenLoading] = useState(false);
  const [breakEvenError, setBreakEvenError] = useState<string | null>(null);
  const [breakEvenResult, setBreakEvenResult] = useState<BreakEvenResult | null>(null);
  const { toasts, showToast, removeToast } = useToast();
  const reverseDcfInlineError =
    modelType === 'reverse-dcf' && error
      ? (() => {
          const lower = error.toLowerCase();
          return lower.includes('reverse dcf') ||
            lower.includes('wacc') ||
            lower.includes('terminal growth') ||
            lower.includes('projection years') ||
            lower.includes('target price') ||
            lower.includes('market cap') ||
            lower.includes('share price') ||
            lower.includes('shares outstanding')
            ? error
            : null;
        })()
      : null;
  const globalFormError = error && error !== reverseDcfInlineError ? error : null;

  useEffect(() => {
    setModelType(initialType);
  }, [initialType]);

  // Update ticker when query param changes
  useEffect(() => {
    const tickerParam = searchParams.get('ticker');
    if (tickerParam) {
      setTicker(tickerParam.toUpperCase());
    }
  }, [searchParams]);

  // Save last ticker to localStorage when it changes (if "remember last ticker" is enabled)
  useEffect(() => {
    if (ticker && typeof window !== 'undefined') {
      const rememberTicker = localStorage.getItem('cb_remember_ticker') === '1';
      if (rememberTicker) {
        localStorage.setItem('cb_last_ticker', ticker);
      }
    }
  }, [ticker]);

  useEffect(() => {
    setError(null);
    setMissingInputs([]);
    setMissingInputSpecsOverride([]);
    setEstimatedInputs([]);
    setMissingInputsModalOpen(false);
    setMissingFields(new Set());
  }, [modelType, companyMode]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[assumptions] updated', {
        activeScenario: modelAssumptions.activeScenario,
        includeScenarios: modelAssumptions.includeScenarios,
        base: modelAssumptions.scenarios.base,
      });
    }
  }, [modelAssumptions]);

  useEffect(() => {
    if (!scenarioFeatureEnabled || !showResults || loading) return;
    if (!formRef.current) return;
    if (recomputeTimerRef.current) {
      clearTimeout(recomputeTimerRef.current);
    }
    recomputeTimerRef.current = setTimeout(() => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[assumptions] recompute triggered');
      }
      formRef.current?.requestSubmit();
    }, 600);
    return () => {
      if (recomputeTimerRef.current) {
        clearTimeout(recomputeTimerRef.current);
      }
    };
  }, [modelAssumptions, scenarioFeatureEnabled, showResults, loading]);

  useEffect(() => {
    if (modelType !== 'lbo') {
      setShowAdvancedLbo(false);
      setAdvancedLboForm(createDefaultAdvancedLboState());
      setQuickLboMode(true);
    }
  }, [modelType]);

  useEffect(() => {
    if (modelType === 'lbo' && quickLboMode) {
      setShowAdvancedLbo(false);
    }
  }, [modelType, quickLboMode]);

  useEffect(() => {
    if (!generatedModel) return;
    const dcfConfig = (generatedModel as any)?.dcfSummary?.sensitivity?.config;
    if (dcfConfig) {
      setDcfSensitivityInputs({
        waccRangePct: String(dcfConfig.waccRangePct ?? '2.0'),
        waccStepPct: String(dcfConfig.waccStepPct ?? '0.5'),
        terminalGrowthRangePct: String(dcfConfig.terminalGrowthRangePct ?? '1.0'),
        terminalGrowthStepPct: String(dcfConfig.terminalGrowthStepPct ?? '0.25'),
      });
    }
    const lboConfig = (generatedModel as any)?.lboSummary?.sensitivity?.config;
    if (lboConfig) {
      setLboSensitivityInputs({
        entryRange: String(lboConfig.entryRange ?? '2.0'),
        entryStep: String(lboConfig.entryStep ?? '0.5'),
        exitRange: String(lboConfig.exitRange ?? '2.0'),
        exitStep: String(lboConfig.exitStep ?? '0.5'),
      });
    }
    setSensitivityError(null);
    if (generatedModel.modelType === 'dcf') {
      setBreakEvenSolveFor('revenueGrowth');
      setBreakEvenTargetPrice('');
      setBreakEvenTargetIrr('');
    } else if (generatedModel.modelType === 'lbo') {
      setBreakEvenSolveFor('exitMultiple');
      const baseIrr = (generatedModel as any)?.lboSummary?.returns?.irr;
      setBreakEvenTargetIrr(
        typeof baseIrr === 'number' && Number.isFinite(baseIrr) ? (baseIrr * 100).toFixed(1) : ''
      );
      setBreakEvenTargetPrice('');
    }
    setBreakEvenError(null);
    setBreakEvenResult(null);
  }, [generatedModel]);

  const fetchModelStats = useCallback(async (symbol: string, type: string) => {
    try {
      const response = await fetch(
        `/api/modelMetrics?ticker=${encodeURIComponent(symbol)}&modelType=${encodeURIComponent(type)}`
      );
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      setTimerStats({
        p50Ms: typeof data?.p50Ms === 'number' ? data.p50Ms : null,
        p80Ms: typeof data?.p80Ms === 'number' ? data.p80Ms : null,
      });
    } catch (err) {
      console.error('[ModelMetrics] Failed to fetch stats', err);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (reportPdfUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(reportPdfUrl);
      }
    };
  }, [reportPdfUrl]);

  const handleAdvancedInputChange = (field: keyof AdvancedLboFormState, value: string) => {
    setAdvancedLboForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAdvancedDcfInputChange = (field: keyof AdvancedDcfFormState, value: string) => {
    setAdvancedDcfForm((prev) => ({ ...prev, [field]: value }));
  };

  const parseAdvancedNumber = (value: string): number | undefined => {
    if (value === undefined || value === null) return undefined;
    const trimmed = value.toString().trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const parsePercentInput = (value: string): number | undefined => {
    const parsed = parseAdvancedNumber(value);
    if (parsed === undefined) return undefined;
    return parsed / 100;
  };

  const normalizeAdvancedLboOptions = (): LboAdvancedOptions | undefined => {
    if (modelType !== 'lbo') {
      return undefined;
    }
    const normalized: LboAdvancedOptions = {};
    const pctValue = parseAdvancedNumber(advancedLboForm.managementRolloverPct);
    if (pctValue !== undefined && pctValue > 0) {
      normalized.managementRolloverPct = Math.min(Math.max(pctValue / 100, 0), 0.9);
    }
    const preferred = parseAdvancedNumber(advancedLboForm.preferredEquityAmount);
    if (preferred !== undefined && preferred > 0) {
      normalized.preferredEquityAmount = preferred;
    }
    const subNotes = parseAdvancedNumber(advancedLboForm.subordinatedNotesAmount);
    if (subNotes !== undefined && subNotes > 0) {
      normalized.subordinatedNotesAmount = subNotes;
    }
    const minCash = parseAdvancedNumber(advancedLboForm.minimumCashAtClose);
    if (minCash !== undefined && minCash > 0) {
      normalized.minimumCashAtClose = minCash;
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
  };

  const parseManualNumber = (value: unknown): number | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    const trimmed = value.toString().trim();
    if (!trimmed) return undefined;
    const cleaned = trimmed.replace(/\$/g, '').replace(/,/g, '').replace(/\s+/g, '');
    const match = cleaned.match(/^(-?\d*\.?\d+)\s*([kmbt])?$/i);
    if (match) {
      const base = Number(match[1]);
      if (!Number.isFinite(base)) return undefined;
      const suffix = match[2]?.toLowerCase();
      const multiplier =
        suffix === 'k' ? 1e3 :
        suffix === 'm' ? 1e6 :
        suffix === 'b' ? 1e9 :
        suffix === 't' ? 1e12 :
        1;
      return base * multiplier;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const reverseDcfManualMarketCap = parseManualNumber(manualInputs.marketCap);
  const reverseDcfManualSharePrice = parseManualNumber(manualInputs.price);
  const reverseDcfManualShares = parseManualNumber(manualInputs.sharesOutstanding);
  const reverseDcfHasMarketCapAnchor =
    reverseDcfManualMarketCap !== undefined && reverseDcfManualMarketCap > 0;
  const reverseDcfHasShareAnchor =
    reverseDcfManualSharePrice !== undefined &&
    reverseDcfManualSharePrice > 0 &&
    reverseDcfManualShares !== undefined &&
    reverseDcfManualShares > 0;
  const reverseDcfHasTargetPriceAnchor = (() => {
    const tp = parseAdvancedNumber(reverseDcfInputs.targetPrice);
    return tp !== undefined && tp > 0;
  })();
  const reverseDcfMissingPrivateAnchor =
    modelType === 'reverse-dcf' &&
    isPrivateMode &&
    !reverseDcfHasMarketCapAnchor &&
    !reverseDcfHasShareAnchor &&
    !reverseDcfHasTargetPriceAnchor;

  const normalizeMissingOverrides = (overrides: Record<string, any>) => ({
    price: overrides.price,
    marketCap: overrides.market_cap ?? overrides.marketCap,
    netIncome: overrides.net_income ?? overrides.netIncome,
    revenue: overrides.revenue,
    ebitda: overrides.ebitda,
    ebit: overrides.ebit,
    cash: overrides.cash,
    totalDebt: overrides.total_debt ?? overrides.totalDebt,
    netDebt: overrides.net_debt ?? overrides.netDebt,
    sharesOutstanding: overrides.shares_out_basic ?? overrides.sharesOutstanding,
    rf_rate: overrides.rf_rate,
    equity_risk_premium: overrides.equity_risk_premium,
    beta: overrides.beta,
    cost_of_debt: overrides.cost_of_debt,
    tax_rate_assumption: overrides.tax_rate_assumption,
    terminal_growth: overrides.terminal_growth ?? overrides.terminalGrowth,
    exit_multiple: overrides.exit_multiple ?? overrides.exitMultiple,
    leverage_multiple: overrides.leverage_multiple ?? overrides.leverageMultiple,
    debt_rate: overrides.debt_rate ?? overrides.debtRate,
    holding_period_years: overrides.holding_period_years ?? overrides.holdingPeriodYears,
    entry_multiple: overrides.entry_multiple ?? overrides.entryMultiple,
    transaction_fees_percent: overrides.transaction_fees_percent ?? overrides.transactionFeesPercent,
    exit_fees_percent: overrides.exit_fees_percent ?? overrides.exitFeesPercent,
    debt_percent: overrides.debt_percent ?? overrides.debtPercent,
    equity_percent: overrides.equity_percent ?? overrides.equityPercent,
    interest_rate: overrides.interest_rate ?? overrides.interestRate,
    amortization_percent: overrides.amortization_percent ?? overrides.amortizationPercent,
    cash_sweep_percent: overrides.cash_sweep_percent ?? overrides.cashSweepPercent,
    revenue_growth: overrides.revenue_growth ?? overrides.revenueGrowth,
    ebitda_margin: overrides.ebitda_margin ?? overrides.ebitdaMargin,
    capex_pct_revenue: overrides.capex_pct_revenue ?? overrides.capexPctRevenue,
    delta_nwc_pct_revenue: overrides.delta_nwc_pct_revenue ?? overrides.deltaNwcPctRevenue,
    tax_rate: overrides.tax_rate ?? overrides.taxRate,
    minimum_cash_balance: overrides.minimum_cash_balance ?? overrides.minimumCashBalance,
  });

  const handleMissingInputsApply = useCallback(
    (patch: Record<string, any>) => {
      // Ensure the very next retry sees the patch even before state updates flush.
      missingInputOverridesRef.current = { ...missingInputOverridesRef.current, ...patch };
      setMissingInputOverrides((prev) => ({ ...prev, ...patch }));
      const normalized = normalizeMissingOverrides(patch);
      if (patch.customPeers && typeof patch.customPeers === 'string') {
        setCustomComps(patch.customPeers);
        setUseOnlyCustom(true);
      }
      setManualInputs((prev) => {
        const next = { ...prev };
        if (normalized.price !== undefined) next.price = String(normalized.price);
        if (normalized.revenue !== undefined) next.revenue = String(normalized.revenue);
        if (normalized.ebitda !== undefined) next.ebitda = String(normalized.ebitda);
        if (normalized.ebit !== undefined) next.ebit = String(normalized.ebit);
        if (normalized.netIncome !== undefined) next.netIncome = String(normalized.netIncome);
        if (normalized.sharesOutstanding !== undefined) next.sharesOutstanding = String(normalized.sharesOutstanding);
        if (normalized.netDebt !== undefined) next.netDebt = String(normalized.netDebt);
        if (normalized.marketCap !== undefined) next.marketCap = String(normalized.marketCap);
        if (normalized.totalDebt !== undefined) next.totalDebt = String(normalized.totalDebt);
        if (normalized.cash !== undefined) next.cash = String(normalized.cash);
        return next;
      });

      if (modelType === 'lbo') {
        setLboRequiredInputs((prev) => ({
          ...prev,
          entryMultiple:
            normalized.entry_multiple !== undefined ? String(normalized.entry_multiple) : prev.entryMultiple,
          exitMultiple:
            normalized.exit_multiple !== undefined ? String(normalized.exit_multiple) : prev.exitMultiple,
          transactionFeesPercent:
            normalized.transaction_fees_percent !== undefined ? String(normalized.transaction_fees_percent * 100) : prev.transactionFeesPercent,
          exitFeesPercent:
            normalized.exit_fees_percent !== undefined ? String(normalized.exit_fees_percent * 100) : prev.exitFeesPercent,
          debtPercent:
            normalized.debt_percent !== undefined
              ? String(normalized.debt_percent * 100)
              : normalized.leverage_multiple !== undefined && normalized.entry_multiple
                ? String((normalized.leverage_multiple / normalized.entry_multiple) * 100)
                : prev.debtPercent,
          equityPercent:
            normalized.equity_percent !== undefined ? String(normalized.equity_percent * 100) : prev.equityPercent,
          interestRate:
            normalized.interest_rate !== undefined
              ? String(normalized.interest_rate * 100)
              : normalized.debt_rate !== undefined
                ? String(normalized.debt_rate * 100)
                : prev.interestRate,
          amortizationPercent:
            normalized.amortization_percent !== undefined ? String(normalized.amortization_percent * 100) : prev.amortizationPercent,
          cashSweepPercent:
            normalized.cash_sweep_percent !== undefined ? String(normalized.cash_sweep_percent * 100) : prev.cashSweepPercent,
          revenueGrowth:
            normalized.revenue_growth !== undefined ? String(normalized.revenue_growth * 100) : prev.revenueGrowth,
          ebitdaMargin:
            normalized.ebitda_margin !== undefined ? String(normalized.ebitda_margin * 100) : prev.ebitdaMargin,
          capexPctRevenue:
            normalized.capex_pct_revenue !== undefined ? String(normalized.capex_pct_revenue * 100) : prev.capexPctRevenue,
          deltaNwcPctRevenue:
            normalized.delta_nwc_pct_revenue !== undefined ? String(normalized.delta_nwc_pct_revenue * 100) : prev.deltaNwcPctRevenue,
          taxRate:
            normalized.tax_rate !== undefined ? String(normalized.tax_rate * 100) : prev.taxRate,
          holdingPeriodYears:
            normalized.holding_period_years !== undefined ? String(normalized.holding_period_years) : prev.holdingPeriodYears,
          minimumCashBalance:
            normalized.minimum_cash_balance !== undefined ? String(normalized.minimum_cash_balance) : prev.minimumCashBalance,
        }));
      }
    },
    [modelType]
  );

  const handleMissingInputsRetry = useCallback(() => {
    requestAnimationFrame(() => {
      formRef.current?.requestSubmit();
    });
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    // Define trimmedTicker for non-merger, non-operating models
    const trimmedTicker = modelType !== 'merger' && modelType !== 'operating' 
      ? ticker.trim().toUpperCase() 
      : '';
    
    // For merger models, ticker validation is different (needs buyer + target)
    if (modelType !== 'merger' && modelType !== 'operating') {
      if (!isPrivateMode && !trimmedTicker) {
        setError('Please enter a ticker.');
        return;
      }
      if (!isPrivateMode && demoDataActive && demoTickers.length > 0 && !demoTickers.includes(trimmedTicker)) {
        setError('Demo Mode is active. Choose a demo company to continue.');
        return;
      }
    }

    if (isPrivateMode) {
      const manualRevenue = parseManualNumber(manualInputs.revenue);
      const manualGrowthPct = parseAdvancedNumber(manualInputs.revenueGrowthPct);
      const manualMarginPct = parseAdvancedNumber(manualInputs.ebitMarginPct);
      const manualTaxPct = parseAdvancedNumber(manualInputs.taxRatePct);
      const manualCapexPct = parseAdvancedNumber(manualInputs.capexPctRevenue);
      const manualNwcPct = parseAdvancedNumber(manualInputs.nwcPctRevenue);
      const manualEbitda = parseManualNumber(manualInputs.ebitda);
      const manualNetIncome = parseManualNumber(manualInputs.netIncome);

      const privateFieldValidators: Partial<Record<ManualInputFieldKey, () => boolean>> = {
        companyName: () => manualInputs.companyName.trim().length > 0,
        revenue: () => manualRevenue !== undefined && manualRevenue > 0,
        revenueGrowthPct: () => manualGrowthPct !== undefined,
        ebitMarginPct: () => manualMarginPct !== undefined,
        taxRatePct: () => manualTaxPct !== undefined,
        capexPctRevenue: () => manualCapexPct !== undefined,
        nwcPctRevenue: () => manualNwcPct !== undefined,
        ebitda: () => manualEbitda !== undefined && manualEbitda > 0,
        netIncome: () => manualNetIncome !== undefined,
      };

      const invalidField = privateRequiredFields.find((field) => {
        const validator = privateFieldValidators[field];
        return validator ? !validator() : false;
      });

      if (invalidField) {
        setError(`Private mode requires ${PRIVATE_FIELD_LABELS[invalidField]}.`);
        return;
      }
    }

    // Validate required inputs before generation
    if (modelType === 'reverse-dcf') {
      const waccPct = parseAdvancedNumber(reverseDcfInputs.waccPct);
      const terminalGrowthPct = parseAdvancedNumber(reverseDcfInputs.terminalGrowthPct);
      const projectionYears = parseAdvancedNumber(reverseDcfInputs.projectionYears);
      const targetPrice = parseAdvancedNumber(reverseDcfInputs.targetPrice);
      const manualMarketCap = parseManualNumber(manualInputs.marketCap);
      const manualSharePrice = parseManualNumber(manualInputs.price);
      const manualShares = parseManualNumber(manualInputs.sharesOutstanding);

      if (
        waccPct === undefined ||
        terminalGrowthPct === undefined ||
        projectionYears === undefined
      ) {
        setError('Reverse DCF requires WACC, terminal growth, and projection years.');
        return;
      }
      if (waccPct <= 0 || waccPct >= 60) {
        setError('WACC must be between 0% and 60%.');
        return;
      }
      if (terminalGrowthPct <= -10 || terminalGrowthPct >= waccPct) {
        setError('Terminal growth must be less than WACC.');
        return;
      }
      if (projectionYears < 3 || projectionYears > 10) {
        setError('Projection years must be between 3 and 10.');
        return;
      }
      if (reverseDcfInputs.targetPrice.trim().length > 0 && (targetPrice === undefined || targetPrice <= 0)) {
        setError('Target price must be a positive number when provided.');
        return;
      }
      if (isPrivateMode) {
        const hasMarketCap = manualMarketCap !== undefined && manualMarketCap > 0;
        const hasTargetPrice = targetPrice !== undefined && targetPrice > 0;
        const hasShareAnchor =
          manualSharePrice !== undefined &&
          manualSharePrice > 0 &&
          manualShares !== undefined &&
          manualShares > 0;
        if (!hasMarketCap && !hasShareAnchor && !hasTargetPrice) {
          setError('Reverse DCF requires market cap, target price, or share price + shares outstanding.');
          return;
        }
      }
    }

    if (modelType === 'dcf') {
      const waccRangePct = parseAdvancedNumber(dcfSensitivityInputs.waccRangePct);
      const waccStepPct = parseAdvancedNumber(dcfSensitivityInputs.waccStepPct);
      const terminalGrowthRangePct = parseAdvancedNumber(dcfSensitivityInputs.terminalGrowthRangePct);
      const terminalGrowthStepPct = parseAdvancedNumber(dcfSensitivityInputs.terminalGrowthStepPct);
      if (
        waccRangePct === undefined ||
        waccStepPct === undefined ||
        terminalGrowthRangePct === undefined ||
        terminalGrowthStepPct === undefined
      ) {
        setError('Sensitivity inputs require range and step values.');
        return;
      }
      if (
        waccRangePct <= 0 ||
        waccStepPct <= 0 ||
        terminalGrowthRangePct <= 0 ||
        terminalGrowthStepPct <= 0
      ) {
        setError('Sensitivity range and step values must be positive.');
        return;
      }
    }

    if (modelType === 'debt-capacity-lite') {
      const maxLeverage = parseAdvancedNumber(debtCapacityLiteInputs.maxLeverage);
      const minInterestCoverage = parseAdvancedNumber(debtCapacityLiteInputs.minInterestCoverage);
      const interestRatePct = parseAdvancedNumber(debtCapacityLiteInputs.interestRatePct);
      if (maxLeverage === undefined || minInterestCoverage === undefined || interestRatePct === undefined) {
        setError('Debt Capacity Lite requires max leverage, minimum interest coverage, and interest rate.');
        return;
      }
      if (maxLeverage <= 0 || maxLeverage > 20) {
        setError('Max leverage must be greater than 0x and no more than 20x.');
        return;
      }
      if (minInterestCoverage <= 0 || minInterestCoverage > 20) {
        setError('Minimum interest coverage must be greater than 0x and no more than 20x.');
        return;
      }
      if (interestRatePct <= 0 || interestRatePct > 100) {
        setError('Interest rate must be greater than 0% and no more than 100%.');
        return;
      }
    }

    if (modelType === 'lbo') {
      const entryRange = parseAdvancedNumber(lboSensitivityInputs.entryRange);
      const entryStep = parseAdvancedNumber(lboSensitivityInputs.entryStep);
      const exitRange = parseAdvancedNumber(lboSensitivityInputs.exitRange);
      const exitStep = parseAdvancedNumber(lboSensitivityInputs.exitStep);
      if (
        entryRange === undefined ||
        entryStep === undefined ||
        exitRange === undefined ||
        exitStep === undefined
      ) {
        setError('Sensitivity inputs require entry/exit range and step values.');
        return;
      }
      if (entryRange <= 0 || entryStep <= 0 || exitRange <= 0 || exitStep <= 0) {
        setError('Sensitivity range and step values must be positive.');
        return;
      }
    }

    if (modelType === 'lbo') {
      const isQuickLbo = quickLboMode;
      const validation = validateModelInputs({
        entryMultiple: lboRequiredInputs.entryMultiple ? parseFloat(lboRequiredInputs.entryMultiple) : undefined,
        exitMultiple: lboRequiredInputs.exitMultiple ? parseFloat(lboRequiredInputs.exitMultiple) : undefined,
        transactionFeesPercent:
          !isQuickLbo && lboRequiredInputs.transactionFeesPercent
            ? parseFloat(lboRequiredInputs.transactionFeesPercent) / 100
            : undefined,
        exitFeesPercent:
          !isQuickLbo && lboRequiredInputs.exitFeesPercent
            ? parseFloat(lboRequiredInputs.exitFeesPercent) / 100
            : undefined,
        debtPercent: lboRequiredInputs.debtPercent ? parseFloat(lboRequiredInputs.debtPercent) : undefined,
        equityPercent:
          !isQuickLbo && lboRequiredInputs.equityPercent
            ? parseFloat(lboRequiredInputs.equityPercent)
            : undefined,
        interestRate: lboRequiredInputs.interestRate ? parseFloat(lboRequiredInputs.interestRate) / 100 : undefined,
        amortizationPercent:
          !isQuickLbo && lboRequiredInputs.amortizationPercent
            ? parseFloat(lboRequiredInputs.amortizationPercent) / 100
            : undefined,
        cashSweepPercent:
          !isQuickLbo && lboRequiredInputs.cashSweepPercent
            ? parseFloat(lboRequiredInputs.cashSweepPercent) / 100
            : undefined,
        revenueGrowth: lboRequiredInputs.revenueGrowth ? parseFloat(lboRequiredInputs.revenueGrowth) / 100 : undefined,
        ebitdaMargin:
          !isQuickLbo && lboRequiredInputs.ebitdaMargin
            ? parseFloat(lboRequiredInputs.ebitdaMargin) / 100
            : undefined,
        capexPctRevenue:
          !isQuickLbo && lboRequiredInputs.capexPctRevenue
            ? parseFloat(lboRequiredInputs.capexPctRevenue) / 100
            : undefined,
        deltaNwcPctRevenue:
          !isQuickLbo && lboRequiredInputs.deltaNwcPctRevenue
            ? parseFloat(lboRequiredInputs.deltaNwcPctRevenue) / 100
            : undefined,
        taxRate:
          !isQuickLbo && lboRequiredInputs.taxRate
            ? parseFloat(lboRequiredInputs.taxRate) / 100
            : undefined,
        holdingPeriodYears: lboRequiredInputs.holdingPeriodYears ? parseFloat(lboRequiredInputs.holdingPeriodYears) : undefined,
        minimumCashBalance:
          !isQuickLbo && lboRequiredInputs.minimumCashBalance
            ? parseFloat(lboRequiredInputs.minimumCashBalance)
            : undefined,
      }, { quickLbo: isQuickLbo });
      
      if (!validation.isValid) {
        const missingKeys = Array.isArray((validation as any).missingKeys)
          ? (validation as any).missingKeys
          : [];
        setMissingInputs(missingKeys.length > 0 ? missingKeys : validation.errors);
        setMissingInputsModalOpen(true);
        return;
      }
    }
    
    if (modelType === 'merger') {
      // TODO: Pass pulled data when available
      const missing = getMissingMergerInputs(mergerInputs);
      if (missing.length > 0) {
        setMissingInputs(missing);
        setMissingInputsModalOpen(true);
        return;
      }
    }
    
    if (modelType === 'operating') {
      const missing = getMissingOperatingInputs(operatingInputs);
      if (missing.length > 0) {
        setMissingInputs(missing);
        setMissingInputsModalOpen(true);
        return;
      }
    }

    const metricsModelTypeParam = modelType === 'three-statement' ? 'three-statement' : modelType;
    const runStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
    setError(null);
    setLoading(true);
    setShowResults(false);
    setGeneratedModel(null);
    setBreakEvenResult(null);
    setBreakEvenError(null);
    setBreakEvenLoading(false);
    setLastDurationMs(undefined);
    setTimerStats(undefined);
    setReportText(null);
    setReportPayload(null);
    setInsightCards([]);
    if (reportPdfUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(reportPdfUrl);
    }
    setReportPdfUrl(null);
    setReportError(null);
    setReportLoading(false);

      const includeScenarioFlag = scenarioFeatureEnabled ? modelAssumptions.includeScenarios : false;
    const baseScenario = modelAssumptions.scenarios.base;
    const scenarioInputsPayload = scenarioFeatureEnabled
      ? {
          base: mapScenarioInputsForApi(modelAssumptions.scenarios.base),
          ...(includeScenarioFlag
            ? {
                bull: mapScenarioInputsForApi(modelAssumptions.scenarios.bull),
                bear: mapScenarioInputsForApi(modelAssumptions.scenarios.bear),
              }
            : {}),
        }
      : undefined;
    const scenarioNoteText = includeScenarioFlag
      ? modelType === 'three-statement'
        ? `Base case: ${baseScenario.revenueGrowth}% revenue growth, ${baseScenario.ebitdaMargin}% EBITDA margin, ${baseScenario.daPctRevenue}% D&A, ${baseScenario.capexPctRevenue}% capex, ${baseScenario.deltaNwcPct}% ΔNWC, ${baseScenario.taxRate}% tax rate`
        : `Base case: ${baseScenario.revenueGrowth}% revenue growth, ${baseScenario.ebitdaMargin}% EBITDA margin, ${baseScenario.wacc}% WACC, ${baseScenario.terminalGrowth}% terminal growth`
      : undefined;

    let latestAnalysisData: ModelData | null = null;

    try {
      // Step 1: Generate model analysis with AI (optional - for display purposes)
      try {
        const analysisResponse = await fetch('/api/models/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticker: isPrivateMode ? undefined : trimmedTicker,
            companyName: companyName || undefined,
            modelType,
            includeScenario: includeScenarioFlag,
            scenarioNotes: scenarioNoteText || null,
          })
        });

        if (analysisResponse.ok) {
          const analysisData = await analysisResponse.json();
          latestAnalysisData = analysisData;
          setModelData(analysisData);
        }
      } catch (analysisError) {
        console.warn('AI analysis failed, continuing with Excel generation:', analysisError);
      }

      // Step 2: Generate Excel model with OpenAI-enriched assumptions
      // Note: If any data is missing, OpenAI fills in realistic values
      // so we never see zero NOPAT/FCF rows in the model
      const advancedLboPayload = normalizeAdvancedLboOptions();
      const normalizedOverrides = normalizeMissingOverrides(missingInputOverridesRef.current);
      const manualInputsPayload: Record<string, number | undefined> = {
        revenueGrowthPct: parseManualNumber(manualInputs.revenueGrowthPct),
        ebitMarginPct: parseManualNumber(manualInputs.ebitMarginPct),
        taxRatePct: parseManualNumber(manualInputs.taxRatePct),
        daPctRevenue: parseManualNumber(manualInputs.daPctRevenue),
        capexPctRevenue: parseManualNumber(manualInputs.capexPctRevenue),
        nwcPctRevenue: parseManualNumber(manualInputs.nwcPctRevenue),
        price: parseManualNumber(manualInputs.price),
        revenue: parseManualNumber(manualInputs.revenue),
        ebitda: parseManualNumber(manualInputs.ebitda),
        ebit: parseManualNumber(manualInputs.ebit),
        netIncome: parseManualNumber(manualInputs.netIncome),
        sharesOutstanding: parseManualNumber(manualInputs.sharesOutstanding),
        netDebt: parseManualNumber(manualInputs.netDebt),
        marketCap: parseManualNumber(manualInputs.marketCap),
        grossProfit: parseManualNumber(manualInputs.grossProfit),
        operatingIncome: parseManualNumber(manualInputs.operatingIncome),
        totalDebt: parseManualNumber(manualInputs.totalDebt),
        cash: parseManualNumber(manualInputs.cash),
      };

      if (normalizedOverrides.price !== undefined) manualInputsPayload.price = normalizedOverrides.price;
      if (normalizedOverrides.revenue !== undefined) manualInputsPayload.revenue = normalizedOverrides.revenue;
      if (normalizedOverrides.ebitda !== undefined) manualInputsPayload.ebitda = normalizedOverrides.ebitda;
      if (normalizedOverrides.ebit !== undefined) manualInputsPayload.ebit = normalizedOverrides.ebit;
      if (normalizedOverrides.netIncome !== undefined) manualInputsPayload.netIncome = normalizedOverrides.netIncome;
      if (normalizedOverrides.sharesOutstanding !== undefined) manualInputsPayload.sharesOutstanding = normalizedOverrides.sharesOutstanding;
      if (normalizedOverrides.netDebt !== undefined) manualInputsPayload.netDebt = normalizedOverrides.netDebt;
      if (normalizedOverrides.marketCap !== undefined) manualInputsPayload.marketCap = normalizedOverrides.marketCap;
      if (normalizedOverrides.totalDebt !== undefined) manualInputsPayload.totalDebt = normalizedOverrides.totalDebt;
      if (normalizedOverrides.cash !== undefined) manualInputsPayload.cash = normalizedOverrides.cash;

      const cleanedManualInputs = Object.fromEntries(
        Object.entries(manualInputsPayload).filter(([, value]) => value !== undefined && value !== null)
      );

      const lboEntryMultiple = lboRequiredInputs.entryMultiple ? parseFloat(lboRequiredInputs.entryMultiple) : undefined;
      const lboExitMultiple = lboRequiredInputs.exitMultiple ? parseFloat(lboRequiredInputs.exitMultiple) : undefined;
      const lboTransactionFees = lboRequiredInputs.transactionFeesPercent
        ? parseFloat(lboRequiredInputs.transactionFeesPercent) / 100
        : undefined;
      const lboExitFees = lboRequiredInputs.exitFeesPercent
        ? parseFloat(lboRequiredInputs.exitFeesPercent) / 100
        : undefined;
      const lboDebtPct = lboRequiredInputs.debtPercent ? parseFloat(lboRequiredInputs.debtPercent) / 100 : undefined;
      const lboEquityPct = lboRequiredInputs.equityPercent ? parseFloat(lboRequiredInputs.equityPercent) / 100 : undefined;
      const lboInterestRate = lboRequiredInputs.interestRate
        ? parseFloat(lboRequiredInputs.interestRate) / 100
        : undefined;
      const lboAmortization = lboRequiredInputs.amortizationPercent
        ? parseFloat(lboRequiredInputs.amortizationPercent) / 100
        : undefined;
      const lboCashSweep = lboRequiredInputs.cashSweepPercent
        ? parseFloat(lboRequiredInputs.cashSweepPercent) / 100
        : undefined;
      const lboRevenueGrowth = lboRequiredInputs.revenueGrowth
        ? parseFloat(lboRequiredInputs.revenueGrowth) / 100
        : undefined;
      const lboEbitdaMargin = lboRequiredInputs.ebitdaMargin
        ? parseFloat(lboRequiredInputs.ebitdaMargin) / 100
        : undefined;
      const lboCapexPct = lboRequiredInputs.capexPctRevenue
        ? parseFloat(lboRequiredInputs.capexPctRevenue) / 100
        : undefined;
      const lboDeltaNwcPct = lboRequiredInputs.deltaNwcPctRevenue
        ? parseFloat(lboRequiredInputs.deltaNwcPctRevenue) / 100
        : undefined;
      const lboTaxRate = lboRequiredInputs.taxRate ? parseFloat(lboRequiredInputs.taxRate) / 100 : undefined;
      const lboHoldPeriod = lboRequiredInputs.holdingPeriodYears
        ? parseFloat(lboRequiredInputs.holdingPeriodYears)
        : undefined;
      const lboMinimumCash = lboRequiredInputs.minimumCashBalance
        ? parseFloat(lboRequiredInputs.minimumCashBalance)
        : undefined;
      const computedLeverageMultiple =
        lboEntryMultiple !== undefined && lboDebtPct !== undefined
          ? lboEntryMultiple * lboDebtPct
          : undefined;
      const isQuickLbo = modelType === 'lbo' && quickLboMode;
      const lboQuickInputs =
        isQuickLbo
          ? {
              entryMultiple: lboEntryMultiple,
              debtPercent: lboRequiredInputs.debtPercent
                ? parseFloat(lboRequiredInputs.debtPercent)
                : undefined,
              interestRatePct: lboRequiredInputs.interestRate
                ? parseFloat(lboRequiredInputs.interestRate)
                : undefined,
              revenueGrowthPct: lboRequiredInputs.revenueGrowth
                ? parseFloat(lboRequiredInputs.revenueGrowth)
                : undefined,
              exitMultiple: lboExitMultiple,
              holdingPeriodYears: lboHoldPeriod,
            }
          : undefined;

      const useAdvancedDcf = modelType === 'dcf';
      const advancedDcfBeta = useAdvancedDcf ? parseAdvancedNumber(advancedDcfForm.beta) : undefined;
      const advancedDcfErp = useAdvancedDcf ? parsePercentInput(advancedDcfForm.equityRiskPremium) : undefined;
      const advancedDcfCostOfDebt = useAdvancedDcf ? parsePercentInput(advancedDcfForm.costOfDebt) : undefined;
      const reverseDcfWaccPct = modelType === 'reverse-dcf' ? parseAdvancedNumber(reverseDcfInputs.waccPct) : undefined;
      const reverseDcfTerminalGrowthPct =
        modelType === 'reverse-dcf' ? parseAdvancedNumber(reverseDcfInputs.terminalGrowthPct) : undefined;
      const reverseDcfProjectionYears =
        modelType === 'reverse-dcf' ? parseAdvancedNumber(reverseDcfInputs.projectionYears) : undefined;
      const reverseDcfTargetPrice =
        modelType === 'reverse-dcf' ? parseAdvancedNumber(reverseDcfInputs.targetPrice) : undefined;
      const reverseDcfPayload =
        modelType === 'reverse-dcf'
          ? Object.fromEntries(
              Object.entries({
                waccPct: reverseDcfWaccPct,
                terminalGrowthPct: reverseDcfTerminalGrowthPct,
                projectionYears: reverseDcfProjectionYears,
                targetPrice: reverseDcfTargetPrice,
              }).filter(([, value]) => value !== undefined)
            )
          : undefined;
      const debtCapacityLitePayload =
        modelType === 'debt-capacity-lite'
          ? Object.fromEntries(
              Object.entries({
                maxLeverage: parseAdvancedNumber(debtCapacityLiteInputs.maxLeverage),
                minInterestCoverage: parseAdvancedNumber(debtCapacityLiteInputs.minInterestCoverage),
                interestRatePct: parseAdvancedNumber(debtCapacityLiteInputs.interestRatePct),
              }).filter(([, value]) => value !== undefined)
            )
          : undefined;
      const dcfSensitivityPayload =
        modelType === 'dcf'
          ? Object.fromEntries(
              Object.entries({
                waccRangePct: parseAdvancedNumber(dcfSensitivityInputs.waccRangePct),
                waccStepPct: parseAdvancedNumber(dcfSensitivityInputs.waccStepPct),
                terminalGrowthRangePct: parseAdvancedNumber(dcfSensitivityInputs.terminalGrowthRangePct),
                terminalGrowthStepPct: parseAdvancedNumber(dcfSensitivityInputs.terminalGrowthStepPct),
              }).filter(([, value]) => value !== undefined)
            )
          : undefined;
      const lboSensitivityPayload =
        modelType === 'lbo'
          ? Object.fromEntries(
              Object.entries({
                entryRange: parseAdvancedNumber(lboSensitivityInputs.entryRange),
                entryStep: parseAdvancedNumber(lboSensitivityInputs.entryStep),
                exitRange: parseAdvancedNumber(lboSensitivityInputs.exitRange),
                exitStep: parseAdvancedNumber(lboSensitivityInputs.exitStep),
              }).filter(([, value]) => value !== undefined)
            )
          : undefined;
      const privateRevenueGrowthPct = parseAdvancedNumber(manualInputs.revenueGrowthPct);
      const privateMarginPct = parseAdvancedNumber(manualInputs.ebitMarginPct);
      const privateTaxRatePct = parseAdvancedNumber(manualInputs.taxRatePct);
      const privateDaPct = parseAdvancedNumber(manualInputs.daPctRevenue);
      const privateCapexPct = parseAdvancedNumber(manualInputs.capexPctRevenue);
      const privateNwcPct = parseAdvancedNumber(manualInputs.nwcPctRevenue);
      const privateSliderOverrides: Record<string, number> = {};
      if (privateRevenueGrowthPct !== undefined) privateSliderOverrides.revenueGrowth = privateRevenueGrowthPct / 100;
      if (privateMarginPct !== undefined) privateSliderOverrides.ebitdaMargin = privateMarginPct / 100;
      if (privateTaxRatePct !== undefined) privateSliderOverrides.taxRate = privateTaxRatePct / 100;
      if (privateDaPct !== undefined) privateSliderOverrides.daPctRevenue = privateDaPct / 100;
      if (privateCapexPct !== undefined) privateSliderOverrides.capexPctRevenue = privateCapexPct / 100;
      if (privateNwcPct !== undefined) privateSliderOverrides.deltaNwcPctRevenue = privateNwcPct / 100;

      let requestBody: Record<string, any> = {
        ticker: isPrivateMode ? undefined : trimmedTicker,
        modelType,
        companyMode,
        companyName: manualInputs.companyName.trim() || companyName || undefined,
        currency: manualInputs.currency.trim() || 'USD',
        dataSource: isPrivateMode ? 'manual' : 'ticker',
        includeScenarios: includeScenarioFlag || undefined,
        wacc:
          modelType === 'reverse-dcf'
            ? reverseDcfWaccPct !== undefined
              ? reverseDcfWaccPct / 100
              : undefined
            : scenarioFeatureEnabled
              ? baseScenario.wacc / 100
              : undefined,
        terminalGrowth:
          modelType === 'reverse-dcf'
            ? reverseDcfTerminalGrowthPct !== undefined
              ? reverseDcfTerminalGrowthPct / 100
              : undefined
            : scenarioFeatureEnabled
              ? baseScenario.terminalGrowth / 100
              : undefined,
        projectionYears: modelType === 'reverse-dcf' ? reverseDcfProjectionYears : undefined,
        targetPrice: modelType === 'reverse-dcf' ? reverseDcfTargetPrice : undefined,
        reverseDcfInputs: reverseDcfPayload,
        debtCapacityLiteInputs: debtCapacityLitePayload,
        sensitivity:
          modelType === 'dcf'
            ? { dcf: dcfSensitivityPayload }
            : modelType === 'lbo'
              ? { lbo: lboSensitivityPayload }
              : undefined,
        sliderOverrides: scenarioFeatureEnabled
          ? modelType === 'lbo'
            ? {
                revenueGrowth: lboRevenueGrowth,
                ebitdaMargin: lboEbitdaMargin,
                taxRate: lboTaxRate,
              }
            : {
                revenueGrowth: baseScenario.revenueGrowth / 100,
                ebitdaMargin: baseScenario.ebitdaMargin / 100,
                wacc: baseScenario.wacc / 100,
                terminalGrowth: baseScenario.terminalGrowth / 100,
                deltaNwcPctRevenue: baseScenario.deltaNwcPct / 100,
                capexPctRevenue: baseScenario.capexPctRevenue / 100,
                taxRate: baseScenario.taxRate / 100,
                daPctRevenue: baseScenario.daPctRevenue / 100,
              }
          : undefined,
        scenarioInputs: scenarioInputsPayload,
        scenarioNotes: scenarioNoteText,
        customComps:
          modelType === 'comps' && customComps.trim()
            ? customComps.split(',').map((t) => t.trim()).filter((t) => t)
            : undefined,
        useOnlyCustom: modelType === 'comps' ? useOnlyCustom : undefined,
        quickLbo: isQuickLbo ? true : undefined,
        lboQuickInputs:
          isQuickLbo
            ? Object.fromEntries(Object.entries(lboQuickInputs || {}).filter(([, value]) => value !== undefined))
            : undefined,
        lboAdvanced: modelType === 'lbo' && !isQuickLbo ? advancedLboPayload : undefined,
        lboOverrides: modelType === 'lbo' && !isQuickLbo
          ? {
              entryMultiple: lboEntryMultiple,
              exitMultiple: lboExitMultiple,
              transactionFeesPercent: lboTransactionFees,
              exitFeesPercent: lboExitFees,
              debtPercent: lboDebtPct,
              equityPercent: lboEquityPct,
              interestRate: lboInterestRate,
              amortizationPercent: lboAmortization,
              cashSweepPercent: lboCashSweep,
              leverageMultiple: computedLeverageMultiple,
              capexPercent: lboCapexPct,
              nwcPercent: lboDeltaNwcPct,
              taxRate: lboTaxRate,
              minimumCash: lboMinimumCash,
              holdingPeriodYears: lboHoldPeriod,
              exitYear: lboHoldPeriod,
              offerPremium: 0,
              termLoanBRate: lboInterestRate,
              revolverRate: lboInterestRate,
            }
          : undefined,
        lboDealAssumptions: modelType === 'lbo' && !isQuickLbo
          ? {
              entry: {
                entryMultiple: lboEntryMultiple,
                transactionFeesPercent: lboTransactionFees,
              },
              financing: {
                debtPercent: lboDebtPct,
                equityPercent: lboEquityPct,
                interestRate: lboInterestRate,
                amortizationPercent: lboAmortization,
                cashSweepPercent: lboCashSweep,
              },
              operations: {
                revenueGrowth: lboRevenueGrowth,
                ebitdaMargin: lboEbitdaMargin,
                capexPctRevenue: lboCapexPct,
                deltaNwcPctRevenue: lboDeltaNwcPct,
                taxRate: lboTaxRate,
              },
              exit: {
                exitMultiple: lboExitMultiple,
                holdingPeriodYears: lboHoldPeriod,
                exitFeesPercent: lboExitFees,
              },
            }
          : undefined,
        mergerInputs: modelType === 'merger' ? mergerInputs : undefined,
        operatingInputs: modelType === 'operating' ? operatingInputs : undefined,
        manualInputs: Object.keys(cleanedManualInputs).length > 0 ? cleanedManualInputs : undefined,
      };
      if (isPrivateMode) {
        requestBody.manualMode = true;
        requestBody.sliderOverrides = {
          ...(requestBody.sliderOverrides || {}),
          ...privateSliderOverrides,
        };
      }
      if (normalizedOverrides.price !== undefined) requestBody.price = normalizedOverrides.price;
      if (normalizedOverrides.marketCap !== undefined) {
        requestBody.marketCap = normalizedOverrides.marketCap;
        requestBody.market_cap = normalizedOverrides.marketCap;
      }
      if (normalizedOverrides.netIncome !== undefined) {
        requestBody.netIncome = normalizedOverrides.netIncome;
        requestBody.net_income = normalizedOverrides.netIncome;
      }
      if (normalizedOverrides.revenue !== undefined) requestBody.revenue = normalizedOverrides.revenue;
      if (normalizedOverrides.ebitda !== undefined) requestBody.ebitda = normalizedOverrides.ebitda;
      if (normalizedOverrides.ebit !== undefined) requestBody.ebit = normalizedOverrides.ebit;
      if (normalizedOverrides.cash !== undefined) requestBody.cash = normalizedOverrides.cash;
      if (normalizedOverrides.totalDebt !== undefined) {
        requestBody.totalDebt = normalizedOverrides.totalDebt;
        requestBody.total_debt = normalizedOverrides.totalDebt;
      }
      if (normalizedOverrides.netDebt !== undefined) {
        requestBody.netDebt = normalizedOverrides.netDebt;
        requestBody.net_debt = normalizedOverrides.netDebt;
      }
      if (normalizedOverrides.sharesOutstanding !== undefined) {
        requestBody.sharesOutstanding = normalizedOverrides.sharesOutstanding;
        requestBody.shares_out_basic = normalizedOverrides.sharesOutstanding;
      }
      if (normalizedOverrides.terminal_growth !== undefined) requestBody.terminal_growth = normalizedOverrides.terminal_growth;

      const waccInputs: Record<string, number> = {};
      if (normalizedOverrides.rf_rate !== undefined) waccInputs.rf_rate = normalizedOverrides.rf_rate;
      if (normalizedOverrides.equity_risk_premium !== undefined) waccInputs.erp = normalizedOverrides.equity_risk_premium;
      if (normalizedOverrides.beta !== undefined) waccInputs.beta = normalizedOverrides.beta;
      if (normalizedOverrides.cost_of_debt !== undefined) waccInputs.cost_of_debt = normalizedOverrides.cost_of_debt;
      if (normalizedOverrides.tax_rate_assumption !== undefined) waccInputs.tax_rate = normalizedOverrides.tax_rate_assumption;
      if (advancedDcfErp !== undefined) waccInputs.erp = advancedDcfErp;
      if (advancedDcfBeta !== undefined) waccInputs.beta = advancedDcfBeta;
      if (advancedDcfCostOfDebt !== undefined) waccInputs.cost_of_debt = advancedDcfCostOfDebt;
      if (Object.keys(waccInputs).length > 0) {
        requestBody.wacc_inputs = {
          ...(requestBody.wacc_inputs || {}),
          ...waccInputs,
        };
      }

      if (modelType === 'comps') {
        const compsPayload: Record<string, any> = {
          ticker: isPrivateMode ? undefined : trimmedTicker,
          modelType: 'comps',
          dataSource: requestBody.dataSource,
          companyMode,
          companyName: requestBody.companyName,
          currency: requestBody.currency,
        };
        if (requestBody.customComps) compsPayload.customComps = requestBody.customComps;
        if (requestBody.useOnlyCustom !== undefined) compsPayload.useOnlyCustom = requestBody.useOnlyCustom;
        if (requestBody.manualInputs) compsPayload.manualInputs = requestBody.manualInputs;
        if (requestBody.price !== undefined) compsPayload.price = requestBody.price;
        if (requestBody.marketCap !== undefined) compsPayload.marketCap = requestBody.marketCap;
        if (requestBody.netIncome !== undefined) compsPayload.netIncome = requestBody.netIncome;
        if (requestBody.revenue !== undefined) compsPayload.revenue = requestBody.revenue;
        if (requestBody.ebitda !== undefined) compsPayload.ebitda = requestBody.ebitda;
        if (requestBody.ebit !== undefined) compsPayload.ebit = requestBody.ebit;
        if (requestBody.cash !== undefined) compsPayload.cash = requestBody.cash;
        if (requestBody.totalDebt !== undefined) compsPayload.totalDebt = requestBody.totalDebt;
        if (requestBody.netDebt !== undefined) compsPayload.netDebt = requestBody.netDebt;
        if (requestBody.sharesOutstanding !== undefined) compsPayload.sharesOutstanding = requestBody.sharesOutstanding;
        requestBody = compsPayload;
      }
      setLastRequestBody(requestBody);
      
      // For merger models, use the merger-specific API
      if (modelType === 'merger') {
        const mergerResponse = await fetch('/api/models/merger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mergerInputs),
        });
        
        if (!mergerResponse.ok) {
          const errorData = await mergerResponse.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to generate merger model');
        }
        
        const mergerData = await mergerResponse.json();
        
        // Store applied defaults and warnings
        setAppliedDefaults(mergerData.appliedDefaults || []);
        setWarnings(mergerData.warnings || []);
        setBlocks(mergerData.blocks || []);
        
        // If blocks exist, show error
        if (mergerData.blocks && mergerData.blocks.length > 0) {
          setError(`Model generation blocked: ${mergerData.blocks.join('; ')}`);
          return;
        }
        
        // Download Excel
        const downloadResponse = await fetch('/api/models/merger/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mergerInputs),
        });
        
        if (downloadResponse.ok) {
          const blob = await downloadResponse.blob();
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `Merger_Model_${mergerInputs.acquirerTicker}_${mergerInputs.targetTicker}.xlsx`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(url);
        }
        
        // Set generated model
        const resolvedModel: EnrichedModelResponse = {
          modelId: mergerData.modelId || `merger-${Date.now()}`,
          ticker: mergerData.ticker || `${mergerInputs.acquirerTicker}/${mergerInputs.targetTicker}`,
          modelType: 'merger',
          createdAt: new Date().toISOString(),
          downloadUrl: mergerData.downloadUrl || '',
          preview: mergerData.preview || EMPTY_PREVIEW,
          summaryText: mergerData.report?.sections?.[0]?.body || `Merger model generated for ${mergerInputs.acquirerTicker}/${mergerInputs.targetTicker}`,
        };
        setGeneratedModel(resolvedModel);
        setShowResults(true);
        const clientDuration = Math.max(
          0,
          Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - runStart)
        );
        setLastDurationMs(clientDuration);
        return;
      }
      
      // For operating models, use the operating-specific API
      if (modelType === 'operating') {
        const operatingResponse = await fetch('/api/models/operating', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(operatingInputs),
        });
        
        if (!operatingResponse.ok) {
          const errorData = await operatingResponse.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to generate operating model');
        }
        
        const operatingData = await operatingResponse.json();
        
        // Store applied defaults and warnings
        setAppliedDefaults(operatingData.appliedDefaults || []);
        setWarnings(operatingData.warnings || []);
        setBlocks(operatingData.blocks || []);
        
        // If blocks exist, show error
        if (operatingData.blocks && operatingData.blocks.length > 0) {
          setError(`Model generation blocked: ${operatingData.blocks.join('; ')}`);
          return;
        }
        
        // Download Excel
        const downloadResponse = await fetch('/api/models/operating/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(operatingInputs),
        });
        
        if (downloadResponse.ok) {
          const blob = await downloadResponse.blob();
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `Operating_Model_${operatingInputs.ticker || 'model'}.xlsx`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(url);
        }
        
        // Set generated model
        const resolvedModel: EnrichedModelResponse = {
          modelId: operatingData.modelId || `operating-${Date.now()}`,
          ticker: operatingData.ticker || `Operating Model - ${operatingInputs.ticker}`,
          modelType: 'operating',
          createdAt: new Date().toISOString(),
          downloadUrl: operatingData.downloadUrl || '',
          preview: operatingData.preview || EMPTY_PREVIEW,
          summaryText: operatingData.report?.sections?.[0]?.body || `Operating model generated for ${operatingInputs.ticker}`,
        };
        setGeneratedModel(resolvedModel);
        setShowResults(true);
        const clientDuration = Math.max(
          0,
          Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - runStart)
        );
        setLastDurationMs(clientDuration);
        return;
      }
      
      // For standard models (DCF, LBO, 3-Statement, Comps), use idempotent generate route
      if (process.env.NODE_ENV === 'development') {
        console.log('[generate retry payload keys]', Object.keys(requestBody), {
          missingOverrides: missingInputOverridesRef.current,
        });
      }
      const genResp = await fetch(`/api/model-types/${modelType}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      const generateData = await genResp.json();

      if (!genResp.ok) {
        const errorData = generateData || {};
        const errorState = errorData.status || errorData.state;
        if (errorState === 'assumptions_required') {
          setMissingInputs(errorData.missingInputs || errorData.missing || ['inputs']);
          setMissingInputSpecsOverride(errorData.requiredInputs || []);
          setMissingInputsModalOpen(true);
          return;
        }
        if (errorData.blocks && errorData.blocks.length > 0) {
          setBlocks(errorData.blocks);
          setWarnings(errorData.warnings || []);
          setError(`Model generation blocked: ${errorData.blocks.join('; ')}`);
          return;
        }
        setError(errorData.error || errorData.message || 'Failed to generate model');
        return;
      }

      if (generateData.status === 'assumptions_required') {
        setMissingInputs(generateData.missingInputs || generateData.missing || ['inputs']);
        setMissingInputSpecsOverride(generateData.requiredInputs || []);
        setMissingInputsModalOpen(true);
        return;
      }

      if (generateData.status !== 'generated') {
        // quick poll once
        await new Promise((r) => setTimeout(r, 800));
        const poll = await fetch(`/api/model-types/${modelType}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(requestBody),
        });
        const pollData = await poll.json();
        if (pollData.status !== 'generated') {
          setError(`Generation not ready: ${pollData.status}`);
          return;
        }
        Object.assign(generateData, pollData);
      }
      
      // Debug logging in dev
      if (process.env.NODE_ENV === 'development') {
        console.log('[DCF UI RAW RESULT]', generateData);
      }
      
      // Store applied defaults and warnings
      setAppliedDefaults(generateData.appliedDefaults || []);
      setWarnings(generateData.warnings || []);
      setBlocks(generateData.blocks || []);
      
      setDownloadState('idle');

      const resolvedModel: EnrichedModelResponse = {
        modelId: generateData.runId || `local-${Date.now()}`,
        ticker: isPrivateMode
          ? (manualInputs.companyName.trim() || 'PRIVATE')
          : trimmedTicker,
        modelType,
        createdAt: new Date().toISOString(),
        downloadUrl: generateData.downloadUrl || '',
        preview: generateData.preview || EMPTY_PREVIEW,
        modelDocument: generateData.modelDocument || null,
        summaryText:
          normalizeNarrativeText(latestAnalysisData?.summary) ??
          normalizeNarrativeText(modelData?.summary) ??
          `Excel model generated for ${isPrivateMode ? (manualInputs.companyName.trim() || 'private company') : trimmedTicker}`,
        // Store model-specific summaries for preview parsing
        dcfSummary: generateData.dcfSummary,
        lboSummary: generateData.lboSummary,
        debtCapacityLite: generateData.debtCapacityLite,
        assumptions: generateData.assumptions,
        diagnostics: generateData.diagnostics,
        // Store state information
        state: generateData.state || generateData.status || 'generated',
        missingInputs: generateData.missingInputs || generateData.missing || [],
        requiredInputs: generateData.requiredInputs || [],
        estimatedInputs: generateData.estimatedInputs || generateData.estimated || [],
        coreModelOutputs: generateData.coreModelOutputs,
        coreInputs: generateData.coreInputs,
        liveDataFallback: generateData.liveDataFallback === true,
        scenarioComparison: generateData.scenarioComparison,
        scenarioSummaries: generateData.scenarioSummaries,
      } as any;
      setMissingInputsModalOpen(false);
      setGeneratedModel(resolvedModel);
      setShowResults(true);
      const clientDuration = Math.max(
        0,
        Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - runStart)
      );
      setLastDurationMs(clientDuration);
      // Fetch model stats for standard models
      if (!isPrivateMode && trimmedTicker) {
        fetchModelStats(trimmedTicker, metricsModelTypeParam);
      }

    } catch (err) {
      const failureDuration = Math.max(
        0,
        Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - runStart)
      );
      setLastDurationMs(failureDuration);
      const message = err instanceof Error ? err.message : 'Unexpected error generating the model.';
      setError(message);
      console.error('[handleSubmit] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshSensitivity = useCallback(async () => {
    if (!generatedModel || !lastRequestBody) return;
    const activeModelType = generatedModel.modelType;
    if (activeModelType !== 'dcf' && activeModelType !== 'lbo') return;

    setSensitivityError(null);
    setSensitivityLoading(true);
    try {
      const dcfSensitivityPayload =
        activeModelType === 'dcf'
          ? {
              waccRangePct: parseAdvancedNumber(dcfSensitivityInputs.waccRangePct),
              waccStepPct: parseAdvancedNumber(dcfSensitivityInputs.waccStepPct),
              terminalGrowthRangePct: parseAdvancedNumber(dcfSensitivityInputs.terminalGrowthRangePct),
              terminalGrowthStepPct: parseAdvancedNumber(dcfSensitivityInputs.terminalGrowthStepPct),
            }
          : undefined;
      const lboSensitivityPayload =
        activeModelType === 'lbo'
          ? {
              entryRange: parseAdvancedNumber(lboSensitivityInputs.entryRange),
              entryStep: parseAdvancedNumber(lboSensitivityInputs.entryStep),
              exitRange: parseAdvancedNumber(lboSensitivityInputs.exitRange),
              exitStep: parseAdvancedNumber(lboSensitivityInputs.exitStep),
            }
          : undefined;

      const payload = {
        ...lastRequestBody,
        sensitivity:
          activeModelType === 'dcf'
            ? { dcf: dcfSensitivityPayload }
            : { lbo: lboSensitivityPayload },
      };

      const genResp = await fetch(`/api/model-types/${activeModelType}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
      let generateData = await genResp.json();

      if (!genResp.ok) {
        throw new Error(generateData?.message || generateData?.error || 'Failed to refresh sensitivity.');
      }

      if (generateData?.status !== 'generated') {
        await new Promise((resolve) => setTimeout(resolve, 800));
        const poll = await fetch(`/api/model-types/${activeModelType}/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        });
        const pollData = await poll.json();
        if (pollData?.status !== 'generated') {
          throw new Error(`Sensitivity refresh not ready: ${pollData?.status || 'unknown'}`);
        }
        generateData = pollData;
      }

      setLastRequestBody(payload);
      setGeneratedModel((prev) => {
        if (!prev) return prev;
        const next: any = { ...prev };
        if (activeModelType === 'dcf') {
          next.dcfSummary = {
            ...(prev as any).dcfSummary,
            sensitivity: generateData?.dcfSummary?.sensitivity,
          };
        }
        if (activeModelType === 'lbo') {
          next.lboSummary = {
            ...(prev as any).lboSummary,
            sensitivity: generateData?.lboSummary?.sensitivity,
          };
        }
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh sensitivity.';
      setSensitivityError(message);
    } finally {
      setSensitivityLoading(false);
    }
  }, [
    generatedModel,
    lastRequestBody,
    dcfSensitivityInputs,
    lboSensitivityInputs,
  ]);

  const handleSolveBreakEven = useCallback(async () => {
    if (!generatedModel) return;
    if (generatedModel.modelType !== 'dcf' && generatedModel.modelType !== 'lbo') return;
    setBreakEvenLoading(true);
    setBreakEvenError(null);
    setBreakEvenResult(null);

    try {
      if (generatedModel.modelType === 'dcf') {
        const assumptions = (generatedModel as any)?.assumptions || {};
        const canonical = (generatedModel as any)?.canonicalFinancials?.values || {};
        const dcfSummary = (generatedModel as any)?.dcfSummary || {};
        const solveFor = breakEvenSolveFor === 'ebitdaMargin' ? 'ebitdaMargin' : 'revenueGrowth';

        const payload = {
          modelType: 'dcf',
          ticker: generatedModel.ticker,
          solveFor,
          targetPrice: parseAdvancedNumber(breakEvenTargetPrice),
          dcfContext: {
            marketPrice:
              canonical?.price?.value ??
              dcfSummary?.marketContext?.sharePrice ??
              undefined,
            revenue:
              canonical?.revenue?.value ??
              firstNumeric(assumptions?.revenue) ??
              undefined,
            revenueGrowth:
              firstNumeric(assumptions?.revenueGrowth) ??
              firstNumeric(dcfSummary?.assumptions?.revenueGrowth) ??
              undefined,
            ebitdaMargin:
              firstNumeric(assumptions?.ebitdaMargin) ??
              firstNumeric(dcfSummary?.assumptions?.ebitdaMargin) ??
              undefined,
            taxRate:
              assumptions?.taxRate ??
              dcfSummary?.assumptions?.taxRate ??
              undefined,
            capexPctRevenue:
              firstNumeric(assumptions?.capexPctRevenue) ??
              dcfSummary?.assumptions?.capexPercentOfRevenue ??
              undefined,
            nwcPctRevenue:
              firstNumeric(assumptions?.nwcPctRevenue) ??
              dcfSummary?.assumptions?.changeInWCPercentOfRevenue ??
              undefined,
            netDebt:
              dcfSummary?.results?.netDebt ??
              canonical?.netDebt?.value ??
              undefined,
            sharesOutstanding:
              assumptions?.sharesOutstanding ??
              canonical?.sharesOutstanding?.value ??
              undefined,
            wacc:
              dcfSummary?.wacc ??
              dcfSummary?.valuationResults?.wacc ??
              assumptions?.wacc ??
              undefined,
            terminalGrowth:
              dcfSummary?.terminalGrowth ??
              dcfSummary?.valuationResults?.terminalGrowth ??
              assumptions?.terminalGrowth ??
              undefined,
            projectionYears:
              dcfSummary?.assumptions?.projectionHorizon ??
              assumptions?.years?.length ??
              5,
          },
        };

        const response = await fetch('/api/models/breakeven', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
          if (data?.result) {
            setBreakEvenResult(data.result as BreakEvenResult);
          }
          throw new Error(data?.message || data?.error || 'Break-even solver failed.');
        }
        if (!data?.result) {
          throw new Error('Break-even solver did not return a result.');
        }
        setBreakEvenResult(data.result as BreakEvenResult);
        return;
      }

      const targetIrrPct = parseAdvancedNumber(breakEvenTargetIrr);
      if (targetIrrPct === undefined) {
        throw new Error('Enter a target IRR (%) before solving.');
      }
      const solveFor = breakEvenSolveFor === 'entryMultiple' ? 'entryMultiple' : 'exitMultiple';
      const lboInputs = (generatedModel as any)?.lboSummary?.inputs;
      if (!lboInputs) {
        throw new Error('LBO inputs unavailable for break-even solve.');
      }
      const response = await fetch('/api/models/breakeven', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          modelType: 'lbo',
          ticker: generatedModel.ticker,
          solveFor,
          targetIRR: targetIrrPct,
          lboInputs,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data?.result) {
          setBreakEvenResult(data.result as BreakEvenResult);
        }
        throw new Error(data?.message || data?.error || 'Break-even solver failed.');
      }
      if (!data?.result) {
        throw new Error('Break-even solver did not return a result.');
      }
      setBreakEvenResult(data.result as BreakEvenResult);
    } catch (err) {
      setBreakEvenError(err instanceof Error ? err.message : 'Break-even solver failed.');
    } finally {
      setBreakEvenLoading(false);
    }
  }, [
    generatedModel,
    breakEvenSolveFor,
    breakEvenTargetPrice,
    breakEvenTargetIrr,
  ]);

  const resetForm = () => {
    setTicker('');
    setCompanyMode('public');
    setModelData(null);
    setGeneratedModel(null);
    setShowResults(false);
    setError(null);
    setLastDurationMs(undefined);
    setTimerStats(undefined);
    resetAssumptions();
    setActiveScenario('base');
    setReportText(null);
    setReportPayload(null);
    setInsightCards([]);
    if (reportPdfUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(reportPdfUrl);
    }
    setReportPdfUrl(null);
    setReportError(null);
    setReportLoading(false);
    setAdvancedLboForm(createDefaultAdvancedLboState());
    setShowAdvancedLbo(false);
    setAdvancedDcfForm(createDefaultAdvancedDcfState());
    setShowAdvancedDcf(false);
    setReverseDcfInputs({
      waccPct: '10.0',
      terminalGrowthPct: '2.5',
      projectionYears: '5',
      targetPrice: '',
    });
    setDebtCapacityLiteInputs(createDefaultDebtCapacityLiteState());
    setDcfSensitivityInputs(createDefaultDcfSensitivityState());
    setLboSensitivityInputs(createDefaultLboSensitivityState());
    setSensitivityError(null);
    setSensitivityLoading(false);
    setBreakEvenSolveFor('revenueGrowth');
    setBreakEvenTargetPrice('');
    setBreakEvenTargetIrr('');
    setBreakEvenLoading(false);
    setBreakEvenError(null);
    setBreakEvenResult(null);
    setMergerInputs({});
    setMergerInputsValid(false);
    setOperatingInputs({});
    setOperatingInputsValid(false);
    setAppliedDefaults([]);
    setWarnings([]);
    setBlocks([]);
    setEstimatedInputs([]);
    setManualInputs({
      companyName: '',
      currency: 'USD',
      revenueHistory: '',
      revenueGrowthPct: '8.0',
      ebitMarginPct: '20.0',
      taxRatePct: '25.0',
      daPctRevenue: '4.0',
      capexPctRevenue: '4.0',
      nwcPctRevenue: '2.0',
      price: '',
      revenue: '',
      ebitda: '',
      ebit: '',
      netIncome: '',
      sharesOutstanding: '',
      netDebt: '',
      marketCap: '',
      grossProfit: '',
      operatingIncome: '',
      totalDebt: '',
      cash: '',
    });
    setMissingInputOverrides({});
  };

  const updateBaseScenario = useCallback(
    (field: keyof ScenarioInputs, value: number) => {
      const clamped = clampValue(value, field);
      updateScenarioValue(activeScenarioTab, field, clamped);
    },
    [activeScenarioTab, updateScenarioValue]
  );

  const handleScenarioToggle = (checked: boolean) => {
    setIncludeScenarios(checked);
  };

  const handleScenarioReset = () => {
    resetAssumptions();
    setActiveScenario('base');
  };

  const computeUpside = (target?: number, reference?: number) => {
    if (target === undefined || reference === undefined || reference === 0) return undefined;
    return ((target - reference) / reference) * 100;
  };

  const handleGenerateReport = async () => {
    if (!generatedModel) return;
    setReportLoading(true);
    setReportError(null);
    setReportText(null);
    setReportPayload(null);
    setInsightCards([]);
    if (reportPdfUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(reportPdfUrl);
    }
    setReportPdfUrl(null);

    const normalizedModelKind =
      modelType === 'three-statement'
        ? 'three_statement'
        : modelType === 'reverse-dcf'
          ? 'dcf'
          : modelType;

    const compsData = (generatedModel as any)?.assumptions?.compsModel;
    const compsStats = compsData?.stats;
    const compsValuation = compsData?.impliedValuation;
    const currentPrice = compsData?.metadata?.currentPrice;

    const basePrice =
      generatedModel.dcfSummary?.valuationResults?.pricePerShare ?? compsValuation?.blendedValuePerShare;
    const bullPrice =
      generatedModel.scenarioSummaries?.bull?.valuationResults?.pricePerShare ?? compsValuation?.bullValuePerShare;
    const bearPrice =
      generatedModel.scenarioSummaries?.bear?.valuationResults?.pricePerShare ?? compsValuation?.bearValuePerShare;

    const lboEntryMultiple = generatedModel.lboSummary?.inputs?.exitMultiple;
    const lboExitMultiple = generatedModel.lboSummary?.inputs?.exitMultiple;
    const sponsorEquity = generatedModel.lboSummary?.sourcesAndUses?.sources?.sponsorEquity;

    const baseIRR = generatedModel.lboSummary?.returns?.irr ? generatedModel.lboSummary.returns.irr * 100 : undefined;
    const baseMOIC = generatedModel.lboSummary?.returns?.moic;

    const scenarioBullets = scenarioFeatureEnabled
      ? [
          `Base sliders: ${modelAssumptions.scenarios.base.revenueGrowth.toFixed(1)}% growth / ${modelAssumptions.scenarios.base.ebitdaMargin.toFixed(
            1
          )}% EBITDA margin.`,
          `Discount rate ${modelAssumptions.scenarios.base.wacc.toFixed(1)}% with ${modelAssumptions.scenarios.base.terminalGrowth.toFixed(
            1
          )}% terminal growth.`,
        ]
      : undefined;

    const diagnosticsBullets: string[] = [];
      // TODO: Fix diagnostics mapping
      // generatedModel.diagnostics?.slice(0, 3).map((diag) => `${diag.title ?? 'Issue'}: ${diag.message}`) ?? [];

    const contextOverrides = {
      companyName: manualInputs.companyName.trim() || companyName || generatedModel.ticker || 'Unknown Company',
      asOfDate: new Date().toISOString().slice(0, 10),
      keyOutputs: {
        baseValuePerShare: basePrice,
        bullValuePerShare: bullPrice,
        bearValuePerShare: bearPrice,
        impliedUpsidePct: computeUpside(basePrice, currentPrice),
        entryMultiple: lboEntryMultiple,
        exitMultiple: lboExitMultiple,
        irr: baseIRR,
        ltmMetrics: compsData?.ltm
          ? {
              revenue: compsData.ltm.revenue,
              ebitda: compsData.ltm.ebitda,
              ebitdaMarginPct: compsData.ltm.ebitdaMarginPct,
              fcfMarginPct: compsData.ltm.fcfMarginPct,
            }
          : undefined,
        debtCapacity: generatedModel.debtCapacityLite
          ? {
              leverageCap: generatedModel.debtCapacityLite.leverageCap,
              coverageCap: generatedModel.debtCapacityLite.coverageCap,
              maxDebt: generatedModel.debtCapacityLite.maxDebt,
              bindingConstraint: generatedModel.debtCapacityLite.bindingConstraint,
              headroomVsNetDebt: generatedModel.debtCapacityLite.headroomVsNetDebt,
            }
          : undefined,
      },
      highLevelNotes: [
        ...(scenarioBullets ? scenarioBullets : []),
        ...(diagnosticsBullets.length ? diagnosticsBullets : []),
      ]
        .filter(Boolean)
        .join(' '),
    };

    const modelDataPayload = {
      canonicalFinancials: (generatedModel as any).canonicalFinancials,
      dcfSummary: generatedModel.dcfSummary,
      scenarioSummaries: generatedModel.scenarioSummaries,
      lboSummary: generatedModel.lboSummary,
      threeStatementSummary: (generatedModel as any).threeStatementSummary,
      debtCapacityLite: (generatedModel as any).debtCapacityLite,
      assumptions: {
        compsModel: compsData,
        revenueGrowth: (generatedModel as any)?.assumptions?.revenueGrowth,
        ebitdaMargin: (generatedModel as any)?.assumptions?.ebitdaMargin,
        freeCashFlowGrowth: (generatedModel as any)?.assumptions?.freeCashFlowGrowth,
      },
    };

    try {
      const response = await fetch('/api/generateReport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: isPrivateMode ? 'PRIVATE' : (generatedModel.ticker ?? ticker?.toUpperCase() ?? ''),
          companyName: contextOverrides.companyName,
          modelType: normalizedModelKind,
          asOfDate: contextOverrides.asOfDate,
          modelData: modelDataPayload,
          contextOverrides,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate report');
      }

      const data = await response.json();
      setReportText(data.reportText ?? data.summaryText ?? '');
      setReportPayload(data.reportPayload || null);
      setInsightCards(Array.isArray(data.insightCards) ? data.insightCards : []);
      if (typeof generatedModel.modelId === 'string' && generatedModel.modelId.startsWith('run_')) {
        setReportPdfUrl(`/api/model-runs/${generatedModel.modelId}/report/pdf`);
      } else if (data.pdfBase64) {
        const bytes = Uint8Array.from(atob(data.pdfBase64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setReportPdfUrl(url);
      } else if (data.pdfUrl) {
        setReportPdfUrl(data.pdfUrl);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate report.';
      setReportError(message);
      showToast({
        title: 'Report generation failed',
        description: message,
        variant: 'destructive',
      });
      console.error('[handleGenerateReport] failed', err);
    } finally {
      setReportLoading(false);
    }
  };

  const resolveReportPdfUrl = useCallback(() => {
    if (generatedModel?.modelId?.startsWith('run_')) {
      return `/api/model-runs/${generatedModel.modelId}/report/pdf`;
    }
    if (reportPdfUrl) return reportPdfUrl;
    return null;
  }, [generatedModel?.modelId, reportPdfUrl]);

  const handleDownloadReportPdf = useCallback(async () => {
    const coreOutputs = (generatedModel as any)?.coreModelOutputs;
    const templateId = generatedModel?.modelType;
    const companyLabel =
      manualInputs.companyName.trim() || ticker || generatedModel?.ticker || 'Company';
    const safeName = companyLabel.replace(/[^a-zA-Z0-9_-]/g, '_');

    if (coreOutputs && templateId) {
      try {
        const corePdfResponse = await fetch('/api/export/pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId,
            companyName: companyLabel,
            modelOutputs: coreOutputs,
            scenarioComparison: (generatedModel as any)?.scenarioComparison,
            sensitivity: (generatedModel as any)?.dcfSummary?.sensitivity,
          }),
        });
        if (!corePdfResponse.ok) {
          const coreError = await corePdfResponse.json().catch(() => ({}));
          throw new Error(coreError?.message || coreError?.error || 'Failed to export PDF.');
        }
        const blob = await corePdfResponse.blob();
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = blobUrl;
        anchor.download = `CapitalBase_Report_${safeName}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(blobUrl);
        return;
      } catch (err) {
        console.error('[handleDownloadReportPdf] core export failed, falling back', err);
      }
    }

    const url = resolveReportPdfUrl();
    if (!url) {
      showToast({
        title: 'PDF unavailable',
        description: 'Generate a report first to enable PDF download.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) {
        const errorData = await response.json().catch(async () => {
          const text = await response.text().catch(() => '');
          return { message: text };
        });
        throw new Error(
          errorData?.message ||
            errorData?.error ||
            `PDF download failed (${response.status}).`
        );
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = `CapitalBase_Report_${safeName}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to download PDF report.';
      showToast({
        title: 'PDF download failed',
        description: message,
        variant: 'destructive',
      });
      console.error('[handleDownloadReportPdf] failed', err);
    }
  }, [generatedModel, manualInputs.companyName, resolveReportPdfUrl, showToast, ticker]);

  const timerPanel = (
    <Card className="border border-dashed border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] text-[var(--cb-text-body)]">
      <CardContent className="flex flex-col items-center gap-3 p-5">
        <ModelGenerationTimer
          isRunning={loading}
          durationMs={lastDurationMs}
          stats={timerStats}
        />
        <p className="text-center text-xs text-[var(--cb-text-muted)]">
          Runtime color-codes against recent {modelType.toUpperCase()} runs for{' '}
          {ticker ? ticker.toUpperCase() : 'your next ticker'}.
        </p>
      </CardContent>
    </Card>
  );

  const canGenerateReport = Boolean(generatedModel);
  const showLiveDataFallbackBanner =
    warnings.includes(LIVE_DATA_FALLBACK_NOTICE) ||
    (generatedModel as any)?.liveDataFallback === true;

  return (
    <div className="h-full overflow-y-auto bg-[var(--cb-bg)] px-6 py-10 text-[var(--cb-text-body)]">
      <div className="mx-auto max-w-5xl space-y-8 pb-8">
        {/* Navigation */}
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/app">
              <Home className="mr-2 h-4 w-4" />
              Home
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/models">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Models
            </Link>
          </Button>
        </div>

        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--cb-text-muted)]">{APP_NAME}</p>
          <h1 className="text-3xl font-semibold text-[var(--cb-text-primary)] md:text-4xl">Generate Financial Model</h1>
          <p className="text-sm text-[var(--cb-text-secondary)] md:text-base">
            Choose a template, configure assumptions, and {APP_NAME} will generate both an Excel workbook and AI-powered analysis.
          </p>
        </header>

        {showLiveDataFallbackBanner && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            {LIVE_DATA_FALLBACK_NOTICE}
          </div>
        )}

        {!showResults ? (
          <>
            <form
              ref={formRef}
              onSubmit={handleSubmit}
              className="space-y-6 rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-6 shadow-sm"
            >
            {/* Model Type Selection */}
            <div className="space-y-3">
              <Label htmlFor="model-type">Model Type</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {CREATE_MODEL_OPTIONS.map((option) => (
                  <div
                    key={option.value}
                    onClick={() => setModelType(option.value)}
                    className={cn(
                      'cursor-pointer rounded-xl border px-4 py-4 transition-all',
                      modelType === option.value
                        ? 'border-[var(--cb-green)] bg-[var(--cb-surface-alt)] text-[var(--cb-text-primary)] shadow-[0_0_20px_rgba(0,227,135,0.08)]'
                        : 'border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] text-[var(--cb-text-body)] hover:border-[var(--cb-border-strong)] hover:bg-[var(--cb-surface)]'
                    )}
                  >
                    <div className="text-sm font-semibold text-[var(--cb-text-primary)] md:text-base">
                      {option.label}
                    </div>
                    <div className="mt-1 text-xs text-[var(--cb-text-muted)] md:text-sm">{option.description}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Company Type</Label>
              <div className="inline-flex rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] p-1">
                <Button
                  type="button"
                  variant={companyMode === 'public' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8"
                  onClick={() => setCompanyMode('public')}
                >
                  Public (Ticker)
                </Button>
                <Button
                  type="button"
                  variant={companyMode === 'private' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8"
                  onClick={() => setCompanyMode('private')}
                >
                  Private (Manual)
                </Button>
              </div>
            </div>

            {/* Ticker Input */}
            {!isPrivateMode && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Label htmlFor="ticker">Ticker Symbol</Label>
                <div className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">Demo data only</div>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <Input
                  id="ticker"
                  name="ticker"
                  placeholder="Enter ticker (e.g., MSFT, AAPL)"
                  value={ticker}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => setTicker(event.target.value.toUpperCase())}
                  className="text-lg flex-1 min-w-[120px]"
                />
                {demoDataActive && demoFilteredCompanies.length >= 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setTicker(demoFilteredCompanies[0].ticker)}
                  >
                    Load first
                  </Button>
                )}
                {demoDataActive && demoFilteredCompanies.length >= 2 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setTicker(demoFilteredCompanies[1].ticker)}
                  >
                    Load second
                  </Button>
                )}
              </div>
              {demoDataActive ? (
                <div className="space-y-2 text-xs text-[var(--cb-text-muted)]">
                  <p>Demo Mode: choose from companies in <code className="text-[10px] bg-muted px-1 rounded">public.demo_company_snapshots</code>.</p>
                  {ticker.trim() && demoTickers.length > 0 && !demoTickers.includes(normalizedTicker) && (
                    <p className="text-xs text-red-400">Ticker not in demo universe.</p>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search ticker or company name"
                        value={demoSearch}
                        onChange={(e) => setDemoSearch(e.target.value)}
                        className="pl-8 h-9 text-sm"
                      />
                    </div>
                    <Select value={demoSectorFilter || 'all'} onValueChange={(v) => setDemoSectorFilter(v === 'all' ? '' : v)}>
                      <SelectTrigger className="w-full sm:w-[180px] h-9 text-sm">
                        <SelectValue placeholder="All sectors" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All sectors</SelectItem>
                        {demoUniqueSectors.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <ScrollArea className="h-[240px] w-full rounded-md border border-border bg-muted/20 p-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pr-3">
                      {!demoFetched ? (
                        <span className="col-span-full text-muted-foreground py-4 text-center">Loading demo universe…</span>
                      ) : demoLoadError ? (
                        <span className="col-span-full text-red-500 py-4 text-center">Failed to load demo companies.</span>
                      ) : demoCompanies.length === 0 ? (
                        <span className="col-span-full text-muted-foreground py-4 text-center">No demo companies available.</span>
                      ) : demoFilteredCompanies.length === 0 ? (
                        <span className="col-span-full text-muted-foreground py-4 text-center">No matches</span>
                      ) : (
                        <TooltipProvider delayDuration={300}>
                          {demoFilteredCompanies.map((c) => {
                            const isSelected = normalizedTicker === c.ticker;
                            const chip = (
                              <Button
                                type="button"
                                variant={isSelected ? 'default' : 'outline'}
                                size="sm"
                                className="h-auto min-h-[44px] py-2 px-2 text-left justify-start font-mono text-xs"
                                onClick={() => setTicker(c.ticker)}
                              >
                                <span className="font-semibold uppercase">{c.ticker}</span>
                                {c.company_name && (
                                  <span className="block truncate text-[10px] font-normal opacity-90 mt-0.5">
                                    {c.company_name}
                                  </span>
                                )}
                              </Button>
                            );
                            return c.company_name ? (
                              <Tooltip key={c.ticker}>
                                <TooltipTrigger asChild>{chip}</TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[240px]">
                                  {c.company_name}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span key={c.ticker}>{chip}</span>
                            );
                          })}
                        </TooltipProvider>
                      )}
                    </div>
                  </ScrollArea>
                  <p className="text-muted-foreground">
                    Showing {demoFilteredCompanies.length} of {demoCompanies.length}
                  </p>
                  {!ticker.trim() && demoCompanies.length > 0 && (
                    <p className="text-xs text-[var(--cb-text-muted)]">
                      Demo Mode is active. Choose a demo company to continue.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[var(--cb-text-muted)]">
                  Demo mode is not enabled for this session. Enable demo mode to load curated demo tickers.
                </p>
              )}
            </div>
            )}

            {isPrivateMode && (
              <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
                <CardHeader>
                  <CardTitle className="text-base text-[var(--cb-text-primary)]">Private Company Inputs</CardTitle>
                  <CardDescription>
                    Private mode uses manual inputs; market data auto-fetch is disabled.
                  </CardDescription>
                  <p className="text-xs text-[var(--cb-text-muted)]">
                    Required for {modelType.toUpperCase()}: {privateRequirementsSummary}
                  </p>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="private-company-name">
                      Company Name {isPrivateFieldRequired('companyName') && <span className="text-[var(--cb-danger)]">*</span>}
                    </Label>
                    <Input
                      id="private-company-name"
                      value={manualInputs.companyName}
                      placeholder="Acme Holdings"
                      onChange={(event) =>
                        setManualInputs((prev) => ({ ...prev, companyName: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="private-currency">Currency</Label>
                    <Input
                      id="private-currency"
                      value={manualInputs.currency}
                      placeholder="USD"
                      onChange={(event) =>
                        setManualInputs((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="private-revenue-ltm">
                      Revenue (LTM) {isPrivateFieldRequired('revenue') && <span className="text-[var(--cb-danger)]">*</span>}
                    </Label>
                    <Input
                      id="private-revenue-ltm"
                      value={manualInputs.revenue}
                      placeholder="e.g., 450000000 or 450M"
                      onChange={(event) =>
                        setManualInputs((prev) => ({ ...prev, revenue: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="private-revenue-history">Revenue History (optional)</Label>
                    <Input
                      id="private-revenue-history"
                      value={manualInputs.revenueHistory}
                      placeholder="e.g., 320M,380M,450M"
                      onChange={(event) =>
                        setManualInputs((prev) => ({ ...prev, revenueHistory: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="private-revenue-growth">
                      Revenue Growth (%) {isPrivateFieldRequired('revenueGrowthPct') && <span className="text-[var(--cb-danger)]">*</span>}
                    </Label>
                    <Input
                      id="private-revenue-growth"
                      type="number"
                      step={0.1}
                      value={manualInputs.revenueGrowthPct}
                      onChange={(event) =>
                        setManualInputs((prev) => ({ ...prev, revenueGrowthPct: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="private-ebit-margin">
                      EBIT / EBITDA Margin (%) {isPrivateFieldRequired('ebitMarginPct') && <span className="text-[var(--cb-danger)]">*</span>}
                    </Label>
                    <Input
                      id="private-ebit-margin"
                      type="number"
                      step={0.1}
                      value={manualInputs.ebitMarginPct}
                      onChange={(event) =>
                        setManualInputs((prev) => ({ ...prev, ebitMarginPct: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="private-tax-rate">
                      Tax Rate (%) {isPrivateFieldRequired('taxRatePct') && <span className="text-[var(--cb-danger)]">*</span>}
                    </Label>
                    <Input
                      id="private-tax-rate"
                      type="number"
                      step={0.1}
                      value={manualInputs.taxRatePct}
                      onChange={(event) =>
                        setManualInputs((prev) => ({ ...prev, taxRatePct: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="private-da">D&A % of Revenue (optional)</Label>
                    <Input
                      id="private-da"
                      type="number"
                      step={0.1}
                      value={manualInputs.daPctRevenue}
                      onChange={(event) =>
                        setManualInputs((prev) => ({ ...prev, daPctRevenue: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="private-capex">
                      Capex % of Revenue {isPrivateFieldRequired('capexPctRevenue') && <span className="text-[var(--cb-danger)]">*</span>}
                    </Label>
                    <Input
                      id="private-capex"
                      type="number"
                      step={0.1}
                      value={manualInputs.capexPctRevenue}
                      onChange={(event) =>
                        setManualInputs((prev) => ({ ...prev, capexPctRevenue: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="private-nwc">
                      NWC % of Revenue {isPrivateFieldRequired('nwcPctRevenue') && <span className="text-[var(--cb-danger)]">*</span>}
                    </Label>
                    <Input
                      id="private-nwc"
                      type="number"
                      step={0.1}
                      value={manualInputs.nwcPctRevenue}
                      onChange={(event) =>
                        setManualInputs((prev) => ({ ...prev, nwcPctRevenue: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="private-net-debt">Net Debt / (Cash) (optional)</Label>
                    <Input
                      id="private-net-debt"
                      value={manualInputs.netDebt}
                      placeholder="e.g., 120000000 or -50000000"
                      onChange={(event) =>
                        setManualInputs((prev) => ({ ...prev, netDebt: event.target.value }))
                      }
                    />
                  </div>
                  {modelType !== 'reverse-dcf' ? (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor="private-shares">Shares Outstanding (optional)</Label>
                        <Input
                          id="private-shares"
                          value={manualInputs.sharesOutstanding}
                          placeholder="e.g., 120000000"
                          onChange={(event) =>
                            setManualInputs((prev) => ({ ...prev, sharesOutstanding: event.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="private-share-price">Share Price (optional)</Label>
                        <Input
                          id="private-share-price"
                          value={manualInputs.price}
                          placeholder="e.g., 25.50"
                          onChange={(event) =>
                            setManualInputs((prev) => ({ ...prev, price: event.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="private-market-cap">Market Cap (optional)</Label>
                        <Input
                          id="private-market-cap"
                          value={manualInputs.marketCap}
                          placeholder="e.g., 2500000000 or 2.5B"
                          onChange={(event) =>
                            setManualInputs((prev) => ({ ...prev, marketCap: event.target.value }))
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <div className="rounded-md border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] px-3 py-2 text-xs text-[var(--cb-text-secondary)] md:col-span-2">
                      Reverse DCF valuation anchor is set in the Reverse DCF section below.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Manual Financial Inputs (only shown when data can't be fetched) */}
            {missingFields.size > 0 && (
            <Card className="border border-amber-400/30 bg-amber-400/5">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base text-[var(--cb-text-primary)] flex items-center gap-2">
                      <span>⚠️</span>
                      <span>Manual Inputs Required</span>
                    </CardTitle>
                    <CardDescription className="mt-1">
                      We couldn&apos;t fetch some data automatically. Please enter the missing values below. These will take priority over all other sources.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowManualInputs(!showManualInputs)}
                    className="text-xs"
                  >
                    {showManualInputs ? 'Hide' : 'Show'} Missing Fields
                  </Button>
                </div>
              </CardHeader>
              {showManualInputs && (
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-[var(--cb-text-secondary)]">
                    <strong className="text-[var(--cb-text-primary)]">💡 Tip:</strong> Enter values in raw dollars (e.g., &quot;1000000000&quot; for $1B) or use notation like &quot;100M&quot; or &quot;1.5B&quot;.
                  </div>
                  
                  <div className="grid gap-4 md:grid-cols-2">
                    {missingFields.has('revenue') && (
                    <div className="space-y-2">
                      <Label htmlFor="manual-revenue" className="text-[var(--cb-text-primary)]">
                        Revenue (LTM) <span className="text-amber-500">*</span>
                      </Label>
                      <Input
                        id="manual-revenue"
                        type="text"
                        placeholder="e.g., 1000000000 or 1.5B"
                        value={manualInputs.revenue}
                        onChange={(e) => setManualInputs(prev => ({ ...prev, revenue: e.target.value }))}
                        className="bg-[var(--cb-surface-alt)] border-amber-400/30 text-[var(--cb-text-primary)] focus:border-amber-500"
                      />
                    </div>
                    )}
                    
                    {missingFields.has('ebitda') && (
                    <div className="space-y-2">
                      <Label htmlFor="manual-ebitda" className="text-[var(--cb-text-primary)]">
                        EBITDA (LTM) <span className="text-amber-500">*</span>
                      </Label>
                      <Input
                        id="manual-ebitda"
                        type="text"
                        placeholder="e.g., 250000000 or 250M"
                        value={manualInputs.ebitda}
                        onChange={(e) => setManualInputs(prev => ({ ...prev, ebitda: e.target.value }))}
                        className="bg-[var(--cb-surface-alt)] border-amber-400/30 text-[var(--cb-text-primary)] focus:border-amber-500"
                      />
                    </div>
                    )}
                    
                    {missingFields.has('sharesOutstanding') && (
                    <div className="space-y-2">
                      <Label htmlFor="manual-sharesOutstanding" className="text-[var(--cb-text-primary)]">
                        Shares Outstanding <span className="text-amber-500">*</span>
                      </Label>
                      <Input
                        id="manual-sharesOutstanding"
                        type="text"
                        placeholder="e.g., 1000000000 or 1B"
                        value={manualInputs.sharesOutstanding}
                        onChange={(e) => setManualInputs(prev => ({ ...prev, sharesOutstanding: e.target.value }))}
                        className="bg-[var(--cb-surface-alt)] border-amber-400/30 text-[var(--cb-text-primary)] focus:border-amber-500"
                      />
                      <p className="text-xs text-[var(--cb-text-muted)]">In raw shares (not millions)</p>
                    </div>
                    )}
                    
                    {missingFields.has('netDebt') && (
                    <div className="space-y-2">
                      <Label htmlFor="manual-netDebt" className="text-[var(--cb-text-primary)]">
                        Net Debt <span className="text-amber-500">*</span>
                      </Label>
                      <Input
                        id="manual-netDebt"
                        type="text"
                        placeholder="e.g., 500000000 or 500M"
                        value={manualInputs.netDebt}
                        onChange={(e) => setManualInputs(prev => ({ ...prev, netDebt: e.target.value }))}
                        className="bg-[var(--cb-surface-alt)] border-amber-400/30 text-[var(--cb-text-primary)] focus:border-amber-500"
                      />
                    </div>
                    )}
                    
                    {missingFields.has('marketCap') && (
                    <div className="space-y-2">
                      <Label htmlFor="manual-marketCap" className="text-[var(--cb-text-primary)]">
                        Market Cap <span className="text-amber-500">*</span>
                      </Label>
                      <Input
                        id="manual-marketCap"
                        type="text"
                        placeholder="e.g., 5000000000 or 5B"
                        value={manualInputs.marketCap}
                        onChange={(e) => setManualInputs(prev => ({ ...prev, marketCap: e.target.value }))}
                        className="bg-[var(--cb-surface-alt)] border-amber-400/30 text-[var(--cb-text-primary)] focus:border-amber-500"
                      />
                    </div>
                    )}
                  </div>
                  
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setManualInputs({
                          companyName: '',
                          currency: 'USD',
                          revenueHistory: '',
                          revenueGrowthPct: '8.0',
                          ebitMarginPct: '20.0',
                          taxRatePct: '25.0',
                          daPctRevenue: '4.0',
                          capexPctRevenue: '4.0',
                          nwcPctRevenue: '2.0',
                          price: '',
                          revenue: '',
                          ebitda: '',
                          ebit: '',
                          netIncome: '',
                          sharesOutstanding: '',
                          netDebt: '',
                          marketCap: '',
                          grossProfit: '',
                          operatingIncome: '',
                          totalDebt: '',
                          cash: '',
                        });
                      }}
                      className="text-xs"
                    >
                      Clear All
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
            )}

            {/* Custom Comps Input (only for Comps model) */}
            {modelType === 'comps' && (
              <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
                <CardHeader>
                  <CardTitle className="text-base text-[var(--cb-text-primary)]">Custom Comparables (Optional)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="customComps" className="text-[var(--cb-text-primary)]">
                      Custom Peer Tickers
                      <span className="ml-2 text-xs text-[var(--cb-text-muted)]">(comma-separated)</span>
                    </Label>
                    <Input
                      id="customComps"
                      name="customComps"
                      placeholder="NFLX, DIS, WBD, PARA"
                      value={customComps}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomComps(e.target.value.toUpperCase())}
                      className="bg-[var(--cb-surface-alt)] border-[var(--cb-border-subtle)] text-[var(--cb-text-primary)] focus:border-[var(--cb-green)] focus:ring-[var(--cb-green)]"
                    />
                    <p className="text-xs text-[var(--cb-text-muted)]">
                      Enter custom comparable company tickers. Leave blank to auto-generate peers.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="useOnlyCustom"
                      name="useOnlyCustom"
                      className="h-4 w-4 accent-[var(--cb-green)]"
                      checked={useOnlyCustom}
                      onChange={(e) => setUseOnlyCustom(e.target.checked)}
                      disabled={!customComps.trim()}
                    />
                    <Label htmlFor="useOnlyCustom" className="text-sm font-normal cursor-pointer text-[var(--cb-text-primary)]">
                      Use only custom comps (don&rsquo;t auto-generate)
                    </Label>
                  </div>

                  <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs text-[var(--cb-text-secondary)]">
                    <strong className="text-[var(--cb-text-primary)]">How it works:</strong>
                    <ul className="mt-1 space-y-1 ml-4 list-disc text-[var(--cb-text-secondary)]">
                      <li>No custom tickers → Auto-generates 8-12 peers</li>
                      <li>Some custom tickers → Blends with auto-generated peers</li>
                      <li>&ldquo;Use only custom&rdquo; checked → Uses ONLY your tickers</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Scenario Configuration */}
            {scenarioFeatureEnabled && (
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="text-lg">Scenario Configuration</CardTitle>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleScenarioReset}
                        className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                        disabled={loading}
                      >
                        Reset scenarios
                      </button>
                      <Label htmlFor="includeScenarios" className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          id="includeScenarios"
                          name="includeScenarios"
                          className="h-4 w-4 accent-primary"
                          checked={modelAssumptions.includeScenarios}
                          onChange={(e) => handleScenarioToggle(e.target.checked)}
                          disabled={scenarioControlsDisabled}
                        />
                        <span className="text-muted-foreground">Include scenarios</span>
                      </Label>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      Adjust each scenario directly. Switching Base / Bull / Bear updates the sliders to that case.
                    </p>
                    <Link href="/scenarios/methodology" className="text-xs font-semibold text-primary hover:underline">
                      Learn how scenarios are built →
                    </Link>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {SCENARIO_ORDER.map((scenario) => (
                      <button
                        key={scenario}
                        type="button"
                        onClick={() => setActiveScenario(scenario)}
                        disabled={scenarioControlsDisabled}
                        className={cn(
                          'rounded-full border-2 px-4 py-1.5 text-xs font-semibold transition-all',
                          activeScenarioTab === scenario
                            ? 'border-[var(--cb-green)] bg-[var(--cb-green)] text-[#041007] shadow-[0_0_12px_rgba(0,227,135,0.3)] font-bold'
                            : 'border-[var(--cb-border-strong)] bg-[var(--cb-surface)] text-[var(--cb-text-primary)] hover:border-[var(--cb-green)]/50 hover:bg-[var(--cb-surface-alt)]',
                          scenarioControlsDisabled && 'cursor-not-allowed opacity-50'
                        )}
                      >
                        {SCENARIO_LABELS[scenario]}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-5">
                    {(modelType === 'three-statement' ? THREE_STATEMENT_SLIDER_CONFIGS : DCF_SLIDER_CONFIGS).map((config) => {
                      const Icon = config.icon;
                      const sliderValue = modelAssumptions.scenarios[activeScenarioTab][config.key];
                      const disabled = scenarioControlsDisabled;
                      const errorText = assumptionErrors[config.key as string];
                      const clampedValue = Math.min(config.max, Math.max(config.min, sliderValue));
                      
                      // Map config.key to appliedDefaults path
                      const defaultPathMap: Record<string, string> = {
                        'wacc': 'wacc',
                        'terminalGrowth': 'terminalGrowth',
                        'revenueGrowth': 'revenueGrowth',
                        'ebitdaMargin': 'ebitdaMargin',
                        'daPctRevenue': 'daPctRevenue',
                        'deltaNwcPct': 'deltaNwcPctRevenue',
                        'capexPctRevenue': 'capexPctRevenue',
                        'taxRate': 'taxRate',
                      };
                      const defaultPath = defaultPathMap[config.key];
                      const appliedDefault = defaultPath 
                        ? appliedDefaults.find(d => d.path === defaultPath)
                        : undefined;

                      return (
                        <div key={config.key} className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <Label className={cn('flex items-center gap-2 flex-1 min-w-0', errorText && 'text-red-500')}>
                              <Icon className={cn('h-4 w-4 flex-shrink-0', config.iconClassName)} />
                              <span className="text-sm font-medium text-[var(--cb-text-primary)]">
                                {config.label}
                              </span>
                            </Label>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={cn(
                                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
                                'border-[var(--cb-green)]/30 bg-[var(--cb-surface-alt)] text-[var(--cb-green)]',
                                'dark:border-[var(--cb-green)]/50 dark:bg-[var(--cb-surface)] dark:text-[var(--cb-green)]'
                              )}>
                                {config.format(clampedValue)}
                              </span>
                              {appliedDefault && (
                                <AppliedDefaultBadge appliedDefault={appliedDefault} />
                              )}
                            </div>
                          </div>
                          <input
                            type="range"
                            min={config.min}
                            max={config.max}
                            step={config.step}
                            value={clampedValue}
                            onInput={(e) => {
                              const newValue = parseFloat((e.target as HTMLInputElement).value);
                              updateBaseScenario(config.key, newValue);
                            }}
                            onChange={(e) => {
                              const newValue = parseFloat(e.target.value);
                              updateBaseScenario(config.key, newValue);
                            }}
                            disabled={disabled}
                            className="w-full accent-[var(--cb-green)] disabled:opacity-50"
                          />
                          {errorText && (
                            <p className="text-xs text-red-500">{errorText}</p>
                          )}
                          <div className="flex justify-between text-xs text-[var(--cb-text-muted)] dark:text-[var(--cb-text-secondary)]">
                            <span>{config.format(config.min)}</span>
                            <span>{config.format(config.max)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {modelType === 'reverse-dcf' && (
              <Card className="border-[var(--cb-border-subtle)]">
                <CardHeader>
                  <CardTitle className="text-lg">Reverse DCF Inputs (Demo)</CardTitle>
                  <CardDescription>
                    Solve implied revenue CAGR from market price using fixed DCF assumptions.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div
                    className={`md:col-span-2 rounded-md border px-3 py-2 text-sm ${
                      isPrivateMode
                        ? reverseDcfMissingPrivateAnchor
                          ? 'border-[var(--cb-danger)]/40 bg-[var(--cb-danger)]/10 text-[var(--cb-danger)]'
                          : 'border-[var(--cb-green)]/30 bg-[var(--cb-green)]/10 text-[var(--cb-green)]'
                        : 'border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] text-[var(--cb-text-secondary)]'
                    }`}
                  >
                    {isPrivateMode
                      ? reverseDcfMissingPrivateAnchor
                        ? 'Reverse DCF requires market cap, target price, or share price + shares outstanding.'
                        : reverseDcfHasMarketCapAnchor
                          ? 'Reverse DCF anchor detected: Market Cap.'
                          : reverseDcfHasTargetPriceAnchor
                            ? 'Reverse DCF anchor detected: Target Price.'
                            : 'Reverse DCF anchor detected: Share Price + Shares Outstanding.'
                      : reverseDcfHasMarketCapAnchor
                        ? 'Using market cap override as the valuation anchor.'
                        : reverseDcfHasShareAnchor
                          ? 'Using share price + shares override as the valuation anchor.'
                          : 'Ticker mode uses demo market data as the default valuation anchor. You can override it below with market cap or share price + shares.'}
                  </div>
                  {isPrivateMode && (
                    <div className="md:col-span-2 rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                      <div className="mb-3">
                        <h4 className="text-sm font-semibold text-[var(--cb-text-primary)]">Valuation Anchor</h4>
                        <p className="mt-1 text-xs text-[var(--cb-text-secondary)]">
                          Required for Reverse DCF in private mode. Enter either market cap, or both share price and shares outstanding.
                        </p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-1">
                          <Label htmlFor="reverse-dcf-market-cap">
                            Market Cap <span className="text-[var(--cb-danger)]">*</span>
                          </Label>
                          <Input
                            id="reverse-dcf-market-cap"
                            value={manualInputs.marketCap}
                            placeholder="e.g., 2.5B"
                            onChange={(event) => {
                              clearReverseDcfAnchorError();
                              setManualInputs((prev) => ({ ...prev, marketCap: event.target.value }));
                            }}
                          />
                          <p className="text-[11px] text-[var(--cb-text-muted)]">Leave blank if using share price + shares.</p>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="reverse-dcf-share-price">
                            Share Price
                            {!reverseDcfHasMarketCapAnchor && <span className="text-[var(--cb-danger)]"> *</span>}
                          </Label>
                          <Input
                            id="reverse-dcf-share-price"
                            value={manualInputs.price}
                            placeholder="e.g., 25.50"
                            onChange={(event) => {
                              clearReverseDcfAnchorError();
                              setManualInputs((prev) => ({ ...prev, price: event.target.value }));
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="reverse-dcf-shares">
                            Shares Outstanding
                            {!reverseDcfHasMarketCapAnchor && <span className="text-[var(--cb-danger)]"> *</span>}
                          </Label>
                          <Input
                            id="reverse-dcf-shares"
                            value={manualInputs.sharesOutstanding}
                            placeholder="e.g., 120000000"
                            onChange={(event) => {
                              clearReverseDcfAnchorError();
                              setManualInputs((prev) => ({ ...prev, sharesOutstanding: event.target.value }));
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {!isPrivateMode && (
                    <div className="md:col-span-2 rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                      <div className="mb-3">
                        <h4 className="text-sm font-semibold text-[var(--cb-text-primary)]">
                          Valuation Anchor Overrides (optional)
                        </h4>
                        <p className="mt-1 text-xs text-[var(--cb-text-secondary)]">
                          Use market cap, or provide both share price and shares outstanding when market data is incomplete.
                        </p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-1">
                          <Label htmlFor="reverse-dcf-market-cap-override">Market Cap</Label>
                          <Input
                            id="reverse-dcf-market-cap-override"
                            value={manualInputs.marketCap}
                            placeholder="e.g., 2500000000 or 2.5B"
                            onChange={(event) => {
                              clearReverseDcfAnchorError();
                              setManualInputs((prev) => ({ ...prev, marketCap: event.target.value }));
                            }}
                          />
                          <p className="text-[11px] text-[var(--cb-text-muted)]">Overrides default market cap when provided.</p>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="reverse-dcf-share-price-override">Share Price</Label>
                          <Input
                            id="reverse-dcf-share-price-override"
                            value={manualInputs.price}
                            placeholder="e.g., 25.50"
                            onChange={(event) => {
                              clearReverseDcfAnchorError();
                              setManualInputs((prev) => ({ ...prev, price: event.target.value }));
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="reverse-dcf-shares-override">Shares Outstanding</Label>
                          <Input
                            id="reverse-dcf-shares-override"
                            value={manualInputs.sharesOutstanding}
                            placeholder="e.g., 120000000"
                            onChange={(event) => {
                              clearReverseDcfAnchorError();
                              setManualInputs((prev) => ({ ...prev, sharesOutstanding: event.target.value }));
                            }}
                          />
                          <p className="text-[11px] text-[var(--cb-text-muted)]">Enter raw shares (not millions).</p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label htmlFor="reverse-dcf-wacc">
                      WACC (%) <span className="text-[var(--cb-danger)]">*</span>
                    </Label>
                    <Input
                      id="reverse-dcf-wacc"
                      type="number"
                      min={0}
                      max={60}
                      step={0.1}
                      placeholder="10.0"
                      value={reverseDcfInputs.waccPct}
                      onChange={(event) =>
                        setReverseDcfInputs((prev) => ({ ...prev, waccPct: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="reverse-dcf-terminal-growth">
                      Terminal Growth (%) <span className="text-[var(--cb-danger)]">*</span>
                    </Label>
                    <Input
                      id="reverse-dcf-terminal-growth"
                      type="number"
                      min={-10}
                      max={20}
                      step={0.1}
                      placeholder="2.5"
                      value={reverseDcfInputs.terminalGrowthPct}
                      onChange={(event) =>
                        setReverseDcfInputs((prev) => ({ ...prev, terminalGrowthPct: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="reverse-dcf-years">
                      Projection Years <span className="text-[var(--cb-danger)]">*</span>
                    </Label>
                    <Input
                      id="reverse-dcf-years"
                      type="number"
                      min={3}
                      max={10}
                      step={1}
                      placeholder="5"
                      value={reverseDcfInputs.projectionYears}
                      onChange={(event) =>
                        setReverseDcfInputs((prev) => ({ ...prev, projectionYears: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="reverse-dcf-target-price">
                      {isPrivateMode ? 'Target Price (optional when anchor provided)' : 'Target Price (Optional)'}
                    </Label>
                    <Input
                      id="reverse-dcf-target-price"
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="Uses demo market price if blank"
                      value={reverseDcfInputs.targetPrice}
                      onChange={(event) =>
                        setReverseDcfInputs((prev) => ({ ...prev, targetPrice: event.target.value }))
                      }
                    />
                    <p className="text-xs text-[var(--cb-text-muted)]">
                      {isPrivateMode
                        ? 'Provide market cap OR share price + shares outstanding in Private Company Inputs when target price is blank.'
                        : 'Leave blank to default target price to current demo market price.'}
                    </p>
                  </div>
                  {reverseDcfInlineError && (
                    <div className="md:col-span-2 rounded-md border border-[var(--cb-danger)]/40 bg-[var(--cb-danger)]/10 px-3 py-2 text-sm text-[var(--cb-danger)]">
                      {reverseDcfInlineError}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {modelType === 'debt-capacity-lite' && (
              <Card className="border-[var(--cb-border-subtle)]">
                <CardHeader>
                  <CardTitle className="text-lg">Debt Capacity Lite Inputs (Demo)</CardTitle>
                  <CardDescription>
                    Estimate max debt from EBITDA with leverage and coverage constraints.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="debt-capacity-max-leverage">
                      Max Leverage (x) <span className="text-[var(--cb-danger)]">*</span>
                    </Label>
                    <Input
                      id="debt-capacity-max-leverage"
                      type="number"
                      min={0.1}
                      max={20}
                      step={0.1}
                      placeholder="4.0"
                      value={debtCapacityLiteInputs.maxLeverage}
                      onChange={(event) =>
                        setDebtCapacityLiteInputs((prev) => ({ ...prev, maxLeverage: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="debt-capacity-min-coverage">
                      Min Interest Coverage (x) <span className="text-[var(--cb-danger)]">*</span>
                    </Label>
                    <Input
                      id="debt-capacity-min-coverage"
                      type="number"
                      min={0.1}
                      max={20}
                      step={0.1}
                      placeholder="2.0"
                      value={debtCapacityLiteInputs.minInterestCoverage}
                      onChange={(event) =>
                        setDebtCapacityLiteInputs((prev) => ({
                          ...prev,
                          minInterestCoverage: event.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="debt-capacity-interest-rate">
                      Interest Rate (%) <span className="text-[var(--cb-danger)]">*</span>
                    </Label>
                    <Input
                      id="debt-capacity-interest-rate"
                      type="number"
                      min={0.1}
                      max={100}
                      step={0.1}
                      placeholder="7.0"
                      value={debtCapacityLiteInputs.interestRatePct}
                      onChange={(event) =>
                        setDebtCapacityLiteInputs((prev) => ({ ...prev, interestRatePct: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="md:col-span-3 rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] p-3">
                    <p className="text-xs text-[var(--cb-text-muted)]">
                      Formula: <code>maxDebt = min(EBITDA × maxLeverage, EBITDA ÷ minCoverage ÷ interestRate)</code>.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {modelType === 'dcf' && (
              <Card className="border-[var(--cb-border-subtle)]">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-lg">Advanced DCF Inputs (Optional)</CardTitle>
                    <CardDescription>
                      Optional overrides for WACC components. Leave blank to use default discounting.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAdvancedDcf((prev) => !prev)}
                  >
                    {showAdvancedDcf ? 'Hide Advanced' : 'Show Advanced'}
                  </Button>
                </CardHeader>
                {showAdvancedDcf && (
                  <CardContent className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="dcf-beta">Beta</Label>
                      <Input
                        id="dcf-beta"
                        type="number"
                        step="0.1"
                        placeholder="1.10"
                        value={advancedDcfForm.beta}
                        onChange={(event) => handleAdvancedDcfInputChange('beta', event.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="dcf-erp">Equity Risk Premium (%)</Label>
                      <Input
                        id="dcf-erp"
                        type="number"
                        step="0.1"
                        placeholder="5.0"
                        value={advancedDcfForm.equityRiskPremium}
                        onChange={(event) => handleAdvancedDcfInputChange('equityRiskPremium', event.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="dcf-cost-debt">Cost of Debt (%)</Label>
                      <Input
                        id="dcf-cost-debt"
                        type="number"
                        step="0.1"
                        placeholder="4.5"
                        value={advancedDcfForm.costOfDebt}
                        onChange={(event) => handleAdvancedDcfInputChange('costOfDebt', event.target.value)}
                      />
                    </div>
                  </CardContent>
                )}
              </Card>
            )}

            {modelType === 'lbo' && (
              <>
                <Card className="border-[var(--cb-border-subtle)]">
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="text-lg">LBO Input Mode</CardTitle>
                      <CardDescription>
                        Quick LBO uses demo assumptions to reduce setup to core deal levers.
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-[var(--cb-border-subtle)] px-3 py-2">
                      <Label htmlFor="quick-lbo-toggle" className="text-sm font-medium">
                        Quick LBO (Demo)
                      </Label>
                      <Switch
                        id="quick-lbo-toggle"
                        checked={quickLboMode}
                        onCheckedChange={setQuickLboMode}
                      />
                    </div>
                  </CardHeader>
                </Card>

                {quickLboMode && (
                  <Card className="border-[var(--cb-green)]/30">
                    <CardHeader>
                      <CardTitle className="text-lg">
                        Quick LBO Inputs <span className="text-[var(--cb-danger)]">*</span>
                      </CardTitle>
                      <CardDescription>
                        Provide only the core levers. Remaining assumptions are auto-filled for demo mode.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="lbo-entry-multiple-quick">
                          Entry Multiple (EV / EBITDA) <span className="text-[var(--cb-danger)]">*</span>
                        </Label>
                        <Input
                          id="lbo-entry-multiple-quick"
                          type="number"
                          min={0}
                          step={0.1}
                          value={lboRequiredInputs.entryMultiple}
                          onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, entryMultiple: e.target.value }))}
                          placeholder="10.0"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="lbo-debt-percent-quick">
                          Debt % <span className="text-[var(--cb-danger)]">*</span>
                        </Label>
                        <Input
                          id="lbo-debt-percent-quick"
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={lboRequiredInputs.debtPercent}
                          onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, debtPercent: e.target.value }))}
                          placeholder="60"
                          required
                        />
                        <p className="text-xs text-[var(--cb-text-muted)]">
                          Equity auto-derived: {Number.isFinite(parseFloat(lboRequiredInputs.debtPercent))
                            ? `${Math.max(0, 100 - parseFloat(lboRequiredInputs.debtPercent)).toFixed(1)}%`
                            : '—'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="lbo-interest-rate-quick">
                          Interest Rate (%) <span className="text-[var(--cb-danger)]">*</span>
                        </Label>
                        <Input
                          id="lbo-interest-rate-quick"
                          type="number"
                          min={0}
                          max={25}
                          step={0.1}
                          value={lboRequiredInputs.interestRate}
                          onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, interestRate: e.target.value }))}
                          placeholder="7.0"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="lbo-revenue-growth-quick">
                          Revenue Growth (%) <span className="text-[var(--cb-danger)]">*</span>
                        </Label>
                        <Input
                          id="lbo-revenue-growth-quick"
                          type="number"
                          step={0.1}
                          value={lboRequiredInputs.revenueGrowth}
                          onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, revenueGrowth: e.target.value }))}
                          placeholder="5.0"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="lbo-exit-multiple-quick">
                          Exit Multiple (EV / EBITDA) <span className="text-[var(--cb-danger)]">*</span>
                        </Label>
                        <Input
                          id="lbo-exit-multiple-quick"
                          type="number"
                          min={0}
                          step={0.1}
                          value={lboRequiredInputs.exitMultiple}
                          onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, exitMultiple: e.target.value }))}
                          placeholder="10.0"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="lbo-hold-period-quick">
                          Holding Period (years) <span className="text-[var(--cb-danger)]">*</span>
                        </Label>
                        <Input
                          id="lbo-hold-period-quick"
                          type="number"
                          min={1}
                          max={10}
                          step={0.5}
                          value={lboRequiredInputs.holdingPeriodYears}
                          onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, holdingPeriodYears: e.target.value }))}
                          placeholder="5"
                          required
                        />
                      </div>
                      <div className="md:col-span-2 rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] px-3 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--cb-text-muted)]">
                          Auto-filled assumptions
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {QUICK_LBO_DEFAULT_SUMMARY.map((item) => (
                            <div key={item.label} className="flex items-center justify-between text-xs">
                              <span className="text-[var(--cb-text-muted)]">{item.label}</span>
                              <span className="font-medium text-[var(--cb-text-primary)]">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {!quickLboMode && (
                <>
                <Card className="border-[var(--cb-green)]/30">
                  <CardHeader>
                    <CardTitle className="text-lg">
                      LBO Assumptions — User Defined <span className="text-[var(--cb-danger)]">*</span>
                    </CardTitle>
                    <CardDescription>
                      These inputs must be completed before generating the LBO model. No silent defaults will be used.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2 text-sm font-semibold text-[var(--cb-text-primary)]">
                      Entry assumptions
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-entry-multiple">
                        Entry Multiple (EV / EBITDA) <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-entry-multiple"
                        type="number"
                        min={0}
                        step={0.1}
                        value={lboRequiredInputs.entryMultiple}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, entryMultiple: e.target.value }))}
                        placeholder="10.0"
                        required
                      />
                      <p className="text-xs text-[var(--cb-text-muted)]">Purchase multiple on LTM EBITDA</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-transaction-fees">
                        Transaction Fees (%) <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-transaction-fees"
                        type="number"
                        min={0}
                        max={10}
                        step={0.1}
                        value={lboRequiredInputs.transactionFeesPercent}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, transactionFeesPercent: e.target.value }))}
                        placeholder="1.5"
                        required
                      />
                      <p className="text-xs text-[var(--cb-text-muted)]">% of enterprise value</p>
                    </div>

                    <div className="md:col-span-2 text-sm font-semibold text-[var(--cb-text-primary)] pt-2">
                      Financing mix
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-debt-percent">
                        Debt % <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-debt-percent"
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={lboRequiredInputs.debtPercent}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, debtPercent: e.target.value }))}
                        placeholder="60"
                        required
                      />
                      <p className="text-xs text-[var(--cb-text-muted)]">Must sum to 100% with equity</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-equity-percent">
                        Equity % <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-equity-percent"
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={lboRequiredInputs.equityPercent}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, equityPercent: e.target.value }))}
                        placeholder="40"
                        required
                      />
                      <p className="text-xs text-[var(--cb-text-muted)]">Must sum to 100% with debt</p>
                    </div>

                    <div className="md:col-span-2 text-sm font-semibold text-[var(--cb-text-primary)] pt-2">
                      Debt assumptions
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-interest-rate">
                        Blended Interest Rate (%) <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-interest-rate"
                        type="number"
                        min={0}
                        max={25}
                        step={0.1}
                        value={lboRequiredInputs.interestRate}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, interestRate: e.target.value }))}
                        placeholder="7.0"
                        required
                      />
                      <p className="text-xs text-[var(--cb-text-muted)]">Single blended rate for debt stack</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-amortization">
                        Mandatory Amortization (%) <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-amortization"
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={lboRequiredInputs.amortizationPercent}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, amortizationPercent: e.target.value }))}
                        placeholder="5.0"
                        required
                      />
                      <p className="text-xs text-[var(--cb-text-muted)]">Annual debt paydown %</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-cash-sweep">
                        Cash Sweep (%) <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-cash-sweep"
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={lboRequiredInputs.cashSweepPercent}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, cashSweepPercent: e.target.value }))}
                        placeholder="100"
                        required
                      />
                      <p className="text-xs text-[var(--cb-text-muted)]">% of excess cash to repay debt</p>
                    </div>

                    <div className="md:col-span-2 text-sm font-semibold text-[var(--cb-text-primary)] pt-2">
                      Operating assumptions
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-revenue-growth">
                        Revenue Growth (%) <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-revenue-growth"
                        type="number"
                        step={0.1}
                        value={lboRequiredInputs.revenueGrowth}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, revenueGrowth: e.target.value }))}
                        placeholder="5.0"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-ebitda-margin">
                        EBITDA Margin (%) <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-ebitda-margin"
                        type="number"
                        step={0.1}
                        value={lboRequiredInputs.ebitdaMargin}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, ebitdaMargin: e.target.value }))}
                        placeholder="25.0"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-capex-pct">
                        Capex % of Revenue <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-capex-pct"
                        type="number"
                        step={0.1}
                        value={lboRequiredInputs.capexPctRevenue}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, capexPctRevenue: e.target.value }))}
                        placeholder="4.0"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-delta-nwc">
                        ΔNWC % of Revenue <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-delta-nwc"
                        type="number"
                        step={0.1}
                        value={lboRequiredInputs.deltaNwcPctRevenue}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, deltaNwcPctRevenue: e.target.value }))}
                        placeholder="2.0"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-tax-rate">
                        Effective Tax Rate (%) <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-tax-rate"
                        type="number"
                        step={0.1}
                        value={lboRequiredInputs.taxRate}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, taxRate: e.target.value }))}
                        placeholder="25.0"
                        required
                      />
                    </div>

                    <div className="md:col-span-2 text-sm font-semibold text-[var(--cb-text-primary)] pt-2">
                      Exit assumptions
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-exit-multiple">
                        Exit Multiple (EV / EBITDA) <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-exit-multiple"
                        type="number"
                        min={0}
                        step={0.1}
                        value={lboRequiredInputs.exitMultiple}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, exitMultiple: e.target.value }))}
                        placeholder="10.0"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-hold-period">
                        Holding Period (years) <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-hold-period"
                        type="number"
                        min={1}
                        max={10}
                        step={0.5}
                        value={lboRequiredInputs.holdingPeriodYears}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, holdingPeriodYears: e.target.value }))}
                        placeholder="5"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-exit-fees">
                        Exit Fees (%) <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-exit-fees"
                        type="number"
                        min={0}
                        max={10}
                        step={0.1}
                        value={lboRequiredInputs.exitFeesPercent}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, exitFeesPercent: e.target.value }))}
                        placeholder="1.0"
                        required
                      />
                    </div>

                    <div className="md:col-span-2 text-sm font-semibold text-[var(--cb-text-primary)] pt-2">
                      Optional defaults
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-min-cash">
                        Minimum Cash Balance ($MM)
                      </Label>
                      <Input
                        id="lbo-min-cash"
                        type="number"
                        min={0}
                        step={0.1}
                        value={lboRequiredInputs.minimumCashBalance}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, minimumCashBalance: e.target.value }))}
                        placeholder="0"
                      />
                      <p className="text-xs text-[var(--cb-text-muted)]">Optional liquidity buffer at close</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="text-lg">Advanced LBO Options (Optional)</CardTitle>
                      <CardDescription>
                        Optional rollover equity and hybrid capital layers to populate the CapitalBase LBO template.
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAdvancedLbo((prev) => !prev)}
                    >
                      {showAdvancedLbo ? 'Hide Advanced Options' : 'Show Advanced Options'}
                    </Button>
                  </CardHeader>
                {showAdvancedLbo && (
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="lboAdvanced-management">Management rollover (% of equity)</Label>
                      <Input
                        id="lboAdvanced-management"
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={advancedLboForm.managementRolloverPct}
                        onChange={(event) =>
                          handleAdvancedInputChange('managementRolloverPct', event.target.value)
                        }
                        placeholder="10"
                      />
                      <p className="text-xs text-muted-foreground">
                        Enter the percent of fully diluted equity that management rolls over (e.g., 10).
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lboAdvanced-preferred">Preferred equity ($MM)</Label>
                      <Input
                        id="lboAdvanced-preferred"
                        type="number"
                        min={0}
                        step={0.1}
                        value={advancedLboForm.preferredEquityAmount}
                        onChange={(event) =>
                          handleAdvancedInputChange('preferredEquityAmount', event.target.value)
                        }
                        placeholder="25"
                      />
                      <p className="text-xs text-muted-foreground">Funding amount for preferred equity tranches.</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lboAdvanced-subNotes">Subordinated notes ($MM)</Label>
                      <Input
                        id="lboAdvanced-subNotes"
                        type="number"
                        min={0}
                        step={0.1}
                        value={advancedLboForm.subordinatedNotesAmount}
                        onChange={(event) =>
                          handleAdvancedInputChange('subordinatedNotesAmount', event.target.value)
                        }
                        placeholder="40"
                      />
                      <p className="text-xs text-muted-foreground">Optional mezzanine / subordinated notes financing.</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lboAdvanced-minCash">Minimum cash at close ($MM)</Label>
                      <Input
                        id="lboAdvanced-minCash"
                        type="number"
                        min={0}
                        step={0.1}
                        value={advancedLboForm.minimumCashAtClose}
                        onChange={(event) =>
                          handleAdvancedInputChange('minimumCashAtClose', event.target.value)
                        }
                        placeholder="50"
                      />
                      <p className="text-xs text-muted-foreground">
                        Overrides the cash balance / minimum cash rows in Sources & Uses.
                      </p>
                    </div>
                  </CardContent>
                )}
              </Card>
              </>
              )}
              </>
            )}

            {/* Merger Model Inputs */}
            {modelType === 'merger' && (
              <MergerInputsPanel
                inputs={mergerInputs}
                onChange={setMergerInputs}
                onValidate={(isValid, missing) => {
                  setMergerInputsValid(isValid);
                  if (missing.length > 0) {
                    setMissingInputs(missing);
                  }
                }}
                pulledData={null} // TODO: Pass pulled data when available
              />
            )}
            
            {/* Operating Model Inputs */}
            {modelType === 'operating' && (
              <OperatingInputsPanel
                inputs={operatingInputs}
                onChange={setOperatingInputs}
                onValidate={(isValid, missing) => {
                  setOperatingInputsValid(isValid);
                  if (missing.length > 0) {
                    setMissingInputs(missing);
                  }
                }}
              />
            )}

            {timerPanel}

            {globalFormError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{globalFormError}</div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button 
                type="submit" 
                disabled={loading || 
                         (modelType === 'merger' && !mergerInputsValid) ||
                         (modelType === 'operating' && !operatingInputsValid) ||
                         (scenarioFeatureEnabled && Object.keys(assumptionErrors).length > 0) ||
                         (demoDataActive && !demoTickerAllowed)} 
                className="flex-1"
              >
                {loading ? 'Generating Model…' : 'Generate Model'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push('/app')}>
                Cancel
              </Button>
            </div>

            {loading && (() => {
              const companyModelCopy = LOADING_TABS.companyModel;
              return (
                <LoadingPanel
                  title={companyModelCopy.title}
                  subtitle={companyModelCopy.subtitle}
                  steps={companyModelCopy.steps}
                  variant={companyModelCopy.variant}
                  showProgress={true}
                />
              );
            })()}
          </form>
          
          <MissingInputsModal
            isOpen={missingInputsModalOpen}
            onClose={() => setMissingInputsModalOpen(false)}
            missingInputs={missingInputs}
            modelType={modelType}
            specs={missingInputSpecs}
            values={missingInputOverrides}
            onApply={handleMissingInputsApply}
            onRetry={handleMissingInputsRetry}
          />
          </>
        ) : (
          /* Results Display */
          <div className="space-y-6">
            {timerPanel}
            
            {/* Blocks (show prominently if blocking) */}
            {blocks.length > 0 && (
              <Card className="border-[var(--cb-danger)] bg-[var(--cb-danger)]/5">
                <CardHeader>
                  <CardTitle className="text-[var(--cb-danger)]">Model Generation Blocked</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside space-y-1 text-sm text-[var(--cb-text-primary)]">
                    {blocks.map((block, idx) => (
                      <li key={idx}>{block}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            
            {/* Main Results Shell */}
            {generatedModel && (() => {
              const modelAssumptionsRaw = extractModelAssumptions((generatedModel as any).assumptions || {});
              const modelAssumptions = Object.entries(modelAssumptionsRaw).map(([key, value]) => ({
                label: key,
                value: value as string | number,
                unit: typeof value === 'number' && key.includes('Pct') ? '%' : undefined
              }));
              
              // Get diagnostics data
              const diagnostics = (generatedModel as any).diagnostics || [];
              const dataCompleteness: Record<string, 'available' | 'partial' | 'unavailable'> = {};
              
              // Extract data completeness from diagnostics
              diagnostics.forEach((diag: any) => {
                if (diag.stage) {
                  dataCompleteness[diag.stage] = diag.ok ? 'available' : 'unavailable';
                }
              });
              
              // Get model name
              const modelName = MODEL_OPTIONS.find(m => m.value === generatedModel.modelType)?.label || 
                generatedModel.modelType.toUpperCase();
              const runReportUrl =
                typeof generatedModel.modelId === 'string' && generatedModel.modelId.startsWith('run_')
                  ? `/api/model-runs/${generatedModel.modelId}/report/pdf`
                  : undefined;
              
              // Handle download via downloadWorkbook function
              const handleDownload = async () => {
                if (downloadState === 'downloading') return;
                try {
                  setDownloadState('downloading');
                  const existingDownloadUrl =
                    typeof generatedModel.downloadUrl === 'string' && generatedModel.downloadUrl.trim().length > 0
                      ? generatedModel.downloadUrl
                      : null;

                  if (existingDownloadUrl) {
                    const link = document.createElement('a');
                    link.href = existingDownloadUrl;
                    link.download = `${generatedModel.ticker}_${generatedModel.modelType}_${new Date()
                      .toISOString()
                      .split('T')[0]}.xlsx`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setDownloadState('idle');
                    return;
                  }

                  if (!lastRequestBody) {
                    throw new Error('Workbook download is unavailable for this run.');
                  }

                  await downloadWorkbook({
                    ticker: generatedModel.ticker,
                    modelType: generatedModel.modelType,
                    ...lastRequestBody,
                  } as DownloadWorkbookParams);
                  setDownloadState('idle');
                } catch (err: any) {
                  setDownloadState('error');
                  setError(err?.message === 'assumptions_required' ? 'Please complete required inputs first.' : err?.message || 'Download failed');
                }
              };
              
              // Canonical preview path: render ModelDocument only.
              const previewNode = generatedModel.modelDocument ? (
                <ModelPreviewRenderer doc={generatedModel.modelDocument} />
              ) : (
                <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
                  <CardContent className="p-6 text-center text-sm text-[var(--cb-text-muted)]">
                    Preview unavailable. Regenerate the model to build its ModelDocument.
                  </CardContent>
                </Card>
              );

              return (
                <ModelResultsShell
                  ticker={generatedModel.ticker}
                  modelName={modelName}
                  generatedAt={generatedModel.createdAt}
                  status={blocks.length > 0 ? 'failed' : 'success'}
                  onDownload={lastRequestBody ? handleDownload : undefined}
                  onDownloadPdfReport={handleDownloadReportPdf}
                  pdfReportUrl={runReportUrl || reportPdfUrl || undefined}
                  onRunAgain={resetForm}
                  preview={previewNode}
                  assumptions={
                    modelAssumptions.length > 0 ? (
                      <AssumptionsPanel
                        assumptions={modelAssumptions}
                        appliedDefaults={appliedDefaults}
                      />
                    ) : undefined
                  }
                  diagnostics={
                    <DiagnosticsPanel
                      dataCompleteness={Object.keys(dataCompleteness).length > 0 ? dataCompleteness : undefined}
                      appliedDefaults={appliedDefaults}
                      warnings={warnings}
                    />
                  }
                  state={generatedModel.state || 'generated'}
                  missingInputs={generatedModel.missingInputs || missingInputs}
                  estimatedInputs={generatedModel.estimatedInputs || estimatedInputs}
                  onCompleteAssumptions={() => setMissingInputsModalOpen(true)}
                  additionalAnalysis={
                    (hasAiSummaryCard || modelData) ? (
                      <div className="space-y-4">
                        {hasAiSummaryCard && aiSummaryText && (
                          <div>
                            <h4 className="mb-2 text-sm font-semibold text-[var(--cb-text-primary)]">Summary</h4>
                            <p className="text-sm text-[var(--cb-text-muted)]">{aiSummaryText}</p>
                          </div>
                        )}
                        {modelData?.keyAssumptions && Array.isArray(modelData.keyAssumptions) && modelData.keyAssumptions.length > 0 && (
                          <div>
                            <h4 className="mb-2 text-sm font-semibold text-[var(--cb-text-primary)]">Key Assumptions</h4>
                            <ul className="space-y-1 text-sm text-[var(--cb-text-muted)]">
                              {modelData.keyAssumptions.slice(0, 5).map((assumption: string, idx: number) => (
                                <li key={idx}>• {assumption}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : undefined
                  }
                />
              );
            })()}

            {generatedModel && (generatedModel.modelType === 'dcf' || generatedModel.modelType === 'lbo') && (
              <section className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-6">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--cb-text-primary)]">Break-even Solver</h2>
                    <p className="text-sm text-[var(--cb-text-secondary)]">
                      Solve one assumption to hit a target output using demo assumptions.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSolveBreakEven}
                    disabled={breakEvenLoading}
                  >
                    {breakEvenLoading ? 'Solving…' : 'Solve'}
                  </Button>
                </div>

                {generatedModel.modelType === 'dcf' ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="be-dcf-solvefor">Solve For</Label>
                      <Select
                        value={breakEvenSolveFor === 'ebitdaMargin' ? 'ebitdaMargin' : 'revenueGrowth'}
                        onValueChange={(value) =>
                          setBreakEvenSolveFor(value === 'ebitdaMargin' ? 'ebitdaMargin' : 'revenueGrowth')
                        }
                      >
                        <SelectTrigger id="be-dcf-solvefor">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="revenueGrowth">Revenue Growth</SelectItem>
                          <SelectItem value="ebitdaMargin">EBITDA Margin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="be-dcf-target">Target Price (optional)</Label>
                      <Input
                        id="be-dcf-target"
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="Uses current demo market price if blank"
                        value={breakEvenTargetPrice}
                        onChange={(event) => setBreakEvenTargetPrice(event.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="be-lbo-solvefor">Solve For</Label>
                      <Select
                        value={breakEvenSolveFor === 'entryMultiple' ? 'entryMultiple' : 'exitMultiple'}
                        onValueChange={(value) =>
                          setBreakEvenSolveFor(value === 'entryMultiple' ? 'entryMultiple' : 'exitMultiple')
                        }
                      >
                        <SelectTrigger id="be-lbo-solvefor">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="exitMultiple">Exit Multiple</SelectItem>
                          <SelectItem value="entryMultiple">Entry Multiple</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="be-lbo-target">Target IRR (%)</Label>
                      <Input
                        id="be-lbo-target"
                        type="number"
                        step={0.1}
                        placeholder="20.0"
                        value={breakEvenTargetIrr}
                        onChange={(event) => setBreakEvenTargetIrr(event.target.value)}
                      />
                    </div>
                  </div>
                )}

                {breakEvenError && (
                  <p className="mt-3 text-sm text-red-500">{breakEvenError}</p>
                )}

                {breakEvenResult && (
                  <div className="mt-4 space-y-3 rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p className="text-xs text-[var(--cb-text-muted)]">Solved Value</p>
                        <p className="font-mono text-sm text-[var(--cb-text-primary)]">
                          {breakEvenResult.modelType === 'dcf'
                            ? breakEvenResult.solveFor === 'revenueGrowth'
                              ? `${(breakEvenResult.solvedValue * 100).toFixed(2)}%`
                              : `${(breakEvenResult.solvedValue * 100).toFixed(2)}%`
                            : `${breakEvenResult.solvedValue.toFixed(2)}x`}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--cb-text-muted)]">Convergence</p>
                        <p className="text-sm text-[var(--cb-text-primary)]">
                          {breakEvenResult.converged ? 'Converged' : `Failed (${breakEvenResult.reason || 'unknown'})`}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--cb-text-muted)]">Residual Error</p>
                        <p className="font-mono text-sm text-[var(--cb-text-primary)]">
                          {typeof breakEvenResult.residualError === 'number'
                            ? breakEvenResult.modelType === 'dcf'
                              ? `$${breakEvenResult.residualError.toFixed(4)}`
                              : `${(breakEvenResult.residualError * 100).toFixed(3)}%`
                            : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--cb-text-muted)]">Iterations</p>
                        <p className="font-mono text-sm text-[var(--cb-text-primary)]">
                          {breakEvenResult.iterations}
                        </p>
                      </div>
                    </div>
                    {breakEvenResult.fixedAssumptions &&
                      Object.keys(breakEvenResult.fixedAssumptions).length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-medium text-[var(--cb-text-muted)]">Fixed assumptions</p>
                          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                            {Object.entries(breakEvenResult.fixedAssumptions).map(([key, value]) => (
                              <p key={key} className="text-xs text-[var(--cb-text-secondary)]">
                                <span className="font-medium text-[var(--cb-text-primary)]">{key}:</span>{' '}
                                {typeof value === 'number'
                                  ? Number.isFinite(value)
                                    ? Math.abs(value) < 1
                                      ? value.toFixed(4)
                                      : value.toFixed(2)
                                    : 'N/A'
                                  : String(value)}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </section>
            )}

            {generatedModel && generatedModel.modelType === 'debt-capacity-lite' && generatedModel.debtCapacityLite && (
              <section className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-6">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-[var(--cb-text-primary)]">
                    {generatedModel.debtCapacityLite.label}
                  </h2>
                  <p className="text-sm text-[var(--cb-text-secondary)]">
                    Estimated using demo EBITDA and user-provided leverage/coverage constraints.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="text-xs text-[var(--cb-text-muted)]">Leverage-based Cap</p>
                    <p className="font-mono text-sm text-[var(--cb-text-primary)]">
                      {generatedModel.debtCapacityLite.leverageCap.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--cb-text-muted)]">Coverage-based Cap</p>
                    <p className="font-mono text-sm text-[var(--cb-text-primary)]">
                      {generatedModel.debtCapacityLite.coverageCap.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--cb-text-muted)]">Selected Max Debt</p>
                    <p className="font-mono text-sm text-[var(--cb-text-primary)]">
                      {generatedModel.debtCapacityLite.maxDebt.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--cb-text-muted)]">Binding Constraint</p>
                    <p className="text-sm text-[var(--cb-text-primary)]">
                      {generatedModel.debtCapacityLite.bindingConstraint === 'leverage'
                        ? 'Leverage constraint'
                        : 'Coverage constraint'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--cb-text-muted)]">Current Net Debt</p>
                    <p className="font-mono text-sm text-[var(--cb-text-primary)]">
                      {typeof generatedModel.debtCapacityLite.currentNetDebt === 'number'
                        ? generatedModel.debtCapacityLite.currentNetDebt.toFixed(2)
                        : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--cb-text-muted)]">Headroom vs Net Debt</p>
                    <p className="font-mono text-sm text-[var(--cb-text-primary)]">
                      {typeof generatedModel.debtCapacityLite.headroomVsNetDebt === 'number'
                        ? generatedModel.debtCapacityLite.headroomVsNetDebt.toFixed(2)
                        : 'N/A'}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {generatedModel && (generatedModel.modelType === 'dcf' || generatedModel.modelType === 'lbo') && (() => {
              const isDcfSensitivity = generatedModel.modelType === 'dcf';
              const dcfSensitivity = (generatedModel as any)?.dcfSummary?.sensitivity;
              const lboSensitivity = (generatedModel as any)?.lboSummary?.sensitivity;
              const dcfExtents = isDcfSensitivity
                ? getMatrixExtents((dcfSensitivity?.values || []) as Array<Array<number | null>>)
                : null;
              const lboExtents = !isDcfSensitivity
                ? getMatrixExtents((lboSensitivity?.irr || []) as Array<Array<number | null>>)
                : null;

              if (isDcfSensitivity && !dcfSensitivity) return null;
              if (!isDcfSensitivity && !lboSensitivity) return null;

              return (
                <section className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-6">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-[var(--cb-text-primary)]">Sensitivity</h2>
                      <p className="text-sm text-[var(--cb-text-secondary)]">
                        {isDcfSensitivity
                          ? 'Value per share grid by WACC and terminal growth.'
                          : 'IRR-first grid by entry and exit multiples (MOIC shown in each cell).'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleRefreshSensitivity}
                      disabled={sensitivityLoading}
                    >
                      {sensitivityLoading ? 'Updating…' : 'Update Sensitivity'}
                    </Button>
                  </div>

                  {sensitivityError && (
                    <p className="mb-3 text-sm text-red-500">{sensitivityError}</p>
                  )}

                  {isDcfSensitivity ? (
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="space-y-1">
                          <Label htmlFor="dcf-sens-wacc-range">WACC Range (+/- %)</Label>
                          <Input
                            id="dcf-sens-wacc-range"
                            type="number"
                            step={0.1}
                            min={0.1}
                            value={dcfSensitivityInputs.waccRangePct}
                            onChange={(event) =>
                              setDcfSensitivityInputs((prev) => ({ ...prev, waccRangePct: event.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="dcf-sens-wacc-step">WACC Step (%)</Label>
                          <Input
                            id="dcf-sens-wacc-step"
                            type="number"
                            step={0.05}
                            min={0.05}
                            value={dcfSensitivityInputs.waccStepPct}
                            onChange={(event) =>
                              setDcfSensitivityInputs((prev) => ({ ...prev, waccStepPct: event.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="dcf-sens-tg-range">Terminal Growth Range (+/- %)</Label>
                          <Input
                            id="dcf-sens-tg-range"
                            type="number"
                            step={0.1}
                            min={0.1}
                            value={dcfSensitivityInputs.terminalGrowthRangePct}
                            onChange={(event) =>
                              setDcfSensitivityInputs((prev) => ({ ...prev, terminalGrowthRangePct: event.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="dcf-sens-tg-step">Terminal Growth Step (%)</Label>
                          <Input
                            id="dcf-sens-tg-step"
                            type="number"
                            step={0.05}
                            min={0.05}
                            value={dcfSensitivityInputs.terminalGrowthStepPct}
                            onChange={(event) =>
                              setDcfSensitivityInputs((prev) => ({ ...prev, terminalGrowthStepPct: event.target.value }))
                            }
                          />
                        </div>
                      </div>
                      <p className="text-xs text-[var(--cb-text-muted)]">
                        Base case: WACC {((dcfSensitivity?.base?.wacc ?? 0) * 100).toFixed(2)}%, terminal growth{' '}
                        {((dcfSensitivity?.base?.terminalGrowth ?? 0) * 100).toFixed(2)}%, value/share $
                        {(dcfSensitivity?.base?.pricePerShare ?? 0).toFixed(2)}.
                      </p>
                      <div className="overflow-x-auto rounded-lg border border-[var(--cb-border-subtle)]">
                        <table className="min-w-full border-collapse text-xs">
                          <thead>
                            <tr className="bg-[var(--cb-surface-alt)]">
                              <th className="border border-[var(--cb-border-subtle)] px-2 py-2 text-left font-semibold">
                                WACC \ TG
                              </th>
                              {(dcfSensitivity?.cols || []).map((col: number) => (
                                <th
                                  key={`dcf-col-${col}`}
                                  className="border border-[var(--cb-border-subtle)] px-2 py-2 text-right font-semibold"
                                >
                                  {(col * 100).toFixed(2)}%
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(dcfSensitivity?.rows || []).map((row: number, rowIndex: number) => (
                              <tr key={`dcf-row-${row}`}>
                                <td className="border border-[var(--cb-border-subtle)] px-2 py-2 font-semibold">
                                  {(row * 100).toFixed(2)}%
                                </td>
                                {(dcfSensitivity?.values?.[rowIndex] || []).map((cell: number | null, colIndex: number) => (
                                  <td
                                    key={`dcf-cell-${rowIndex}-${colIndex}`}
                                    className="border border-[var(--cb-border-subtle)] px-2 py-2 text-right font-mono"
                                    style={{ backgroundColor: getHeatColor(cell, dcfExtents) }}
                                  >
                                    {typeof cell === 'number' && Number.isFinite(cell) ? `$${cell.toFixed(2)}` : '—'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="space-y-1">
                          <Label htmlFor="lbo-sens-entry-range">Entry Range (+/- x)</Label>
                          <Input
                            id="lbo-sens-entry-range"
                            type="number"
                            step={0.1}
                            min={0.1}
                            value={lboSensitivityInputs.entryRange}
                            onChange={(event) =>
                              setLboSensitivityInputs((prev) => ({ ...prev, entryRange: event.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="lbo-sens-entry-step">Entry Step (x)</Label>
                          <Input
                            id="lbo-sens-entry-step"
                            type="number"
                            step={0.1}
                            min={0.1}
                            value={lboSensitivityInputs.entryStep}
                            onChange={(event) =>
                              setLboSensitivityInputs((prev) => ({ ...prev, entryStep: event.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="lbo-sens-exit-range">Exit Range (+/- x)</Label>
                          <Input
                            id="lbo-sens-exit-range"
                            type="number"
                            step={0.1}
                            min={0.1}
                            value={lboSensitivityInputs.exitRange}
                            onChange={(event) =>
                              setLboSensitivityInputs((prev) => ({ ...prev, exitRange: event.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="lbo-sens-exit-step">Exit Step (x)</Label>
                          <Input
                            id="lbo-sens-exit-step"
                            type="number"
                            step={0.1}
                            min={0.1}
                            value={lboSensitivityInputs.exitStep}
                            onChange={(event) =>
                              setLboSensitivityInputs((prev) => ({ ...prev, exitStep: event.target.value }))
                            }
                          />
                        </div>
                      </div>
                      <p className="text-xs text-[var(--cb-text-muted)]">
                        Base case: entry {(lboSensitivity?.base?.entryMultiple ?? 0).toFixed(1)}x, exit{' '}
                        {(lboSensitivity?.base?.exitMultiple ?? 0).toFixed(1)}x, IRR{' '}
                        {((lboSensitivity?.base?.irr ?? 0) * 100).toFixed(1)}%, MOIC{' '}
                        {(lboSensitivity?.base?.moic ?? 0).toFixed(2)}x.
                      </p>
                      <div className="overflow-x-auto rounded-lg border border-[var(--cb-border-subtle)]">
                        <table className="min-w-full border-collapse text-xs">
                          <thead>
                            <tr className="bg-[var(--cb-surface-alt)]">
                              <th className="border border-[var(--cb-border-subtle)] px-2 py-2 text-left font-semibold">
                                Entry \ Exit
                              </th>
                              {(lboSensitivity?.cols || []).map((col: number) => (
                                <th
                                  key={`lbo-col-${col}`}
                                  className="border border-[var(--cb-border-subtle)] px-2 py-2 text-right font-semibold"
                                >
                                  {col.toFixed(1)}x
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(lboSensitivity?.rows || []).map((row: number, rowIndex: number) => (
                              <tr key={`lbo-row-${row}`}>
                                <td className="border border-[var(--cb-border-subtle)] px-2 py-2 font-semibold">
                                  {row.toFixed(1)}x
                                </td>
                                {(lboSensitivity?.irr?.[rowIndex] || []).map((cell: number | null, colIndex: number) => {
                                  const moic = lboSensitivity?.moic?.[rowIndex]?.[colIndex];
                                  return (
                                    <td
                                      key={`lbo-cell-${rowIndex}-${colIndex}`}
                                      className="border border-[var(--cb-border-subtle)] px-2 py-1 text-right font-mono"
                                      style={{ backgroundColor: getHeatColor(cell, lboExtents) }}
                                    >
                                      <div>{typeof cell === 'number' && Number.isFinite(cell) ? `${(cell * 100).toFixed(1)}%` : '—'}</div>
                                      <div className="text-[10px] text-[var(--cb-text-muted)]">
                                        {typeof moic === 'number' && Number.isFinite(moic) ? `${moic.toFixed(2)}x` : '—'}
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </section>
              );
            })()}


            <section className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--cb-text-primary)]">CapitalBase Analyst Report</h2>
                  <p className="text-sm text-[var(--cb-text-secondary)]">
                    Generate a narrative that connects this valuation to macro context, upside drivers, and risks.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  {resolveReportPdfUrl() && (
                    <button
                      type="button"
                      onClick={handleDownloadReportPdf}
                      className="inline-flex items-center justify-center rounded-lg border border-[var(--cb-border-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--cb-text-primary)] hover:bg-[var(--cb-surface-alt)]"
                    >
                      Download PDF
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleGenerateReport}
                    disabled={!canGenerateReport || reportLoading}
                    className="rounded-lg bg-cb-blue px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {reportLoading ? 'Generating…' : reportText ? 'Regenerate report' : 'Generate report'}
                  </button>
                </div>
              </div>
              {reportError && <p className="mb-3 text-sm text-red-500">{reportError}</p>}
              {reportText ? (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                    <ReportMarkdown text={reportText} reportPayload={reportPayload} />
                  </div>
                  {insightCards.length > 0 && <InsightCardsGrid cards={insightCards} />}
                </div>
              ) : (
                !reportLoading && (
                  <p className="text-sm text-[var(--cb-text-secondary)]">
                    Generate a CapitalBase-ready memo once the model finishes. You&apos;ll get shareable text, insight
                    cards, and a branded PDF download automatically.
                  </p>
                )
              )}
            </section>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={resetForm} className="flex-1">
                Generate Another Model
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link href="/models">View All Models</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/dashboard">
                  <Home className="mr-2 h-4 w-4" />
                  Home
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
      <ToastEnhanced toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

export default function CreateModelPage() {
  return (
    <ModelAssumptionsProvider>
      <CreateModelPageInner />
    </ModelAssumptionsProvider>
  );
}

function parseReportBodyBlocks(
  body: string
): Array<{ type: 'paragraph'; text: string } | { type: 'bullets'; items: string[] }> {
  const chunks = body
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

  const blocks: Array<{ type: 'paragraph'; text: string } | { type: 'bullets'; items: string[] }> = [];

  for (const chunk of chunks) {
    const lines = chunk
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    let paragraphLines: string[] = [];
    let bulletLines: string[] = [];

    const flushParagraph = () => {
      if (!paragraphLines.length) return;
      blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') });
      paragraphLines = [];
    };

    const flushBullets = () => {
      if (!bulletLines.length) return;
      blocks.push({
        type: 'bullets',
        items: bulletLines.map((line) => line.replace(/^[•*-]\s+/, '').trim()),
      });
      bulletLines = [];
    };

    for (const line of lines) {
      if (/^[•*-]\s+/.test(line)) {
        flushParagraph();
        bulletLines.push(line);
      } else {
        flushBullets();
        paragraphLines.push(line);
      }
    }

    flushParagraph();
    flushBullets();
  }

  return blocks;
}

function ReportMarkdown({ text, reportPayload }: { text: string; reportPayload?: any }) {
  // Prefer canonical structure if available
  let sections: Array<{ title: string; body: string }> = [];
  let useFallback = false;
  const reportTitle =
    reportPayload?.title && typeof reportPayload.title === 'string'
      ? reportPayload.title
      : 'CapitalBase Analyst Report';
  const reportSubtitle =
    reportPayload?.subtitle && typeof reportPayload.subtitle === 'string' ? reportPayload.subtitle : null;
  const reportSummary =
    reportPayload?.summaryText && typeof reportPayload.summaryText === 'string'
      ? reportPayload.summaryText.trim()
      : text?.trim() || '';
  const reportTakeaways = Array.isArray(reportPayload?.keyTakeaways)
    ? reportPayload.keyTakeaways.filter((item: any) => typeof item === 'string' && item.trim().length > 0)
    : [];
  const generatedLabel =
    reportPayload?.generatedAt && typeof reportPayload.generatedAt === 'string'
      ? new Date(reportPayload.generatedAt).toLocaleString()
      : null;

  if (reportPayload && reportPayload.sections && Array.isArray(reportPayload.sections)) {
    // Use canonical structure
    sections = reportPayload.sections.map((section: any) => ({
      title: section.title || 'Untitled Section',
      body: section.body && section.body.trim().length > 0 
        ? section.body.trim() 
        : 'Content unavailable due to a rendering issue. Please regenerate.',
    }));
  } else {
    // Fall back to markdown parsing
    try {
      const parsed = text
        .split(/\n(?=## )/g)
        .map((block) => {
          const trimmed = block.trim();
          if (!trimmed) return null;
          if (trimmed.startsWith('## ')) {
            const [firstLine, ...rest] = trimmed.split('\n');
            const title = firstLine.replace(/^##\s*/, '').trim();
            const body = rest.join('\n').trim();
            return { title, body };
          }
          return { title: 'Introduction', body: trimmed };
        })
        .filter((s): s is { title: string; body: string } => 
          s !== null && s.title.length > 0
        );

      sections = parsed.map(section => ({
        title: section.title,
        body: section.body && section.body.trim().length > 0
          ? section.body.trim()
          : 'Content unavailable due to a rendering issue. Please regenerate.',
      }));
    } catch (err) {
      console.error('[ReportMarkdown] Failed to parse report', err);
      useFallback = true;
    }
  }

  // Ensure minimum sections
  if (sections.length === 0) {
    sections = [{
      title: 'Report Content',
      body: text && text.trim().length > 0 
        ? text.trim() 
        : 'Content unavailable due to a rendering issue. Please regenerate.',
    }];
    useFallback = true;
  }

  // Ensure all sections have non-empty bodies
  sections = sections.map(section => ({
    title: section.title || 'Untitled Section',
    body: section.body && section.body.trim().length > 0
      ? section.body.trim()
      : 'Content unavailable due to a rendering issue. Please regenerate.',
  }));

  return (
    <div className="space-y-4">
      {useFallback && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
          Report rendered in fallback mode due to a formatting issue.
        </div>
      )}
      <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">
              CapitalBase Analyst Memo
            </p>
            <h3 className="text-lg font-semibold text-[var(--cb-text-primary)]">{reportTitle}</h3>
            {reportSubtitle && <p className="text-sm text-[var(--cb-text-secondary)]">{reportSubtitle}</p>}
          </div>
          {generatedLabel && (
            <div className="rounded-full border border-[var(--cb-border-subtle)] px-3 py-1 text-xs text-[var(--cb-text-muted)]">
              Generated {generatedLabel}
            </div>
          )}
        </div>
        {reportSummary && (
          <div className="mt-4 rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-4">
            <p className="text-sm leading-6 text-[var(--cb-text-primary)]">{reportSummary}</p>
          </div>
        )}
        {reportTakeaways.length > 0 && (
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {reportTakeaways.slice(0, 3).map((takeaway: string, index: number) => (
              <div
                key={`${takeaway}-${index}`}
                className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] px-4 py-3 text-sm text-[var(--cb-text-primary)]"
              >
                {takeaway}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="grid gap-4">
        {sections.map((section, index) => {
          const blocks = parseReportBodyBlocks(section.body);
          return (
            <div
              key={index}
              className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-5"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="h-5 w-1 rounded-full bg-[var(--cb-green)]" />
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--cb-text-primary)]">
                  {section.title}
                </h3>
              </div>
              <div className="space-y-3 text-sm leading-6 text-[var(--cb-text-primary)]">
                {blocks.map((block, blockIndex) =>
                  block.type === 'paragraph' ? (
                    <p key={`${section.title}-p-${blockIndex}`}>{block.text}</p>
                  ) : (
                    <ul
                      key={`${section.title}-b-${blockIndex}`}
                      className="space-y-2 pl-5 text-[var(--cb-text-primary)]"
                    >
                      {block.items.map((item, itemIndex) => (
                        <li key={`${section.title}-b-${blockIndex}-${itemIndex}`}>{item}</li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
      {process.env.NODE_ENV === 'development' && (
        <details className="mt-4 rounded-lg border border-gray-300 p-2 text-xs">
          <summary className="cursor-pointer font-semibold">Debug Info</summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all">
            {JSON.stringify({ sectionsCount: sections.length, useFallback, hasPayload: !!reportPayload }, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function InsightCardsGrid({ cards }: { cards: InsightCard[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--cb-text-muted)]">Insight Cards</h3>
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((card, index) => (
          <div
            key={`${card.title}-${index}`}
            className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4 shadow-sm"
          >
            <p className="text-sm font-semibold text-[var(--cb-text-primary)]">{card.title}</p>
            <p className="mt-1 text-sm text-[var(--cb-text-secondary)] whitespace-pre-wrap">{card.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
