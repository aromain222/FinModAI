"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Home, ArrowLeft, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { ModelPreview } from '@/components/models/ModelPreview';
import { DownloadWorkbookButton } from '@/components/models/DownloadWorkbookButton';
import { ModelResultsShell } from '@/components/models/ModelResultsShell';
import { PreviewForModelType } from '@/components/models/previews/PreviewForModelType';
import { AssumptionsPanel } from '@/components/models/AssumptionsPanel';
import { DiagnosticsPanel } from '@/components/models/DiagnosticsPanel';
import { parseModelOutput } from '@/lib/models/parseModelOutput';
import { extractModelAssumptions } from '@/lib/models/extractAssumptions';
import { downloadWorkbook, type DownloadWorkbookParams } from '@/lib/downloadWorkbook';
import { ModelGenerationTimer } from '@/components/models/ModelGenerationTimer';
import { TickerAutocomplete } from '@/components/tickers/TickerAutocomplete';
import type { TickerResult } from '@/components/tickers/TickerAutocomplete';
import type { GenerateModelResponse } from '@/types/models';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/lib/branding';
import { MissingInputsModal } from '@/components/models/MissingInputsModal';
import { validateModelInputs } from '@/lib/modelInputValidation';
import { MergerInputsPanel } from '@/components/models/MergerInputsPanel';
import { getMissingMergerInputs } from '@/lib/models/merger/schema';
import type { MergerModelInput } from '@/lib/models/merger/schema';
import { OperatingInputsPanel } from '@/components/models/OperatingInputsPanel';
import { getMissingOperatingInputs } from '@/lib/models/operating/schema';
import type { OperatingModelInput } from '@/lib/models/operating/schema';
import { AppliedDefaultsList, AppliedDefaultBadge } from '@/components/models/AppliedDefaultBadge';
import { mapDcfToTearSheet } from '@/lib/models/dcf/mapToTearSheet';
import { TearSheetRenderer } from '@/components/models/results/TearSheetRenderer';

const MODEL_OPTIONS = [
  { value: 'three-statement', label: 'Three Statement Model', description: 'Full P&L, Balance Sheet, Cash Flow' },
  { value: 'dcf', label: 'Discounted Cash Flow (DCF)', description: 'Intrinsic valuation with terminal value' },
  { value: 'lbo', label: 'Leveraged Buyout (LBO)', description: 'Returns analysis with debt paydown' },
  { value: 'comps', label: 'Trading Comps Model', description: 'Peer group valuation multiples' },
  { value: 'merger', label: 'Merger Model', description: 'Combined IS + EPS bridge + accretion/dilution' },
  { value: 'operating', label: 'Operating Model', description: 'Monthly FP&A + cash runway + variance analysis' }
] as const;

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

type ScenarioName = 'bear' | 'base' | 'bull';

type InsightCard = { title: string; body: string };

interface ScenarioInputs {
  revenueGrowth: number;
  ebitdaMargin: number;
  wacc: number;
  terminalGrowth: number;
}

interface ScenarioConfigState {
  includeScenarios: boolean;
  base: ScenarioInputs;
  bull: ScenarioInputs;
  bear: ScenarioInputs;
}

type AdvancedLboFormState = {
  managementRolloverPct: string;
  preferredEquityAmount: string;
  subordinatedNotesAmount: string;
  minimumCashAtClose: string;
};

const createDefaultAdvancedLboState = (): AdvancedLboFormState => ({
  managementRolloverPct: '',
  preferredEquityAmount: '',
  subordinatedNotesAmount: '',
  minimumCashAtClose: '',
});

const SCENARIO_LIMITS: Record<keyof ScenarioInputs, { min: number; max: number }> = {
  revenueGrowth: { min: -20, max: 60 },
  ebitdaMargin: { min: -20, max: 60 },
  wacc: { min: 3, max: 25 },
  terminalGrowth: { min: -2, max: 6 },
};

