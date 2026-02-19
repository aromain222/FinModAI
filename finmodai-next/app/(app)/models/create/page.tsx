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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search } from 'lucide-react';

const MODEL_OPTIONS = [
  { value: 'three-statement', label: 'Three Statement Model', description: 'Full P&L, Balance Sheet, Cash Flow' },
  { value: 'dcf', label: 'Discounted Cash Flow (DCF)', description: 'Intrinsic valuation with terminal value' },
  { value: 'comps', label: 'Trading Comps Model', description: 'Peer group valuation multiples' },
  { value: 'scorecard', label: 'Fundamentals Scorecard', description: 'Deterministic ratio scorecard with sector context' },
  // LBO, Merger, Operating hidden from UI (backend still supports)
  { value: 'lbo', label: 'Leveraged Buyout (LBO)', description: 'Returns analysis with debt paydown' },
  { value: 'merger', label: 'Merger Model', description: 'Combined IS + EPS bridge + accretion/dilution' },
  { value: 'operating', label: 'Operating Model', description: 'Monthly FP&A + cash runway + variance analysis' }
] as const;

/** Model types shown in create dropdown (LBO, M&A, Operating hidden from UI) */
const CREATE_MODEL_OPTIONS = MODEL_OPTIONS.filter(
  (o) => o.value === 'three-statement' || o.value === 'dcf' || o.value === 'comps' || o.value === 'scorecard'
);