const SCENARIO_SLIDER_LIMITS = {
  revenueGrowth: { min: -20, max: 60, step: 1 },
  ebitdaMargin: { min: -20, max: 60, step: 1 },
  wacc: { min: 3, max: 25, step: 0.5 },
  terminalGrowth: { min: -2, max: 6, step: 0.25 },
} as const;

const DEFAULT_BASE_SCENARIO: ScenarioInputs = {
  revenueGrowth: 10,
  ebitdaMargin: 25,
  wacc: 10,
  terminalGrowth: 2.5,
};

const clampValue = (value: number, key: keyof ScenarioInputs) =>
  Math.min(SCENARIO_LIMITS[key].max, Math.max(SCENARIO_LIMITS[key].min, value));

const clampScenarioInputs = (inputs: ScenarioInputs): ScenarioInputs => ({
  revenueGrowth: clampValue(inputs.revenueGrowth, 'revenueGrowth'),
  ebitdaMargin: clampValue(inputs.ebitdaMargin, 'ebitdaMargin'),
  wacc: clampValue(inputs.wacc, 'wacc'),
  terminalGrowth: clampValue(inputs.terminalGrowth, 'terminalGrowth'),
});

const buildBullScenario = (base: ScenarioInputs): ScenarioInputs =>
  clampScenarioInputs({
    revenueGrowth: base.revenueGrowth + 2,
    ebitdaMargin: base.ebitdaMargin + 1,
    wacc: base.wacc - 1.5,
    terminalGrowth: base.terminalGrowth + 0.25,
  });

const buildBearScenario = (base: ScenarioInputs): ScenarioInputs =>
  clampScenarioInputs({
    revenueGrowth: base.revenueGrowth - 2,
    ebitdaMargin: base.ebitdaMargin - 1,
    wacc: base.wacc + 1.5,
    terminalGrowth: base.terminalGrowth - 0.25,
  });

const createDefaultScenarioConfig = (): ScenarioConfigState => {
  const base = { ...DEFAULT_BASE_SCENARIO };
  return {
    includeScenarios: true,
    base,
    bull: buildBullScenario(base),
    bear: buildBearScenario(base),
  };
};

const mapScenarioInputsForApi = (inputs: ScenarioInputs) => ({
  revenueGrowthPct: inputs.revenueGrowth,
  ebitdaMarginPct: inputs.ebitdaMargin,
  waccPct: inputs.wacc,
  terminalGrowthPct: inputs.terminalGrowth,
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

const SCENARIO_SLIDER_CONFIGS: ScenarioSliderConfig[] = [
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

// Extended response type that includes OpenAI-enriched assumptions
type EnrichedModelResponse = GenerateModelResponse & {
  assumptions?: any; // ThreeStatementAssumptions (unified for all model types)
  summaryText?: string; // AI-generated summary of the base case
};
const EMPTY_PREVIEW = { sheetName: '', columns: [] as string[], rows: [] as (string | number | null)[][] };

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


export default function CreateModelPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType = useMemo(() => {
    const param = searchParams.get('type');
    return MODEL_OPTIONS.some((option) => option.value === param) ? (param as ModelType) : 'dcf';
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
  const [companyName, setCompanyName] = useState<string | null>(null);
  
  // Scenario configuration
  const [scenarioConfig, setScenarioConfig] = useState<ScenarioConfigState>(() => createDefaultScenarioConfig());
  const [activeScenarioTab, setActiveScenarioTab] = useState<ScenarioName>('base');
  const [scenarioLocked, setScenarioLocked] = useState(false);
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
  const scenarioControlsDisabled = scenarioLocked || loading;
  const [lastRequestBody, setLastRequestBody] = useState<Record<string, any> | null>(null);
  const aiSummaryText = normalizeNarrativeText(modelData?.summary);
  const aiKeyAssumptions = Array.isArray(modelData?.keyAssumptions) ? modelData.keyAssumptions : [];
  const hasAiSummaryCard = Boolean(aiSummaryText) || aiKeyAssumptions.length > 0;
  
  // Required inputs validation
  const [missingInputsModalOpen, setMissingInputsModalOpen] = useState(false);
  const [missingInputs, setMissingInputs] = useState<string[]>([]);
  
  // LBO required inputs state
  const [lboRequiredInputs, setLboRequiredInputs] = useState({
    entryMultiple: '',
    exitEBITDAMultiple: '',
    offerPremium: '30',
    exitYear: '5',
    leverageMultiple: '4.5',
    termLoanBRate: '6.5',
    revolverRate: '5.0',
    transactionFeesPercent: '2.0',
    financingFeesPercent: '3.0',
    minimumCashBalance: '50',
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

  const scenarioFeatureEnabled = modelType === 'dcf' || modelType === 'lbo';

  useEffect(() => {
    setScenarioLocked(false);
  }, [modelType]);

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

  const parseAdvancedNumber = (value: string): number | undefined => {
    if (value === undefined || value === null) return undefined;
    const trimmed = value.toString().trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
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
    }

    // Validate required inputs before generation
    if (modelType === 'lbo') {
      const validation = validateModelInputs('lbo', {
        entryMultiple: lboRequiredInputs.entryMultiple ? parseFloat(lboRequiredInputs.entryMultiple) : undefined,
        exitEBITDAMultiple: lboRequiredInputs.exitEBITDAMultiple ? parseFloat(lboRequiredInputs.exitEBITDAMultiple) : undefined,
        offerPremium: lboRequiredInputs.offerPremium ? parseFloat(lboRequiredInputs.offerPremium) / 100 : undefined,
        exitYear: lboRequiredInputs.exitYear ? parseFloat(lboRequiredInputs.exitYear) : undefined,
        leverageMultiple: lboRequiredInputs.leverageMultiple ? parseFloat(lboRequiredInputs.leverageMultiple) : undefined,
        termLoanBRate: lboRequiredInputs.termLoanBRate ? parseFloat(lboRequiredInputs.termLoanBRate) / 100 : undefined,
        revolverRate: lboRequiredInputs.revolverRate ? parseFloat(lboRequiredInputs.revolverRate) / 100 : undefined,
        transactionFeesPercent: lboRequiredInputs.transactionFeesPercent ? parseFloat(lboRequiredInputs.transactionFeesPercent) / 100 : undefined,
        financingFeesPercent: lboRequiredInputs.financingFeesPercent ? parseFloat(lboRequiredInputs.financingFeesPercent) / 100 : undefined,
        minimumCashBalance: lboRequiredInputs.minimumCashBalance ? parseFloat(lboRequiredInputs.minimumCashBalance) : undefined,
      });
      
      if (!validation.isValid) {
        setMissingInputs(validation.missingRequired);
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

    const includeScenarioFlag = scenarioFeatureEnabled ? scenarioConfig.includeScenarios : false;
    const baseScenario = scenarioConfig.base;
    const scenarioInputsPayload = scenarioFeatureEnabled
      ? {
          base: mapScenarioInputsForApi(scenarioConfig.base),
          ...(includeScenarioFlag
            ? {
                bull: mapScenarioInputsForApi(scenarioConfig.bull),
                bear: mapScenarioInputsForApi(scenarioConfig.bear),
              }
            : {}),
        }
      : undefined;
    const scenarioNoteText = includeScenarioFlag
      ? `Base case: ${baseScenario.revenueGrowth}% revenue growth, ${baseScenario.ebitdaMargin}% EBITDA margin, ${baseScenario.wacc}% WACC, ${baseScenario.terminalGrowth}% terminal growth`
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
      const requestBody: Record<string, any> = {
        ticker: trimmedTicker,
        modelType,
        includeScenarios: includeScenarioFlag || undefined,
        wacc: scenarioFeatureEnabled ? baseScenario.wacc / 100 : undefined,
        terminalGrowth: scenarioFeatureEnabled ? baseScenario.terminalGrowth / 100 : undefined,
        sliderOverrides: scenarioFeatureEnabled
          ? {
              revenueGrowth: baseScenario.revenueGrowth / 100,
              ebitdaMargin: baseScenario.ebitdaMargin / 100,
              wacc: baseScenario.wacc / 100,
              terminalGrowth: baseScenario.terminalGrowth / 100,
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
        lboOverrides: modelType === 'lbo' ? {
          entryMultiple: lboRequiredInputs.entryMultiple ? parseFloat(lboRequiredInputs.entryMultiple) : undefined,
          exitMultiple: lboRequiredInputs.exitEBITDAMultiple ? parseFloat(lboRequiredInputs.exitEBITDAMultiple) : undefined,
          offerPremium: lboRequiredInputs.offerPremium ? parseFloat(lboRequiredInputs.offerPremium) / 100 : undefined,
          leverageMultiple: lboRequiredInputs.leverageMultiple ? parseFloat(lboRequiredInputs.leverageMultiple) : undefined,
          termLoanBRate: lboRequiredInputs.termLoanBRate ? parseFloat(lboRequiredInputs.termLoanBRate) / 100 : undefined,
          revolverRate: lboRequiredInputs.revolverRate ? parseFloat(lboRequiredInputs.revolverRate) / 100 : undefined,
          transactionFeesPercent: lboRequiredInputs.transactionFeesPercent ? parseFloat(lboRequiredInputs.transactionFeesPercent) / 100 : undefined,
          financingFeesPercent: lboRequiredInputs.financingFeesPercent ? parseFloat(lboRequiredInputs.financingFeesPercent) / 100 : undefined,
          minimumCash: lboRequiredInputs.minimumCashBalance ? parseFloat(lboRequiredInputs.minimumCashBalance) : undefined,
          exitYear: lboRequiredInputs.exitYear ? parseFloat(lboRequiredInputs.exitYear) : undefined,
        } : undefined,
        mergerInputs: modelType === 'merger' ? mergerInputs : undefined,
        operatingInputs: modelType === 'operating' ? operatingInputs : undefined,
      };
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
          anchor.download = `Merger_Model_${mergerInputs.buyerTicker}_${mergerInputs.targetTicker}.xlsx`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(url);
        }
        
        // Set generated model
        const resolvedModel: EnrichedModelResponse = {
          modelId: mergerData.modelId || `merger-${Date.now()}`,
          ticker: mergerData.ticker || `${mergerInputs.buyerTicker}/${mergerInputs.targetTicker}`,
          modelType: 'merger',
          createdAt: new Date().toISOString(),
          downloadUrl: '',
          preview: mergerData.preview || EMPTY_PREVIEW,
          summaryText: mergerData.report?.sections?.[0]?.body || `Merger model generated for ${mergerInputs.buyerTicker}/${mergerInputs.targetTicker}`,
        };
        setGeneratedModel(resolvedModel);
        setShowResults(true);
        if (scenarioFeatureEnabled) {
          setScenarioLocked(true);
        }
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
          anchor.download = `Operating_Model_${operatingInputs.startMonth || 'model'}.xlsx`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(url);
        }
        
        // Set generated model
        const resolvedModel: EnrichedModelResponse = {
          modelId: operatingData.modelId || `operating-${Date.now()}`,
          ticker: operatingData.ticker || `Operating Model - ${operatingInputs.startMonth}`,
          modelType: 'operating',
          createdAt: new Date().toISOString(),
          downloadUrl: '',
          preview: operatingData.preview || EMPTY_PREVIEW,
          summaryText: operatingData.report?.sections?.[0]?.body || `Operating model generated for ${operatingInputs.startMonth}`,
        };
        setGeneratedModel(resolvedModel);
        setShowResults(true);
        if (scenarioFeatureEnabled) {
          setScenarioLocked(true);
        }
        const clientDuration = Math.max(
          0,
          Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - runStart)
        );
        setLastDurationMs(clientDuration);
        return;
      }
      
      // For standard models (DCF, LBO, 3-Statement, Comps), use generateModel API
      const generateResponse = await fetch('/api/generateModel', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json', // Request JSON to get appliedDefaults
        },
        body: JSON.stringify(requestBody),
      });
      
      if (!generateResponse.ok) {
        const errorData = await generateResponse.json().catch(() => ({}));
        if (errorData.blocks && errorData.blocks.length > 0) {
          setBlocks(errorData.blocks);
          setWarnings(errorData.warnings || []);
          setError(`Model generation blocked: ${errorData.blocks.join('; ')}`);
          return;
        }
        throw new Error(errorData.error || 'Failed to generate model');
      }
      
      const generateData = await generateResponse.json();
      
      // Debug logging in dev
      if (process.env.NODE_ENV === 'development') {
        console.log('[DCF UI RAW RESULT]', generateData);
      }
      
      // Store applied defaults and warnings
      setAppliedDefaults(generateData.appliedDefaults || []);
      setWarnings(generateData.warnings || []);
      setBlocks(generateData.blocks || []);
      
      // Download Excel (separate call for binary)
      await downloadWorkbook(requestBody as DownloadWorkbookParams);

      const resolvedModel: EnrichedModelResponse = {
        modelId: `local-${Date.now()}`,
        ticker: modelType === 'merger' 
          ? `${mergerInputs.buyerTicker}/${mergerInputs.targetTicker}`
          : modelType === 'operating'
          ? `Operating Model - ${operatingInputs.startMonth}`
          : trimmedTicker,
        modelType,
        createdAt: new Date().toISOString(),
        downloadUrl: '',
        preview: generateData.preview || EMPTY_PREVIEW,
        summaryText:
          normalizeNarrativeText(latestAnalysisData?.summary) ??
          normalizeNarrativeText(modelData?.summary) ??
          `Excel model generated for ${
            modelType === 'merger' 
              ? `${mergerInputs.buyerTicker}/${mergerInputs.targetTicker}`
              : modelType === 'operating'
              ? `Operating Model - ${operatingInputs.startMonth}`
              : trimmedTicker
          }`,
        // Store model-specific summaries for preview parsing
        dcfSummary: generateData.dcfSummary,
        lboSummary: generateData.lboSummary,
        assumptions: generateData.assumptions,
      } as any;
      setGeneratedModel(resolvedModel);
      setShowResults(true);
      if (scenarioFeatureEnabled) {
        setScenarioLocked(true);
      }
      const clientDuration = Math.max(
        0,
        Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - runStart)
      );
      setLastDurationMs(clientDuration);
      if (modelType !== 'merger' && modelType !== 'operating') {
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

  const resetForm = () => {
    setTicker('');
    setModelData(null);
    setGeneratedModel(null);
    setShowResults(false);
    setError(null);
    setLastDurationMs(undefined);
    setTimerStats(undefined);
    setScenarioConfig(createDefaultScenarioConfig());
    setScenarioLocked(false);
    setActiveScenarioTab('base');
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
    setMergerInputs({});
    setMergerInputsValid(false);
    setOperatingInputs({});
    setOperatingInputsValid(false);
    setAppliedDefaults([]);
    setWarnings([]);
    setBlocks([]);
  };

  const updateBaseScenario = useCallback(
    (field: keyof ScenarioInputs, value: number) => {
      setScenarioConfig((prev) => {
        const nextBase = clampScenarioInputs({ ...prev.base, [field]: value });
        return {
          ...prev,
          base: nextBase,
          bull: buildBullScenario(nextBase),
          bear: buildBearScenario(nextBase),
        };
      });
    },
    []
  );

  const handleScenarioToggle = (checked: boolean) => {
    setScenarioConfig((prev) => ({ ...prev, includeScenarios: checked }));
  };

  const handleScenarioReset = () => {
    setScenarioConfig(createDefaultScenarioConfig());
    setScenarioLocked(false);
    setActiveScenarioTab('base');
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

    const normalizedModelKind: ModelKind =
      modelType === 'three-statement' ? 'three_statement' : (modelType as ModelKind);

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

    const lboEntryMultiple = generatedModel.lboSummary?.entry?.entryMultiple;
    const lboExitMultiple = generatedModel.lboSummary?.exit?.exitMultiple;
    const sponsorEquity = generatedModel.lboSummary?.entry?.equityContribution;

    const baseIRR = generatedModel.lboSummary?.exit?.irr ? generatedModel.lboSummary.exit.irr * 100 : undefined;
    const baseMOIC = generatedModel.lboSummary?.exit?.moic;

    const scenarioBullets = scenarioFeatureEnabled
      ? [
          `Base sliders: ${scenarioConfig.base.revenueGrowth.toFixed(1)}% growth / ${scenarioConfig.base.ebitdaMargin.toFixed(
            1
          )}% EBITDA margin.`,
          `Discount rate ${scenarioConfig.base.wacc.toFixed(1)}% with ${scenarioConfig.base.terminalGrowth.toFixed(
            1
          )}% terminal growth.`,
        ]
      : undefined;

    const diagnosticsBullets =
      generatedModel.diagnostics?.slice(0, 3).map((diag) => `${diag.title ?? 'Issue'}: ${diag.message}`) ?? [];

    const contextOverrides: Partial<ReportContext> = {
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
              onSubmit={handleSubmit}
              className="space-y-6 rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-6 shadow-sm"
            >
            {/* Model Type Selection */}
            <div className="space-y-3">
              <Label htmlFor="model-type">Model Type</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {MODEL_OPTIONS.map((option) => (
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
              <Label htmlFor="ticker">Ticker Symbol</Label>
              <div className="flex gap-2">
                <Input
                  id="ticker"
                  name="ticker"
                  placeholder="Enter ticker (e.g., MSFT, AAPL)"
                  value={ticker}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => setTicker(event.target.value.toUpperCase())}
                  className="text-lg flex-1"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTicker('AAPL');
                      // Optionally set demo values for shares/base revenue if needed
                    }}
                    className="text-xs"
                  >
                    Load AAPL
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTicker('MSFT');
                      // Optionally set demo values for shares/base revenue if needed
                    }}
                    className="text-xs"
                  >
                    Load MSFT
                  </Button>
                </div>
              </div>
              <p className="text-xs text-[var(--cb-text-muted)]">
                Or use demo presets above to quickly load example companies
              </p>
            </div>

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
                          checked={scenarioConfig.includeScenarios}
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
                      Base-case sliders control the entire valuation sandbox. Bull and Bear cases follow the mandatory
                      +200 bps / –200 bps growth deltas and ±100 bps EBITDA spreads automatically.
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
                        onClick={() => setActiveScenarioTab(scenario)}
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
                    {SCENARIO_SLIDER_CONFIGS.map((config) => {
                      const Icon = config.icon;
                      const sliderValue = scenarioConfig[activeScenarioTab][config.key];
                      const disabled = scenarioControlsDisabled || activeScenarioTab !== 'base';
                      const clampedValue = Math.min(config.max, Math.max(config.min, sliderValue));
                      
                      // Map config.key to appliedDefaults path
                      const defaultPathMap: Record<string, string> = {
                        'wacc': 'wacc',
                        'terminalGrowth': 'terminalGrowth',
                        'revenueGrowth': 'revenueGrowth',
                        'ebitdaMargin': 'ebitdaMargin',
                      };
                      const defaultPath = defaultPathMap[config.key];
                      const appliedDefault = defaultPath 
                        ? appliedDefaults.find(d => d.path === defaultPath)
                        : undefined;

                      return (
                        <div key={config.key} className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <Label className="flex items-center gap-2 flex-1 min-w-0">
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

            {modelType === 'lbo' && (
              <>
                <Card className="border-[var(--cb-green)]/30">
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Required Deal Inputs <span className="text-[var(--cb-danger)]">*</span>
                    </CardTitle>
                    <CardDescription>
                      These inputs must be completed before generating the LBO model. No silent defaults will be used.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="lbo-entry-multiple">
                        Entry EBITDA Multiple <span className="text-[var(--cb-danger)]">*</span>
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
                      <p className="text-xs text-[var(--cb-text-muted)]">Purchase price multiple of LTM EBITDA</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-exit-multiple">
                        Exit EBITDA Multiple <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-exit-multiple"
                        type="number"
                        min={0}
                        step={0.1}
                        value={lboRequiredInputs.exitEBITDAMultiple}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, exitEBITDAMultiple: e.target.value }))}
                        placeholder="12.0"
                        required
                      />
                      <p className="text-xs text-[var(--cb-text-muted)]">Expected exit multiple of exit year EBITDA</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-offer-premium">
                        Offer Premium (%) <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-offer-premium"
                        type="number"
                        min={0}
                        step={0.5}
                        value={lboRequiredInputs.offerPremium}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, offerPremium: e.target.value }))}
                        placeholder="30"
                        required
                      />
                      <p className="text-xs text-[var(--cb-text-muted)]">Premium over current stock price</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-exit-year">
                        Hold Period (years) <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-exit-year"
                        type="number"
                        min={1}
                        max={10}
                        step={0.5}
                        value={lboRequiredInputs.exitYear}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, exitYear: e.target.value }))}
                        placeholder="5"
                        required
                      />
                      <p className="text-xs text-[var(--cb-text-muted)]">Years from close to exit</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-leverage">
                        Target Leverage (Debt/EBITDA) <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-leverage"
                        type="number"
                        min={0}
                        step={0.1}
                        value={lboRequiredInputs.leverageMultiple}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, leverageMultiple: e.target.value }))}
                        placeholder="4.5"
                        required
                      />
                      <p className="text-xs text-[var(--cb-text-muted)]">Total debt to LTM EBITDA ratio</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-tlb-rate">
                        Term Loan B Rate (%) <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-tlb-rate"
                        type="number"
                        min={0}
                        max={20}
                        step={0.1}
                        value={lboRequiredInputs.termLoanBRate}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, termLoanBRate: e.target.value }))}
                        placeholder="6.5"
                        required
                      />
                      <p className="text-xs text-[var(--cb-text-muted)]">Annual interest rate for Term Loan B</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-revolver-rate">
                        Revolver Rate (%) <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-revolver-rate"
                        type="number"
                        min={0}
                        max={20}
                        step={0.1}
                        value={lboRequiredInputs.revolverRate}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, revolverRate: e.target.value }))}
                        placeholder="5.0"
                        required
                      />
                      <p className="text-xs text-[var(--cb-text-muted)]">Annual interest rate for revolver</p>
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
                        placeholder="2.0"
                        required
                      />
                      <p className="text-xs text-[var(--cb-text-muted)]">% of purchase price for transaction fees</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-financing-fees">
                        Financing Fees (%) <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-financing-fees"
                        type="number"
                        min={0}
                        max={10}
                        step={0.1}
                        value={lboRequiredInputs.financingFeesPercent}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, financingFeesPercent: e.target.value }))}
                        placeholder="3.0"
                        required
                      />
                      <p className="text-xs text-[var(--cb-text-muted)]">% of debt raised for financing fees</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lbo-min-cash">
                        Minimum Cash Balance ($MM) <span className="text-[var(--cb-danger)]">*</span>
                      </Label>
                      <Input
                        id="lbo-min-cash"
                        type="number"
                        min={0}
                        step={0.1}
                        value={lboRequiredInputs.minimumCashBalance}
                        onChange={(e) => setLboRequiredInputs(prev => ({ ...prev, minimumCashBalance: e.target.value }))}
                        placeholder="50"
                        required
                      />
                      <p className="text-xs text-[var(--cb-text-muted)]">Minimum cash to maintain on balance sheet</p>
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
                         (modelType === 'operating' && !operatingInputsValid)} 
                className="flex-1"
              >
                {loading ? 'Generating Model...' : 'Generate Model'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push('/app')}>
                Cancel
              </Button>
            </div>
          </form>
          
          <MissingInputsModal
            isOpen={missingInputsModalOpen}
            onClose={() => setMissingInputsModalOpen(false)}
            missingInputs={missingInputs}
            modelType={modelType}
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
              // Build data object for parsing (include dcfSummary, lboSummary, etc.)
              // For DCF, we need to get the dcfSummary from the API response
              // The dcfSummary should be at generatedModel.dcfSummary
              // IMPORTANT: Pass the object that contains dcfSummary at the top level
              const modelDataForParsing = {
                dcfSummary: (generatedModel as any).dcfSummary || generatedModel.dcfSummary,
                lboSummary: generatedModel.lboSummary,
                assumptions: generatedModel.assumptions,
                compsModel: (generatedModel as any).assumptions?.compsModel,
                mergerModel: (generatedModel as any).mergerModel,
                operatingModel: (generatedModel as any).operatingModel,
              };
              
              // Debug logging (dev only) - verify dcfSummary structure
              if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && generatedModel.modelType === 'dcf') {
                console.log('[MODEL CREATE] modelDataForParsing:', modelDataForParsing);
                console.log('[MODEL CREATE] modelDataForParsing.dcfSummary:', modelDataForParsing.dcfSummary);
                console.log('[MODEL CREATE] dcfSummary.valuation:', modelDataForParsing.dcfSummary?.valuation);
                console.log('[MODEL CREATE] dcfSummary.results:', modelDataForParsing.dcfSummary?.results);
                console.log('[MODEL CREATE] dcfSummary.assumptions:', modelDataForParsing.dcfSummary?.assumptions);
              }
              
              // Parse model output
              const modelOutput = parseModelOutput(generatedModel.modelType, modelDataForParsing);
              
              // Extract assumptions
              const modelAssumptions = extractModelAssumptions(
                generatedModel.modelType,
                modelDataForParsing,
                appliedDefaults
              );
              
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
              
              // Handle download via downloadWorkbook function
              const handleDownload = async () => {
                if (lastRequestBody) {
                  await downloadWorkbook({
                    ticker: generatedModel.ticker,
                    modelType: generatedModel.modelType,
                    ...lastRequestBody,
                  } as DownloadWorkbookParams);
                }
              };
              
              // Use new tear sheet system for DCF, fallback to old system for others
              if (generatedModel.modelType === 'dcf' && modelOutput && modelOutput.type === 'dcf') {
                const tearSheet = mapDcfToTearSheet(
                  modelOutput.data,
                  {
                    ticker: generatedModel.ticker,
                    createdAt: generatedModel.createdAt,
                    ...modelDataForParsing,
                  },
                  {
                    coverage: Object.entries(dataCompleteness).map(([key, status]) => ({
                      label: key,
                      status: status as 'available' | 'partial' | 'unavailable',
                    })),
                    defaults: appliedDefaults,
                    warnings: warnings,
                  }
                );
                
                return (
                  <TearSheetRenderer
                    tearSheet={tearSheet}
                    actions={{
                      onDownload: lastRequestBody ? handleDownload : undefined,
                      onEditInputs: () => {
                        setShowResults(false);
                        setGeneratedModel(null);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      },
                      onRunAgain: resetForm,
                    }}
                  />
                );
              }
              
              // Fallback to old system for other models (will be migrated)
              return (
                <ModelResultsShell
                  ticker={generatedModel.ticker}
                  modelName={modelName}
                  generatedAt={generatedModel.createdAt}
                  status={blocks.length > 0 ? 'failed' : 'success'}
                  onDownload={lastRequestBody ? handleDownload : undefined}
                  onRunAgain={resetForm}
                  preview={
                    modelOutput ? (
                      <PreviewForModelType
                        modelType={modelOutput.type}
                        output={modelOutput.data}
                        ticker={generatedModel.ticker}
                        onEditAssumptions={generatedModel.modelType === 'dcf' ? () => {
                          setShowResults(false);
                          setGeneratedModel(null);
                          // Scroll to top of form
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        } : undefined}
                        rawOutput={generatedModel.modelType === 'dcf' ? modelDataForParsing : undefined}
                      />
                    ) : (
                      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
                        <CardContent className="p-6 text-center text-sm text-[var(--cb-text-muted)]">
                          Preview parsing failed. Download the Excel file to view results.
                        </CardContent>
                      </Card>
                    )
                  }
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