type ModelType = (typeof MODEL_OPTIONS)[number]['value'];

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
  }, [applyDemoScenarioDefaults, demoDataActive, demoTickerAllowed, normalizedTicker]);

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
    // No-op: scenario controls remain editable across model types.
  }, [modelType]);

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
    }
  }, [modelType]);

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
      if (!trimmedTicker) {
        setError('Please enter a ticker.');
        return;
      }
      if (demoDataActive && demoTickers.length > 0 && !demoTickers.includes(trimmedTicker)) {
        setError('Demo Mode is active. Choose a demo company to continue.');
        return;
      }
    }

    // Validate required inputs before generation
    if (modelType === 'lbo') {
      const validation = validateModelInputs({
        entryMultiple: lboRequiredInputs.entryMultiple ? parseFloat(lboRequiredInputs.entryMultiple) : undefined,
        exitMultiple: lboRequiredInputs.exitMultiple ? parseFloat(lboRequiredInputs.exitMultiple) : undefined,
        transactionFeesPercent: lboRequiredInputs.transactionFeesPercent ? parseFloat(lboRequiredInputs.transactionFeesPercent) / 100 : undefined,
        exitFeesPercent: lboRequiredInputs.exitFeesPercent ? parseFloat(lboRequiredInputs.exitFeesPercent) / 100 : undefined,
        debtPercent: lboRequiredInputs.debtPercent ? parseFloat(lboRequiredInputs.debtPercent) : undefined,
        equityPercent: lboRequiredInputs.equityPercent ? parseFloat(lboRequiredInputs.equityPercent) : undefined,
        interestRate: lboRequiredInputs.interestRate ? parseFloat(lboRequiredInputs.interestRate) / 100 : undefined,
        amortizationPercent: lboRequiredInputs.amortizationPercent ? parseFloat(lboRequiredInputs.amortizationPercent) / 100 : undefined,
        cashSweepPercent: lboRequiredInputs.cashSweepPercent ? parseFloat(lboRequiredInputs.cashSweepPercent) / 100 : undefined,
        revenueGrowth: lboRequiredInputs.revenueGrowth ? parseFloat(lboRequiredInputs.revenueGrowth) / 100 : undefined,
        ebitdaMargin: lboRequiredInputs.ebitdaMargin ? parseFloat(lboRequiredInputs.ebitdaMargin) / 100 : undefined,
        capexPctRevenue: lboRequiredInputs.capexPctRevenue ? parseFloat(lboRequiredInputs.capexPctRevenue) / 100 : undefined,
        deltaNwcPctRevenue: lboRequiredInputs.deltaNwcPctRevenue ? parseFloat(lboRequiredInputs.deltaNwcPctRevenue) / 100 : undefined,
        taxRate: lboRequiredInputs.taxRate ? parseFloat(lboRequiredInputs.taxRate) / 100 : undefined,
        holdingPeriodYears: lboRequiredInputs.holdingPeriodYears ? parseFloat(lboRequiredInputs.holdingPeriodYears) : undefined,
        minimumCashBalance: lboRequiredInputs.minimumCashBalance ? parseFloat(lboRequiredInputs.minimumCashBalance) : undefined,
      });
      
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
            ticker: trimmedTicker,
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

      const useAdvancedDcf = modelType === 'dcf';
      const advancedDcfBeta = useAdvancedDcf ? parseAdvancedNumber(advancedDcfForm.beta) : undefined;
      const advancedDcfErp = useAdvancedDcf ? parsePercentInput(advancedDcfForm.equityRiskPremium) : undefined;
      const advancedDcfCostOfDebt = useAdvancedDcf ? parsePercentInput(advancedDcfForm.costOfDebt) : undefined;

      let requestBody: Record<string, any> = {
        ticker: trimmedTicker,
        modelType,
        dataSource: 'demo',
        includeScenarios: includeScenarioFlag || undefined,
        wacc: scenarioFeatureEnabled ? baseScenario.wacc / 100 : undefined,
        terminalGrowth: scenarioFeatureEnabled ? baseScenario.terminalGrowth / 100 : undefined,
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
        lboAdvanced: modelType === 'lbo' ? advancedLboPayload : undefined,
        lboOverrides: modelType === 'lbo'
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
        lboDealAssumptions: modelType === 'lbo'
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
          ticker: trimmedTicker,
          modelType: 'comps',
          dataSource: requestBody.dataSource,
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
        ticker: trimmedTicker, // Standard models use ticker
        modelType,
        createdAt: new Date().toISOString(),
        downloadUrl: generateData.downloadUrl || '',
        preview: generateData.preview || EMPTY_PREVIEW,
        modelDocument: generateData.modelDocument || null,
        summaryText:
          normalizeNarrativeText(latestAnalysisData?.summary) ??
          normalizeNarrativeText(modelData?.summary) ??
          `Excel model generated for ${trimmedTicker}`,
        // Store model-specific summaries for preview parsing
        dcfSummary: generateData.dcfSummary,
        lboSummary: generateData.lboSummary,
        assumptions: generateData.assumptions,
        diagnostics: generateData.diagnostics,
        // Store state information
        state: generateData.state || generateData.status || 'generated',
        missingInputs: generateData.missingInputs || generateData.missing || [],
        requiredInputs: generateData.requiredInputs || [],
        estimatedInputs: generateData.estimatedInputs || generateData.estimated || [],
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
      fetchModelStats(trimmedTicker, metricsModelTypeParam);

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

  const resetForm = () => {
    setTicker('');
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
    setMergerInputs({});
    setMergerInputsValid(false);
    setOperatingInputs({});
    setOperatingInputsValid(false);
    setAppliedDefaults([]);
    setWarnings([]);
    setBlocks([]);
    setEstimatedInputs([]);
    setManualInputs({
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
      modelType === 'three-statement' ? 'three_statement' : modelType;

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
      companyName: companyName || generatedModel.ticker || 'Unknown Company',
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
      },
      highLevelNotes: [
        ...(scenarioBullets ? scenarioBullets : []),
        ...(diagnosticsBullets.length ? diagnosticsBullets : []),
      ]
        .filter(Boolean)
        .join(' '),
    };

    const modelDataPayload = {
      dcfSummary: generatedModel.dcfSummary,
      scenarioSummaries: generatedModel.scenarioSummaries,
      lboSummary: generatedModel.lboSummary,
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
          ticker: generatedModel.ticker ?? ticker?.toUpperCase() ?? '',
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
      if (data.pdfBase64) {
        const bytes = Uint8Array.from(atob(data.pdfBase64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setReportPdfUrl(url);
      } else if (data.pdfUrl) {
        setReportPdfUrl(data.pdfUrl);
      }
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Failed to generate report.');
    } finally {
      setReportLoading(false);
    }
  };

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

  return (
    <main className="min-h-screen bg-[var(--cb-bg)] px-6 py-10 text-[var(--cb-text-body)]">
      <div className="mx-auto max-w-5xl space-y-8">
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

            {/* Ticker Input */}
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

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
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
                  ? `/reports/${generatedModel.modelId}?print=1`
                  : undefined;
              
              // Handle download via downloadWorkbook function
              const handleDownload = async () => {
                if (!lastRequestBody || downloadState === 'downloading') return;
                try {
                  setDownloadState('downloading');
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
                  pdfReportUrl={runReportUrl}
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


            <section className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--cb-text-primary)]">CapitalBase Analyst Report</h2>
                  <p className="text-sm text-[var(--cb-text-secondary)]">
                    Generate a narrative that connects this valuation to macro context, upside drivers, and risks.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  {reportPdfUrl && (
                    <a
                      href={reportPdfUrl}
                      download={`CapitalBase-${ticker || generatedModel?.ticker || 'report'}.pdf`}
                      className="inline-flex items-center justify-center rounded-lg border border-[var(--cb-border-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--cb-text-primary)] hover:bg-[var(--cb-surface-alt)]"
                    >
                      Download PDF
                    </a>
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
    </main>
  );
}

export default function CreateModelPage() {
  return (
    <ModelAssumptionsProvider>
      <CreateModelPageInner />
    </ModelAssumptionsProvider>
  );
}

function ReportMarkdown({ text, reportPayload }: { text: string; reportPayload?: any }) {
  // Prefer canonical structure if available
  let sections: Array<{ title: string; body: string }> = [];
  let useFallback = false;

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
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400">
          ⚠️ Report rendered in fallback mode due to a formatting issue.
        </div>
      )}
      {sections.map((section, index) => (
        <div key={index} className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--cb-green)]">{section.title}</h3>
          <div className="space-y-2 text-sm text-[var(--cb-text-primary)]">
            {section.body.split(/\n\s*\n/).map((paragraph, idx) => (
              <p key={idx} className="whitespace-pre-wrap">
                {paragraph.trim()}
              </p>
            ))}
          </div>
        </div>
      ))}
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
