"use client";

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Home, ArrowLeft, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import type { LboAdvancedOptions } from '@/types/lbo';
import { extractModelAssumptions } from '@/lib/models/extractAssumptions';
import { downloadWorkbook, type DownloadWorkbookParams } from '@/lib/downloadWorkbook';
import { ModelGenerationTimer } from '@/components/models/ModelGenerationTimer';
import { TickerAutocomplete } from '@/components/tickers/TickerAutocomplete';
import type { TickerResult } from '@/components/tickers/TickerAutocomplete';
import type { GenerateModelResponse } from '@/types/models';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/lib/branding';
import { type MissingInputSpec } from '@/lib/models/shared/missingInputSpecs';
import { buildRequiredInputsForModel } from '@/lib/models/shared/requiredInputs';
import { validateModelInputs } from '@/lib/modelInputValidation';
import { getMissingMergerInputs } from '@/lib/models/merger/schema';
import type { MergerModelInput } from '@/lib/models/merger/schema';
import { getMissingOperatingInputs } from '@/lib/models/operating/schema';
import type { OperatingModelInput } from '@/lib/models/operating/schema';
import { AppliedDefaultBadge } from '@/components/models/AppliedDefaultBadge';
import {
  ModelAssumptionsProvider,
  useModelAssumptions,
  type ScenarioInputs,
  type ScenarioName,
} from '@/lib/modelAssumptionsStore';
import { isDemoMode } from '@/lib/demo/isDemoMode';
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
import { trackEvent } from '@/lib/trackEvent';
import type { ModelDocument, TableBlock } from '@/lib/models/schema/ModelDocument';
import type {
  FinancialExtractionLane,
  FinancialExtractionPeriodType,
  FinancialValidationState,
  ValidatedFinancialSnapshot,
} from '@/lib/data/financial-extraction/types';
import type {
  EventLinkedModelAdjustmentResult,
  EventLinkedModelEventSource,
} from '@/lib/model-events/types';
import type { SmartAssumptionResult } from '@/lib/smart-assumptions/types';
import type { AppExecutionTrace } from '@/lib/debug/executionTrace';

const DownloadWorkbookButton = dynamic(
  () => import('@/components/models/DownloadWorkbookButton').then((mod) => mod.DownloadWorkbookButton)
);
const ModelResultsShell = dynamic(
  () => import('@/components/models/ModelResultsShell').then((mod) => mod.ModelResultsShell)
);
const AssumptionsPanel = dynamic(
  () => import('@/components/models/AssumptionsPanel').then((mod) => mod.AssumptionsPanel)
);
const MissingInputsModal = dynamic(
  () => import('@/components/models/MissingInputsModal').then((mod) => mod.MissingInputsModal)
);
const MergerInputsPanel = dynamic(
  () => import('@/components/models/MergerInputsPanel').then((mod) => mod.MergerInputsPanel)
);
const FootballFieldRangeChart = dynamic(
  () => import('@/components/models/FootballFieldRangeChart').then((mod) => mod.FootballFieldRangeChart)
);
const FootballFieldReviewCard = dynamic(
  () => import('@/components/models/FootballFieldReviewCard').then((mod) => mod.FootballFieldReviewCard)
);
const OperatingInputsPanel = dynamic(
  () => import('@/components/models/OperatingInputsPanel').then((mod) => mod.OperatingInputsPanel)
);
const CompsPeerTableCard = dynamic(
  () => import('@/components/models/CompsPeerTableCard').then((mod) => mod.CompsPeerTableCard)
);
const AppliedDefaultsList = dynamic(
  () => import('@/components/models/AppliedDefaultBadge').then((mod) => mod.AppliedDefaultsList)
);
const ModelPreviewRenderer = dynamic(
  () => import('@/components/models/ModelPreviewRenderer').then((mod) => mod.ModelPreviewRenderer)
);
const LoadingPanel = dynamic(
  () => import('@/components/loading').then((mod) => mod.LoadingPanel)
);
const ReportMarkdown = dynamic(
  () => import('./CreateModelPageReportParts').then((mod) => mod.ReportMarkdown)
);
const InsightCardsGrid = dynamic(
  () => import('./CreateModelPageReportParts').then((mod) => mod.InsightCardsGrid)
);

const MODEL_OPTIONS = [
  { value: 'three-statement', label: 'Forecast Model', description: 'Revenue, margin, cash flow, and balance sheet projection' },
  { value: 'dcf', label: 'Discounted Cash Flow (DCF)', description: 'Intrinsic valuation with terminal value' },
  { value: 'reverse-dcf', label: 'Reverse DCF (Demo)', description: 'Solve implied growth from price and DCF assumptions' },
  { value: 'debt-capacity-lite', label: 'Debt Capacity / Credit Stats', description: 'Leverage and coverage-based debt sizing' },
  { value: 'comps', label: 'Trading Comparables', description: 'Subject versus peer valuation framing' },
  { value: 'football-field', label: 'Football Field Valuation', description: 'Range bridge across trading and transaction methods' },
  { value: 'precedents', label: 'Precedent Transactions', description: 'Control-value range from comparable deal comps' },
  { value: 'scorecard', label: 'Fundamentals Scorecard', description: 'Deterministic ratio scorecard with sector context' },
  // Merger and Operating remain hidden from UI
  { value: 'lbo', label: 'LBO Underwriting', description: 'Sponsor returns analysis with debt paydown' },
  { value: 'merger', label: 'Merger / Accretion Dilution', description: 'Combined IS + EPS bridge + accretion / dilution' },
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
    o.value === 'football-field' ||
    o.value === 'precedents' ||
    o.value === 'scorecard' ||
    o.value === 'lbo'
);

const MODEL_WORKFLOW_NOTES: Partial<
  Record<
    ModelType,
    {
      decisionQuestion: string;
      primaryDrivers: string[];
      outputPackage: string[];
    }
  >
> = {
  comps: {
    decisionQuestion: 'Where should the subject trade versus the peer set once growth, margin, and scale are normalized?',
    primaryDrivers: ['Peer set quality', 'Selected trading multiples', 'Price anchor and share count'],
    outputPackage: ['Valuation summary', 'Peer table', 'Premium / discount view', 'Checks and equations'],
  },
  'football-field': {
    decisionQuestion: 'What valuation range can you defend in a pitch or fairness-style discussion once market and transaction methods are laid out side by side?',
    primaryDrivers: ['Subject revenue and EBITDA anchors', 'Peer trading ranges', 'Equity bridge from EV to price per share'],
    outputPackage: ['Valuation summary', 'Football field range view', 'Equations tab', 'Checks tab'],
  },
  precedents: {
    decisionQuestion: 'What control-value range does the relevant deal set support for the subject today?',
    primaryDrivers: ['Relevant transactions', 'Median vs outlier multiples', 'Control premium dispersion'],
    outputPackage: ['Transaction summary', 'Selected deal table', 'Control-value range', 'Checks and equations'],
  },
  lbo: {
    decisionQuestion: 'Can a sponsor underwrite the deal to an acceptable IRR and MOIC under realistic leverage and exit assumptions?',
    primaryDrivers: ['Entry multiple', 'Leverage and financing mix', 'Operating case and exit multiple'],
    outputPackage: ['Underwriting summary', 'Sources & uses', 'Debt schedule', 'Returns and sensitivities'],
  },
};

const REPORTS_ENABLED = false;

type ModelType = (typeof MODEL_OPTIONS)[number]['value'];
type CompanyMode = 'public' | 'private';
type PrivateInputSource = 'manual' | 'extraction';
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
  precedents: ['companyName', 'revenue', 'ebitda'],
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

type FinancialExtractionJobSummary = {
  jobId: string;
  lane: FinancialExtractionLane;
  stage: string;
  validationState: FinancialValidationState | null;
  snapshot: ValidatedFinancialSnapshot | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type UploadedFinancialExtractionFile = {
  fileId: string;
  fileName: string;
  contentType: string;
  size: number;
};

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
  isComputable?: boolean;
  exportEligibility?: GenerateModelResponse['exportEligibility'];
  dataRefreshStatus?: GenerateModelResponse['dataRefreshStatus'];
  executionTrace?: AppExecutionTrace;
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

const extractShortTakeaway = (value: unknown): string | null => {
  const normalized = normalizeNarrativeText(value);
  if (!normalized) return null;
  const compact = normalized.replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  const firstSentenceMatch = compact.match(/.+?[.!?](?:\s|$)/);
  const firstSentence = firstSentenceMatch?.[0]?.trim() ?? compact;
  const trimmed = firstSentence.length > 220 ? `${firstSentence.slice(0, 217).trimEnd()}...` : firstSentence;
  return trimmed;
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

function getPrimaryPreviewTable(doc: ModelDocument | null | undefined): TableBlock | null {
  if (!doc) return null;
  for (const section of doc.sections) {
    const table = section.blocks.find((block): block is TableBlock => block.type === 'table');
    if (table) return table;
  }
  return null;
}

function getPreviewMetricValue(
  doc: ModelDocument | null | undefined,
  matcher: RegExp
): string | number | null {
  const table = getPrimaryPreviewTable(doc);
  if (!table) return null;

  const row = table.rows.find((candidate) => {
    const label = typeof candidate.labelCell === 'string' ? candidate.labelCell : '';
    return matcher.test(label);
  });
  if (!row) return null;

  const entries = Object.values(row.cells);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const cell = entries[index];
    if (cell?.display !== undefined && cell.display !== null && cell.display !== '') return cell.display;
    if (cell?.value !== undefined && cell.value !== null && cell.value !== '') return cell.value;
  }

  return null;
}

function formatResultMetric(
  value: string | number | null | undefined,
  kind: 'money' | 'percent' | 'multiple' | 'text' = 'text'
): string {
  if (value === null || value === undefined || value === '') return 'N/A';
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return 'N/A';

  if (kind === 'money') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (kind === 'percent') {
    return `${(Math.abs(value) <= 1 ? value * 100 : value).toFixed(1)}%`;
  }
  if (kind === 'multiple') {
    return `${value.toFixed(2)}x`;
  }
  return value.toLocaleString('en-US');
}

function extractionTargetPeriodForModel(modelType: ModelType): FinancialExtractionPeriodType {
  return modelType === 'three-statement' ? 'annual' : 'ltm';
}

function formatExtractionValidationState(value: FinancialValidationState | null | undefined): string {
  if (!value) return 'Not validated';
  if (value === 'blocking_error') return 'Blocked';
  if (value === 'warning') return 'Warnings';
  return 'Ready';
}

function flattenEventTranscriptionImpacts(
  transcription: EventLinkedModelAdjustmentResult['transcription'] | null | undefined
) {
  if (!transcription) return [];
  return [
    ...transcription.suggestedImpacts.business,
    ...transcription.suggestedImpacts.market,
    ...transcription.suggestedImpacts.model,
  ];
}

function formatSuggestedAssumptionDirection(direction: 'up' | 'down' | 'flat'): string {
  if (direction === 'up') return '↑';
  if (direction === 'down') return '↓';
  return '→';
}


function CreateModelPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showExecutionTrace = searchParams.get('trace') === '1';
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
  const [usePublicFinancialExtraction, setUsePublicFinancialExtraction] = useState(false);
  const [privateInputSource, setPrivateInputSource] = useState<PrivateInputSource>('manual');
  type DemoCompany = { ticker: string; company_name: string | null; sector: string | null };
  const [demoCompanies, setDemoCompanies] = useState<DemoCompany[]>([]);
  const [demoUniverseSource, setDemoUniverseSource] = useState<
    'company_cache' | 'demo_company_snapshots' | 'curated_demo_universe' | 'unknown'
  >('unknown');
  const [demoUniverseCount, setDemoUniverseCount] = useState(0);
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
  const [financialExtractionJobs, setFinancialExtractionJobs] = useState<FinancialExtractionJobSummary[]>([]);
  const [selectedFinancialExtractionJobId, setSelectedFinancialExtractionJobId] = useState('');
  const [financialExtractionLoading, setFinancialExtractionLoading] = useState(false);
  const [financialExtractionBusy, setFinancialExtractionBusy] = useState(false);
  const [financialExtractionError, setFinancialExtractionError] = useState<string | null>(null);
  const [uploadedExtractionFiles, setUploadedExtractionFiles] = useState<UploadedFinancialExtractionFile[]>([]);
  const [eventSourceType, setEventSourceType] = useState<EventLinkedModelEventSource['sourceType']>('pasted_text');
  const [eventId, setEventId] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventText, setEventText] = useState('');
  const [eventSourceUrl, setEventSourceUrl] = useState('');
  const [eventSourceLabel, setEventSourceLabel] = useState('');
  const [eventPublishedAt, setEventPublishedAt] = useState('');
  const [eventAdjustmentReview, setEventAdjustmentReview] = useState<EventLinkedModelAdjustmentResult | null>(null);
  const [appliedEventAdjustment, setAppliedEventAdjustment] = useState<EventLinkedModelAdjustmentResult | null>(null);
  const [eventAdjustmentLoading, setEventAdjustmentLoading] = useState(false);
  const [eventAdjustmentError, setEventAdjustmentError] = useState<string | null>(null);
  const [appliedSmartAssumptionSummary, setAppliedSmartAssumptionSummary] = useState<SmartAssumptionResult | null>(null);
  const [smartAssumptionLoading, setSmartAssumptionLoading] = useState(false);
  const [smartAssumptionError, setSmartAssumptionError] = useState<string | null>(null);

  useEffect(() => {
    if (!demoDataActive) return;
    setDemoFetched(false);
    setDemoLoadError(false);
    let active = true;
    // Prefer the full demo universe used by automated models;
    // fall back to the market-brief companies API if needed.
    const loadDemoUniverse = async () => {
      try {
        const res = await fetch('/api/demo/tickers?demo=true');
        if (!res.ok) throw new Error('demo tickers failed');
        const data = await res.json();
        if (!active) return;
        const list = Array.isArray(data?.companies) ? data.companies : [];
        setDemoUniverseCount(typeof data?.count === 'number' ? data.count : list.length);
        setDemoUniverseSource(
          data?.source === 'company_cache' ||
            data?.source === 'demo_company_snapshots' ||
            data?.source === 'curated_demo_universe'
            ? data.source
            : 'unknown'
        );
        setDemoCompanies(
          list.map(
            (row: {
              ticker?: string;
              company_name?: string | null;
              companyName?: string | null;
              sector?: string | null;
            }) => ({
              ticker: String(row.ticker ?? '').trim().toUpperCase(),
              company_name:
                row.company_name != null
                  ? String(row.company_name)
                  : row.companyName != null
                    ? String(row.companyName)
                    : null,
              sector: row.sector != null ? String(row.sector).trim() || null : null,
            })
          )
        );
        setDemoFetched(true);
      } catch {
        try {
          const fallbackRes = await fetch('/api/market-brief/companies?limit=750');
          const data = await fallbackRes.json();
          if (!active) return;
          const list = Array.isArray(data?.companies) ? data.companies : [];
          setDemoUniverseCount(typeof data?.count === 'number' ? data.count : list.length);
          setDemoUniverseSource(
            data?.source === 'company_cache' ||
              data?.source === 'demo_company_snapshots' ||
              data?.source === 'curated_demo_universe'
              ? data.source
              : 'unknown'
          );
          setDemoCompanies(
            list.map(
              (row: {
                ticker?: string;
                company_name?: string | null;
                companyName?: string | null;
                sector?: string | null;
              }) => ({
                ticker: String(row.ticker ?? '').trim().toUpperCase(),
                company_name:
                  row.company_name != null
                    ? String(row.company_name)
                    : row.companyName != null
                      ? String(row.companyName)
                      : null,
                sector: row.sector != null ? String(row.sector).trim() || null : null,
              })
            )
          );
          setDemoFetched(true);
        } catch {
          if (active) {
            setDemoCompanies([]);
            setDemoUniverseCount(0);
            setDemoUniverseSource('unknown');
            setDemoLoadError(true);
            setDemoFetched(true);
          }
        }
      }
    };

    loadDemoUniverse();
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
  const selectedDemoCompany = useMemo(
    () => demoCompanies.find((company) => company.ticker === normalizedTicker) ?? null,
    [demoCompanies, normalizedTicker]
  );
  
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
  const extractionRequested = !isPrivateMode
    ? usePublicFinancialExtraction
    : privateInputSource === 'extraction';
  const selectedFinancialExtractionJob = useMemo(
    () => financialExtractionJobs.find((job) => job.jobId === selectedFinancialExtractionJobId) ?? null,
    [financialExtractionJobs, selectedFinancialExtractionJobId]
  );
  const currentEventAssumptions = useMemo(() => {
    const base = modelAssumptions.scenarios.base;
    const parsePct = (value: string): number | null => {
      const parsed = Number(String(value ?? '').trim());
      return Number.isFinite(parsed) ? parsed / 100 : null;
    };
    const privateRevenueGrowth = parsePct(manualInputs.revenueGrowthPct);
    const privateMargin = parsePct(manualInputs.ebitMarginPct);
    return {
      revenue_growth:
        isPrivateMode && privateRevenueGrowth !== null
          ? privateRevenueGrowth
          : Number.isFinite(base.revenueGrowth)
            ? base.revenueGrowth / 100
            : null,
      operating_margin:
        isPrivateMode && privateMargin !== null
          ? privateMargin
          : Number.isFinite(base.ebitdaMargin)
            ? base.ebitdaMargin / 100
            : null,
      wacc: Number.isFinite(base.wacc) ? base.wacc / 100 : null,
      terminal_growth_rate: Number.isFinite(base.terminalGrowth) ? base.terminalGrowth / 100 : null,
    };
  }, [isPrivateMode, manualInputs.ebitMarginPct, manualInputs.revenueGrowthPct, modelAssumptions.scenarios.base]);
  const currentEventCompanyContext = useMemo(
    () => ({
      companyName: isPrivateMode ? manualInputs.companyName.trim() || companyName || null : companyName || normalizedTicker || null,
      ticker: isPrivateMode ? null : normalizedTicker || null,
      sector: null,
      industry: null,
    }),
    [companyName, isPrivateMode, manualInputs.companyName, normalizedTicker],
  );

  const [missingInputOverrides, setMissingInputOverrides] = useState<Record<string, any>>({});
  // Keep a ref so "Apply & Re-run" can submit immediately with the latest patch
  // (React state updates are async, and we retry generation right away).
  const missingInputOverridesRef = useRef<Record<string, any>>({});

  useEffect(() => {
    missingInputOverridesRef.current = missingInputOverrides;
  }, [missingInputOverrides]);

  useEffect(() => {
    const prefilledEventText = searchParams.get('eventText');
    if (!prefilledEventText) return;
    setEventSourceType(searchParams.get('eventSourceType') === 'feed_item' ? 'feed_item' : 'pasted_text');
    setEventId(searchParams.get('eventId') ?? '');
    setEventTitle(searchParams.get('eventTitle') ?? '');
    setEventText(prefilledEventText);
    setEventSourceUrl(searchParams.get('eventUrl') ?? '');
    setEventSourceLabel(searchParams.get('eventSource') ?? '');
    setEventPublishedAt(searchParams.get('eventPublishedAt') ?? '');
  }, [searchParams]);

  useEffect(() => {
    setFinancialExtractionError(null);
    setSelectedFinancialExtractionJobId('');
    setFinancialExtractionJobs([]);
    if (!isPrivateMode) {
      setPrivateInputSource('manual');
      setUploadedExtractionFiles([]);
    }
  }, [companyMode, isPrivateMode]);

  useEffect(() => {
    if (!isPrivateMode) return;
    if (privateInputSource !== 'extraction') {
      setSelectedFinancialExtractionJobId('');
      setFinancialExtractionJobs([]);
    }
  }, [isPrivateMode, privateInputSource]);

  useEffect(() => {
    setEventAdjustmentReview(null);
    setAppliedEventAdjustment(null);
    setEventAdjustmentError(null);
    setAppliedSmartAssumptionSummary(null);
    setSmartAssumptionError(null);
  }, [companyMode, manualInputs.companyName, modelType, normalizedTicker]);

  useEffect(() => {
    if (!extractionRequested) {
      setFinancialExtractionJobs([]);
      setSelectedFinancialExtractionJobId('');
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set('lane', isPrivateMode ? 'private' : 'public');
    params.set('limit', '8');
    if (isPrivateMode) {
      if (!manualInputs.companyName.trim()) return;
      params.set('companyName', manualInputs.companyName.trim());
    } else {
      if (!normalizedTicker) return;
      params.set('ticker', normalizedTicker);
    }

    const loadJobs = async () => {
      try {
        setFinancialExtractionLoading(true);
        setFinancialExtractionError(null);
        const response = await fetch(`/api/financial-extraction/jobs?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || 'Failed to load extraction jobs.');
        }
        const payload = await response.json();
        if (controller.signal.aborted) return;
        const jobs = Array.isArray(payload?.jobs) ? (payload.jobs as FinancialExtractionJobSummary[]) : [];
        setFinancialExtractionJobs(jobs);
        setSelectedFinancialExtractionJobId((prev) => {
          if (prev && jobs.some((job) => job.jobId === prev)) return prev;
          return jobs[0]?.jobId ?? '';
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setFinancialExtractionError(error instanceof Error ? error.message : 'Failed to load extraction jobs.');
        setFinancialExtractionJobs([]);
      } finally {
        if (!controller.signal.aborted) {
          setFinancialExtractionLoading(false);
        }
      }
    };

    void loadJobs();
    return () => controller.abort();
  }, [extractionRequested, isPrivateMode, manualInputs.companyName, normalizedTicker]);

  const fetchFinancialExtractionJob = useCallback(async (jobId: string): Promise<FinancialExtractionJobSummary> => {
    const response = await fetch(`/api/financial-extraction/jobs/${encodeURIComponent(jobId)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to load extraction job.');
    }
    return {
      jobId: payload.jobId,
      lane: payload.lane,
      stage: payload.stage,
      validationState: payload.validationState,
      snapshot: payload.snapshot ?? null,
      errorMessage: payload.errorMessage ?? null,
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
    };
  }, []);

  const mergeFinancialExtractionJob = useCallback((job: FinancialExtractionJobSummary) => {
    setFinancialExtractionJobs((prev) => {
      const next = [job, ...prev.filter((item) => item.jobId !== job.jobId)];
      return next.slice(0, 8);
    });
    setSelectedFinancialExtractionJobId(job.jobId);
  }, []);

  const uploadFinancialExtractionFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setFinancialExtractionBusy(true);
    setFinancialExtractionError(null);
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append('files', file));
      const response = await fetch('/api/financial-extraction/uploads', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to upload private financial files.');
      }
      const uploaded = Array.isArray(payload?.files) ? (payload.files as UploadedFinancialExtractionFile[]) : [];
      setUploadedExtractionFiles((prev) => {
        const existing = new Set(prev.map((item) => item.fileId));
        return [...prev, ...uploaded.filter((item) => !existing.has(item.fileId))];
      });
    } catch (error) {
      setFinancialExtractionError(error instanceof Error ? error.message : 'Failed to upload files.');
    } finally {
      setFinancialExtractionBusy(false);
    }
  }, []);

  const createFinancialExtractionJob = useCallback(async () => {
    setFinancialExtractionBusy(true);
    setFinancialExtractionError(null);
    try {
      const body = !isPrivateMode
        ? {
            lane: 'public',
            ticker: normalizedTicker,
            targetPeriodType: extractionTargetPeriodForModel(modelType),
            targetModelType: modelType,
          }
        : {
            lane: 'private',
            companyName: manualInputs.companyName.trim(),
            fileIds: uploadedExtractionFiles.map((file) => file.fileId),
            targetPeriodType: extractionTargetPeriodForModel(modelType),
            targetModelType: modelType,
          };
      const response = await fetch('/api/financial-extraction/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create extraction job.');
      }
      if (!payload?.jobId) {
        throw new Error('Extraction job creation did not return a job id.');
      }
      const fullJob = await fetchFinancialExtractionJob(payload.jobId);
      mergeFinancialExtractionJob(fullJob);
    } catch (error) {
      setFinancialExtractionError(error instanceof Error ? error.message : 'Failed to create extraction job.');
    } finally {
      setFinancialExtractionBusy(false);
    }
  }, [
    fetchFinancialExtractionJob,
    isPrivateMode,
    manualInputs.companyName,
    mergeFinancialExtractionJob,
    modelType,
    normalizedTicker,
    uploadedExtractionFiles,
  ]);

  const reviewEventAdjustment = useCallback(async () => {
    if (!eventText.trim()) {
      setEventAdjustmentError('Event text is required before reviewing the model impact.');
      return;
    }
    setEventAdjustmentLoading(true);
    setEventAdjustmentError(null);
    try {
      const response = await fetch('/api/model-events/derive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            sourceType: eventSourceType,
            eventId: eventId.trim() || null,
            title: eventTitle.trim() || null,
            rawEventText: eventText.trim(),
            publishedAt: eventPublishedAt.trim() || null,
            sourceUrl: eventSourceUrl.trim() || null,
            sourceLabel: eventSourceLabel.trim() || null,
          },
          company: currentEventCompanyContext,
          currentAssumptions: currentEventAssumptions,
          modelType,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to review event impact.');
      }
      setEventAdjustmentReview(payload as EventLinkedModelAdjustmentResult);
    } catch (error) {
      setEventAdjustmentError(error instanceof Error ? error.message : 'Failed to review event impact.');
      setEventAdjustmentReview(null);
    } finally {
      setEventAdjustmentLoading(false);
    }
  }, [
    currentEventAssumptions,
    currentEventCompanyContext,
    eventId,
    eventPublishedAt,
    eventSourceLabel,
    eventSourceType,
    eventSourceUrl,
    eventText,
    eventTitle,
    modelType,
  ]);

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
    return buildRequiredInputsForModel(modelType, missingInputs);
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
    sharePrice: overrides.sharePrice ?? overrides.share_price,
    targetPrice: overrides.targetPrice ?? overrides.target_price,
    companyName: overrides.companyName ?? overrides.company_name,
    marketCap: overrides.market_cap ?? overrides.marketCap,
    netIncome: overrides.net_income ?? overrides.netIncome,
    revenue: overrides.revenue,
    ebitda: overrides.ebitda,
    ebit: overrides.ebit,
    grossProfit: overrides.gross_profit ?? overrides.grossProfit,
    operatingIncome: overrides.operating_income ?? overrides.operatingIncome,
    cash: overrides.cash,
    totalDebt: overrides.total_debt ?? overrides.totalDebt,
    netDebt: overrides.net_debt ?? overrides.netDebt,
    sharesOutstanding: overrides.shares_out_basic ?? overrides.sharesOutstanding,
    projectionYears: overrides.projectionYears ?? overrides.projection_years,
    wacc: overrides.wacc,
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
    ebit_margin: overrides.ebit_margin ?? overrides.ebitMargin,
    da_pct_revenue: overrides.da_pct_revenue ?? overrides.daPctRevenue,
    capex_pct_revenue: overrides.capex_pct_revenue ?? overrides.capexPctRevenue,
    delta_nwc_pct_revenue: overrides.delta_nwc_pct_revenue ?? overrides.deltaNwcPctRevenue,
    tax_rate: overrides.tax_rate ?? overrides.taxRate,
    minimum_cash_balance: overrides.minimum_cash_balance ?? overrides.minimumCashBalance,
    maxLeverage: overrides.maxLeverage ?? overrides.max_leverage,
    minInterestCoverage: overrides.minInterestCoverage ?? overrides.min_interest_coverage,
    interestRatePct: overrides.interestRatePct ?? overrides.interest_rate_pct,
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
        if (normalized.companyName !== undefined) next.companyName = String(normalized.companyName);
        if (normalized.sharePrice !== undefined) next.price = String(normalized.sharePrice);
        if (normalized.price !== undefined) next.price = String(normalized.price);
        if (normalized.revenue !== undefined) next.revenue = String(normalized.revenue);
        if (normalized.ebitda !== undefined) next.ebitda = String(normalized.ebitda);
        if (normalized.ebit !== undefined) next.ebit = String(normalized.ebit);
        if (normalized.grossProfit !== undefined) next.grossProfit = String(normalized.grossProfit);
        if (normalized.operatingIncome !== undefined) next.operatingIncome = String(normalized.operatingIncome);
        if (normalized.netIncome !== undefined) next.netIncome = String(normalized.netIncome);
        if (normalized.sharesOutstanding !== undefined) next.sharesOutstanding = String(normalized.sharesOutstanding);
        if (normalized.netDebt !== undefined) next.netDebt = String(normalized.netDebt);
        if (normalized.marketCap !== undefined) next.marketCap = String(normalized.marketCap);
        if (normalized.totalDebt !== undefined) next.totalDebt = String(normalized.totalDebt);
        if (normalized.cash !== undefined) next.cash = String(normalized.cash);
        if (normalized.revenue_growth !== undefined) next.revenueGrowthPct = String(normalized.revenue_growth * 100);
        if (normalized.ebitda_margin !== undefined) next.ebitMarginPct = String(normalized.ebitda_margin * 100);
        if (normalized.ebit_margin !== undefined) next.ebitMarginPct = String(normalized.ebit_margin * 100);
        if (normalized.tax_rate_assumption !== undefined) next.taxRatePct = String(normalized.tax_rate_assumption * 100);
        if (normalized.tax_rate !== undefined) next.taxRatePct = String(normalized.tax_rate * 100);
        if (normalized.da_pct_revenue !== undefined) next.daPctRevenue = String(normalized.da_pct_revenue * 100);
        if (normalized.capex_pct_revenue !== undefined) next.capexPctRevenue = String(normalized.capex_pct_revenue * 100);
        if (normalized.delta_nwc_pct_revenue !== undefined) next.nwcPctRevenue = String(normalized.delta_nwc_pct_revenue * 100);
        return next;
      });

      if (normalized.revenue_growth !== undefined) {
        updateScenarioValue('base', 'revenueGrowth', normalized.revenue_growth * 100);
      }
      if (normalized.ebitda_margin !== undefined) {
        updateScenarioValue('base', 'ebitdaMargin', normalized.ebitda_margin * 100);
      }
      if (normalized.da_pct_revenue !== undefined) {
        updateScenarioValue('base', 'daPctRevenue', normalized.da_pct_revenue * 100);
      }
      if (normalized.wacc !== undefined) {
        updateScenarioValue('base', 'wacc', normalized.wacc * 100);
      }
      if (normalized.terminal_growth !== undefined) {
        updateScenarioValue('base', 'terminalGrowth', normalized.terminal_growth * 100);
      }
      if (normalized.delta_nwc_pct_revenue !== undefined) {
        updateScenarioValue('base', 'deltaNwcPct', normalized.delta_nwc_pct_revenue * 100);
      }
      if (normalized.capex_pct_revenue !== undefined) {
        updateScenarioValue('base', 'capexPctRevenue', normalized.capex_pct_revenue * 100);
      }
      if (normalized.tax_rate_assumption !== undefined) {
        updateScenarioValue('base', 'taxRate', normalized.tax_rate_assumption * 100);
      } else if (normalized.tax_rate !== undefined) {
        updateScenarioValue('base', 'taxRate', normalized.tax_rate * 100);
      }

      if (
        normalized.wacc !== undefined ||
        normalized.terminal_growth !== undefined ||
        normalized.projectionYears !== undefined ||
        normalized.targetPrice !== undefined
      ) {
        setReverseDcfInputs((prev) => ({
          ...prev,
          waccPct: normalized.wacc !== undefined ? String(normalized.wacc * 100) : prev.waccPct,
          terminalGrowthPct:
            normalized.terminal_growth !== undefined ? String(normalized.terminal_growth * 100) : prev.terminalGrowthPct,
          projectionYears:
            normalized.projectionYears !== undefined ? String(normalized.projectionYears) : prev.projectionYears,
          targetPrice:
            normalized.targetPrice !== undefined ? String(normalized.targetPrice) : prev.targetPrice,
        }));
      }

      if (
        normalized.maxLeverage !== undefined ||
        normalized.minInterestCoverage !== undefined ||
        normalized.interestRatePct !== undefined
      ) {
        setDebtCapacityLiteInputs((prev) => ({
          ...prev,
          maxLeverage:
            normalized.maxLeverage !== undefined ? String(normalized.maxLeverage) : prev.maxLeverage,
          minInterestCoverage:
            normalized.minInterestCoverage !== undefined
              ? String(normalized.minInterestCoverage)
              : prev.minInterestCoverage,
          interestRatePct:
            normalized.interestRatePct !== undefined
              ? String(normalized.interestRatePct * 100)
              : prev.interestRatePct,
        }));
      }

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
    [modelType, updateScenarioValue]
  );

  const suggestSmartAssumptions = useCallback(async () => {
    if (!currentEventCompanyContext.companyName && !currentEventCompanyContext.ticker) {
      setSmartAssumptionError('Select a company before deriving smart assumptions.');
      return;
    }

    setSmartAssumptionLoading(true);
    setSmartAssumptionError(null);
    try {
      const response = await fetch('/api/smart-assumptions/derive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: currentEventCompanyContext,
          currentAssumptions: currentEventAssumptions,
          modelType,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to suggest smart assumptions.');
      }
      const result = payload as SmartAssumptionResult;
      handleMissingInputsApply(result.normalizedOverrides);
      setAppliedSmartAssumptionSummary(result);
      setEventAdjustmentReview(null);
      setAppliedEventAdjustment(null);
    } catch (error) {
      setSmartAssumptionError(error instanceof Error ? error.message : 'Failed to suggest smart assumptions.');
      setAppliedSmartAssumptionSummary(null);
    } finally {
      setSmartAssumptionLoading(false);
    }
  }, [
    currentEventAssumptions,
    currentEventCompanyContext,
    handleMissingInputsApply,
    modelType,
  ]);

  const applyReviewedEventAdjustment = useCallback(() => {
    if (!eventAdjustmentReview) return;
    if (eventAdjustmentReview.blockingErrors.length > 0) {
      setEventAdjustmentError(eventAdjustmentReview.blockingErrors.join(' '));
      return;
    }
    if (eventAdjustmentReview.hasMaterialChanges) {
      handleMissingInputsApply(eventAdjustmentReview.normalizedOverrides);
    }
    setAppliedEventAdjustment(eventAdjustmentReview);
  }, [eventAdjustmentReview, handleMissingInputsApply]);

  const discardEventAdjustment = useCallback(() => {
    setEventAdjustmentReview(null);
    setAppliedEventAdjustment(null);
    setEventAdjustmentError(null);
  }, []);

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
        setError('Choose a wired public company to continue.');
        return;
      }
    }

    if (extractionRequested && !selectedFinancialExtractionJobId) {
      setError('Create or select a validated extraction job before generating the model.');
      return;
    }

    if (selectedFinancialExtractionJob?.stage && selectedFinancialExtractionJob.stage !== 'completed') {
      setError('The selected extraction job is still processing.');
      return;
    }

    if (selectedFinancialExtractionJob?.validationState === 'blocking_error') {
      setError(
        selectedFinancialExtractionJob.snapshot?.blockingErrors?.join(' ') ||
          selectedFinancialExtractionJob.errorMessage ||
          'The selected extraction job is blocked.',
      );
      return;
    }

    if (isPrivateMode && privateInputSource === 'manual') {
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

    if (isPrivateMode && privateInputSource === 'extraction') {
      if (!manualInputs.companyName.trim()) {
        setError('Private extraction requires a company name.');
        return;
      }
      if (uploadedExtractionFiles.length === 0 && financialExtractionJobs.length === 0) {
        setError('Upload private financial files or select an existing extraction job first.');
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
      if (normalizedOverrides.sharePrice !== undefined) manualInputsPayload.price = normalizedOverrides.sharePrice;
      if (normalizedOverrides.revenue !== undefined) manualInputsPayload.revenue = normalizedOverrides.revenue;
      if (normalizedOverrides.ebitda !== undefined) manualInputsPayload.ebitda = normalizedOverrides.ebitda;
      if (normalizedOverrides.ebit !== undefined) manualInputsPayload.ebit = normalizedOverrides.ebit;
      if (normalizedOverrides.grossProfit !== undefined) manualInputsPayload.grossProfit = normalizedOverrides.grossProfit;
      if (normalizedOverrides.operatingIncome !== undefined) manualInputsPayload.operatingIncome = normalizedOverrides.operatingIncome;
      if (normalizedOverrides.netIncome !== undefined) manualInputsPayload.netIncome = normalizedOverrides.netIncome;
      if (normalizedOverrides.sharesOutstanding !== undefined) manualInputsPayload.sharesOutstanding = normalizedOverrides.sharesOutstanding;
      if (normalizedOverrides.netDebt !== undefined) manualInputsPayload.netDebt = normalizedOverrides.netDebt;
      if (normalizedOverrides.marketCap !== undefined) manualInputsPayload.marketCap = normalizedOverrides.marketCap;
      if (normalizedOverrides.totalDebt !== undefined) manualInputsPayload.totalDebt = normalizedOverrides.totalDebt;
      if (normalizedOverrides.cash !== undefined) manualInputsPayload.cash = normalizedOverrides.cash;

      const cleanedManualInputs = extractionRequested && isPrivateMode && privateInputSource === 'extraction'
        ? {}
        : Object.fromEntries(
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
        dataSource: extractionRequested ? 'financial_extraction' : isPrivateMode ? 'manual' : 'ticker',
        financialExtractionJobId: selectedFinancialExtractionJobId || undefined,
        eventContext: appliedEventAdjustment?.event ?? undefined,
        eventAdjustment:
          appliedEventAdjustment
            ? {
                normalizedEventSummary: appliedEventAdjustment.normalizedEventSummary,
                eventCategory: appliedEventAdjustment.eventCategory,
                confidence: appliedEventAdjustment.confidence,
                scenarioBias: appliedEventAdjustment.scenarioBias,
                warnings: appliedEventAdjustment.warnings,
                blockingErrors: appliedEventAdjustment.blockingErrors,
                changedDrivers: appliedEventAdjustment.changedDrivers,
                transcription: appliedEventAdjustment.transcription,
              }
            : undefined,
        smartAssumptionSummary: appliedSmartAssumptionSummary ?? undefined,
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
        requestBody.manualMode = privateInputSource === 'manual';
        if (privateInputSource === 'manual') {
          requestBody.sliderOverrides = {
            ...(requestBody.sliderOverrides || {}),
            ...privateSliderOverrides,
          };
        } else if (!requestBody.manualInputs || Object.keys(requestBody.manualInputs).length === 0) {
          delete requestBody.manualInputs;
        }
      }
      if (normalizedOverrides.price !== undefined) requestBody.price = normalizedOverrides.price;
      if (normalizedOverrides.sharePrice !== undefined) {
        requestBody.sharePrice = normalizedOverrides.sharePrice;
        requestBody.price = normalizedOverrides.sharePrice;
      }
      if (normalizedOverrides.targetPrice !== undefined) requestBody.targetPrice = normalizedOverrides.targetPrice;
      if (normalizedOverrides.companyName !== undefined) requestBody.companyName = normalizedOverrides.companyName;
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
      if (normalizedOverrides.grossProfit !== undefined) {
        requestBody.grossProfit = normalizedOverrides.grossProfit;
        requestBody.gross_profit = normalizedOverrides.grossProfit;
      }
      if (normalizedOverrides.operatingIncome !== undefined) {
        requestBody.operatingIncome = normalizedOverrides.operatingIncome;
        requestBody.operating_income = normalizedOverrides.operatingIncome;
      }
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
      if (normalizedOverrides.projectionYears !== undefined) requestBody.projectionYears = normalizedOverrides.projectionYears;
      if (normalizedOverrides.wacc !== undefined) requestBody.wacc = normalizedOverrides.wacc;
      if (normalizedOverrides.terminal_growth !== undefined) requestBody.terminal_growth = normalizedOverrides.terminal_growth;
      if (normalizedOverrides.tax_rate_assumption !== undefined) requestBody.tax_rate_assumption = normalizedOverrides.tax_rate_assumption;
      if (normalizedOverrides.tax_rate !== undefined) requestBody.tax_rate = normalizedOverrides.tax_rate;
      if (normalizedOverrides.revenue_growth !== undefined) requestBody.revenue_growth = normalizedOverrides.revenue_growth;
      if (normalizedOverrides.ebitda_margin !== undefined) requestBody.ebitda_margin = normalizedOverrides.ebitda_margin;
      if (normalizedOverrides.ebit_margin !== undefined) requestBody.ebit_margin = normalizedOverrides.ebit_margin;
      if (normalizedOverrides.da_pct_revenue !== undefined) requestBody.da_pct_revenue = normalizedOverrides.da_pct_revenue;
      if (normalizedOverrides.capex_pct_revenue !== undefined) requestBody.capex_pct_revenue = normalizedOverrides.capex_pct_revenue;
      if (normalizedOverrides.delta_nwc_pct_revenue !== undefined) {
        requestBody.delta_nwc_pct_revenue = normalizedOverrides.delta_nwc_pct_revenue;
        requestBody.nwc_pct_revenue = normalizedOverrides.delta_nwc_pct_revenue;
      }

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
          executionTrace: (operatingData.executionTrace as AppExecutionTrace | undefined) ?? undefined,
        };
        setGeneratedModel(resolvedModel);
        setShowResults(true);
        const clientDuration = Math.max(
          0,
          Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - runStart)
        );
        setLastDurationMs(clientDuration);
        void trackEvent('generated_model', undefined, {
          ticker: resolvedModel.ticker,
          model_type: 'operating',
        });
        return;
      }
      
      // For native wizard models, use the idempotent shared generate route.
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
        executionTrace: (generateData.executionTrace as AppExecutionTrace | undefined) ?? undefined,
      } as any;
      if (process.env.NODE_ENV !== 'production' && generateData.executionTrace) {
        console.debug('[models/create] execution trace', generateData.executionTrace);
      }
      setMissingInputsModalOpen(false);
      setGeneratedModel(resolvedModel);
      setShowResults(true);
      const clientDuration = Math.max(
        0,
        Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - runStart)
      );
      setLastDurationMs(clientDuration);
      void trackEvent('generated_model', undefined, {
        ticker: resolvedModel.ticker,
        model_type: modelType,
      });
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
        void trackEvent('downloaded_report');
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
      void trackEvent('downloaded_report');
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
  const selectedModelOption = CREATE_MODEL_OPTIONS.find((option) => option.value === modelType);
  const selectedWorkflowNote = MODEL_WORKFLOW_NOTES[modelType];
  const footballFieldSelected = modelType === 'football-field';
  const companySelectionLabel = isPrivateMode
    ? manualInputs.companyName.trim() || 'Private company'
    : normalizedTicker || 'No company selected';
  const companyContextLine = isPrivateMode
    ? manualInputs.companyName.trim()
      ? `${manualInputs.companyName.trim()} • private company`
      : null
    : selectedDemoCompany
      ? [selectedDemoCompany.company_name || selectedDemoCompany.ticker, selectedDemoCompany.sector]
          .filter(Boolean)
          .join(' • ')
      : companyName
        ? [companyName, normalizedTicker || null].filter(Boolean).join(' • ')
        : null;
  const modelTakeaway =
    extractShortTakeaway(aiSummaryText) ??
    extractShortTakeaway(generatedModel?.summaryText) ??
    extractShortTakeaway(reportText);
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
          <h1 className="text-3xl font-semibold text-[var(--cb-text-primary)] md:text-4xl">Create Model</h1>
          {companyContextLine && !showResults ? (
            <p className="text-sm text-[var(--cb-text-secondary)]">{companyContextLine}</p>
          ) : null}
        </header>

        {!showResults ? (
          <>
            <form
              ref={formRef}
              onSubmit={handleSubmit}
              className="space-y-6 rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-6 shadow-sm"
            >
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">Model</div>
                <div className="mt-1 text-sm font-semibold text-[var(--cb-text-primary)]">{selectedModelOption?.label ?? 'Select model'}</div>
              </div>
              <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">Company</div>
                <div className="mt-1 text-sm font-semibold text-[var(--cb-text-primary)]">{companySelectionLabel}</div>
              </div>
              <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">Mode</div>
                <div className="mt-1 text-sm font-semibold text-[var(--cb-text-primary)]">{isPrivateMode ? 'Private' : 'Public'}</div>
              </div>
            </div>

            <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
              <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]/50">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">Step 1</p>
                <CardTitle className="text-lg text-[var(--cb-text-primary)]">Choose Model</CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  {CREATE_MODEL_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setModelType(option.value)}
                      className={cn(
                        'rounded-xl border px-4 py-4 text-left transition-all',
                        modelType === option.value
                          ? 'border-[var(--cb-green)] bg-[var(--cb-surface-alt)] text-[var(--cb-text-primary)] shadow-[0_0_20px_rgba(0,227,135,0.08)]'
                          : 'border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] text-[var(--cb-text-body)] hover:border-[var(--cb-border-strong)] hover:bg-[var(--cb-surface)]'
                      )}
                    >
                      <div className="text-sm font-semibold text-[var(--cb-text-primary)] md:text-base">
                        {option.label}
                      </div>
                      <div className="mt-1 text-xs text-[var(--cb-text-muted)] md:text-sm">{option.description}</div>
                    </button>
                  ))}
                </div>
                {selectedWorkflowNote ? (
                  <div className="mt-4 rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] px-4 py-3 text-sm text-[var(--cb-text-secondary)]">
                    {selectedWorkflowNote.decisionQuestion}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
              <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]/50">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">Step 2</p>
                <CardTitle className="text-lg text-[var(--cb-text-primary)]">Select Company</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
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
                  <p>
                    Automated Builder currently has {demoUniverseCount || demoCompanies.length} companies available for model seeding.
                    {demoUniverseSource === 'company_cache'
                      ? ' Using cached company data first.'
                      : demoUniverseSource === 'demo_company_snapshots'
                        ? ' Using snapshot fallback coverage.'
                        : demoUniverseSource === 'curated_demo_universe'
                          ? ' Using curated fallback coverage.'
                          : ''}
                  </p>
                  {ticker.trim() && demoTickers.length > 0 && !demoTickers.includes(normalizedTicker) && (
                    <p className="text-xs text-red-400">Ticker is not wired in the current company universe yet.</p>
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
                        <span className="col-span-full text-muted-foreground py-4 text-center">Loading wired company universe…</span>
                      ) : demoLoadError ? (
                        <span className="col-span-full text-red-500 py-4 text-center">Failed to load wired companies.</span>
                      ) : demoCompanies.length === 0 ? (
                        <span className="col-span-full text-muted-foreground py-4 text-center">No wired companies available.</span>
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
                    Showing {demoFilteredCompanies.length} of {demoCompanies.length} wired companies
                  </p>
                  {!ticker.trim() && demoCompanies.length > 0 && (
                    <p className="text-xs text-[var(--cb-text-muted)]">
                      Demo Mode is active. Choose a public company to continue.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[var(--cb-text-muted)]">
                  Demo mode is not enabled for this session. Enable demo mode to load the public demo universe.
                </p>
              )}

              <div className="mt-4 rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-[var(--cb-text-primary)]">Use extracted financials</div>
                    <p className="text-xs text-[var(--cb-text-muted)]">
                      Create or select a validated public extraction job and feed it into generation before stored/demo defaults.
                    </p>
                  </div>
                  <Switch
                    checked={usePublicFinancialExtraction}
                    onCheckedChange={setUsePublicFinancialExtraction}
                    disabled={!normalizedTicker || loading || financialExtractionBusy}
                  />
                </div>

                {usePublicFinancialExtraction && (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void createFinancialExtractionJob()}
                        disabled={!normalizedTicker || financialExtractionBusy || loading}
                      >
                        {financialExtractionBusy ? 'Creating extraction job…' : 'Create extraction job'}
                      </Button>
                      <Select
                        value={selectedFinancialExtractionJobId || undefined}
                        onValueChange={setSelectedFinancialExtractionJobId}
                        disabled={financialExtractionLoading || financialExtractionJobs.length === 0}
                      >
                        <SelectTrigger className="w-full sm:w-[320px]">
                          <SelectValue placeholder="Select a recent extraction job" />
                        </SelectTrigger>
                        <SelectContent>
                          {financialExtractionJobs.map((job) => (
                            <SelectItem key={job.jobId} value={job.jobId}>
                              {formatExtractionValidationState(job.validationState)} • {job.snapshot?.companyName ?? normalizedTicker} •{' '}
                              {new Date(job.updatedAt).toLocaleDateString('en-US')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {financialExtractionLoading && (
                      <p className="text-xs text-[var(--cb-text-muted)]">Loading recent extraction jobs…</p>
                    )}
                    {selectedFinancialExtractionJob && (
                      <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-3 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[var(--cb-text-primary)]">
                            {selectedFinancialExtractionJob.snapshot?.companyName ?? normalizedTicker}
                          </span>
                          <span className="rounded-full bg-[var(--cb-surface-alt)] px-2 py-0.5 text-[var(--cb-text-muted)]">
                            {formatExtractionValidationState(selectedFinancialExtractionJob.validationState)}
                          </span>
                          <span className="text-[var(--cb-text-muted)]">Stage: {selectedFinancialExtractionJob.stage}</span>
                        </div>
                        {selectedFinancialExtractionJob.snapshot?.mappedModelInputs && (
                          <div className="mt-2 grid gap-2 text-[var(--cb-text-secondary)] sm:grid-cols-3">
                            <div>Revenue: {formatResultMetric(selectedFinancialExtractionJob.snapshot.mappedModelInputs.revenue ?? null, 'money')}</div>
                            <div>EBITDA: {formatResultMetric(selectedFinancialExtractionJob.snapshot.mappedModelInputs.ebitda ?? null, 'money')}</div>
                            <div>Cash: {formatResultMetric(selectedFinancialExtractionJob.snapshot.mappedModelInputs.cash ?? null, 'money')}</div>
                          </div>
                        )}
                        {selectedFinancialExtractionJob.snapshot?.warnings?.length ? (
                          <p className="mt-2 text-amber-600">{selectedFinancialExtractionJob.snapshot.warnings[0]}</p>
                        ) : null}
                        {selectedFinancialExtractionJob.snapshot?.blockingErrors?.length ? (
                          <p className="mt-2 text-red-500">{selectedFinancialExtractionJob.snapshot.blockingErrors[0]}</p>
                        ) : null}
                      </div>
                    )}
                    {financialExtractionError && (
                      <p className="text-xs text-red-500">{financialExtractionError}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            )}
              </CardContent>
            </Card>

            {isPrivateMode && (
              <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]">
                <CardHeader>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">Step 2A</p>
                  <CardTitle className="text-base text-[var(--cb-text-primary)]">Private Company Inputs</CardTitle>
                  <CardDescription>
                    Stay fully manual or upload financial files and drive the model from a validated extraction job.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Private source</Label>
                    <div className="inline-flex rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] p-1">
                      <Button
                        type="button"
                        variant={privateInputSource === 'manual' ? 'default' : 'ghost'}
                        size="sm"
                        className="h-8"
                        onClick={() => setPrivateInputSource('manual')}
                      >
                        Manual inputs
                      </Button>
                      <Button
                        type="button"
                        variant={privateInputSource === 'extraction' ? 'default' : 'ghost'}
                        size="sm"
                        className="h-8"
                        onClick={() => setPrivateInputSource('extraction')}
                      >
                        Upload financial files
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="private-company-name">
                        Company Name <span className="text-[var(--cb-danger)]">*</span>
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
                  </div>

                  {privateInputSource === 'manual' ? (
                    <>
                      <p className="text-xs text-[var(--cb-text-muted)]">
                        Required for {modelType.toUpperCase()}: {privateRequirementsSummary}
                      </p>
                      <div className="grid gap-4 md:grid-cols-2">
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
                              <Label htmlFor="private-market-cap">Market Cap</Label>
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
                      </div>
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-subtle)] p-4">
                        <div className="text-sm font-medium text-[var(--cb-text-primary)]">Upload financial files</div>
                        <p className="mt-1 text-xs text-[var(--cb-text-muted)]">
                          Upload spreadsheets or PDFs. Text-layer PDFs use deterministic parsing first; scanned PDFs fall back to OCR when configured.
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.xlsx,.xls,.csv,application/pdf,text/csv"
                            onChange={(event) => void uploadFinancialExtractionFiles(event.target.files)}
                            className="text-xs text-[var(--cb-text-muted)]"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void createFinancialExtractionJob()}
                            disabled={financialExtractionBusy || uploadedExtractionFiles.length === 0 || !manualInputs.companyName.trim()}
                          >
                            {financialExtractionBusy ? 'Creating extraction job…' : 'Create extraction job'}
                          </Button>
                        </div>
                        {uploadedExtractionFiles.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {uploadedExtractionFiles.map((file) => (
                              <div
                                key={file.fileId}
                                className="flex items-center justify-between rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] px-3 py-2 text-xs"
                              >
                                <span className="truncate text-[var(--cb-text-primary)]">{file.fileName}</span>
                                <button
                                  type="button"
                                  className="text-[var(--cb-text-muted)] hover:text-[var(--cb-text-primary)]"
                                  onClick={() =>
                                    setUploadedExtractionFiles((prev) => prev.filter((item) => item.fileId !== file.fileId))
                                  }
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>Recent extraction jobs</Label>
                        <Select
                          value={selectedFinancialExtractionJobId || undefined}
                          onValueChange={setSelectedFinancialExtractionJobId}
                          disabled={financialExtractionLoading || financialExtractionJobs.length === 0}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a recent extraction job" />
                          </SelectTrigger>
                          <SelectContent>
                            {financialExtractionJobs.map((job) => (
                              <SelectItem key={job.jobId} value={job.jobId}>
                                {formatExtractionValidationState(job.validationState)} • {job.snapshot?.companyName ?? manualInputs.companyName.trim()} •{' '}
                                {new Date(job.updatedAt).toLocaleDateString('en-US')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedFinancialExtractionJob && (
                        <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-3 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-[var(--cb-text-primary)]">
                              {selectedFinancialExtractionJob.snapshot?.companyName ?? manualInputs.companyName.trim()}
                            </span>
                            <span className="rounded-full bg-[var(--cb-surface-alt)] px-2 py-0.5 text-[var(--cb-text-muted)]">
                              {formatExtractionValidationState(selectedFinancialExtractionJob.validationState)}
                            </span>
                            <span className="text-[var(--cb-text-muted)]">Stage: {selectedFinancialExtractionJob.stage}</span>
                          </div>
                          {selectedFinancialExtractionJob.snapshot?.mappedModelInputs && (
                            <div className="mt-2 grid gap-2 text-[var(--cb-text-secondary)] sm:grid-cols-3">
                              <div>Revenue: {formatResultMetric(selectedFinancialExtractionJob.snapshot.mappedModelInputs.revenue ?? null, 'money')}</div>
                              <div>EBITDA: {formatResultMetric(selectedFinancialExtractionJob.snapshot.mappedModelInputs.ebitda ?? null, 'money')}</div>
                              <div>Debt: {formatResultMetric(selectedFinancialExtractionJob.snapshot.mappedModelInputs.totalDebt ?? null, 'money')}</div>
                            </div>
                          )}
                          {selectedFinancialExtractionJob.snapshot?.warnings?.length ? (
                            <p className="mt-2 text-amber-600">{selectedFinancialExtractionJob.snapshot.warnings[0]}</p>
                          ) : null}
                          {selectedFinancialExtractionJob.snapshot?.blockingErrors?.length ? (
                            <p className="mt-2 text-red-500">{selectedFinancialExtractionJob.snapshot.blockingErrors[0]}</p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )}

                  {financialExtractionLoading && (
                    <p className="text-xs text-[var(--cb-text-muted)]">Loading recent extraction jobs…</p>
                  )}
                  {financialExtractionError && (
                    <p className="text-xs text-red-500">{financialExtractionError}</p>
                  )}
                </CardContent>
              </Card>
            )}

            <details className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
              <summary className="cursor-pointer list-none px-6 py-4 text-sm font-semibold text-[var(--cb-text-primary)]">
                Optional: Apply event
              </summary>
              <Card className="border-0 bg-transparent shadow-none">
              <CardHeader className="pt-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">
                  {isPrivateMode ? 'Step 2B' : 'Step 2A'}
                </p>
                <CardTitle className="text-base text-[var(--cb-text-primary)]">Apply Event</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Source type</Label>
                    <Select
                      value={eventSourceType}
                      onValueChange={(value) =>
                        setEventSourceType(value === 'feed_item' ? 'feed_item' : 'pasted_text')
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select event source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pasted_text">Pasted event</SelectItem>
                        <SelectItem value="feed_item">Feed item</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="event-title">Event title</Label>
                    <Input
                      id="event-title"
                      value={eventTitle}
                      placeholder="Tariffs increase on imported components"
                      onChange={(event) => setEventTitle(event.target.value)}
                    />
                  </div>
                </div>

                {eventSourceType === 'feed_item' ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="event-id">Feed event id</Label>
                      <Input
                        id="event-id"
                        value={eventId}
                        placeholder="event_123"
                        onChange={(event) => setEventId(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="event-published-at">Published at</Label>
                      <Input
                        id="event-published-at"
                        type="datetime-local"
                        value={eventPublishedAt}
                        onChange={(event) => setEventPublishedAt(event.target.value)}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="event-source-label">Source label</Label>
                    <Input
                      id="event-source-label"
                      value={eventSourceLabel}
                      placeholder="Reuters"
                      onChange={(event) => setEventSourceLabel(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="event-source-url">Source URL</Label>
                    <Input
                      id="event-source-url"
                      value={eventSourceUrl}
                      placeholder="https://example.com/article"
                      onChange={(event) => setEventSourceUrl(event.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="event-text">Event text</Label>
                  <Textarea
                    id="event-text"
                    value={eventText}
                    placeholder="Paste the headline, article excerpt, or short event description you want translated into assumption changes."
                    onChange={(event) => setEventText(event.target.value)}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">Revenue Growth</div>
                    <div className="mt-1 text-sm text-[var(--cb-text-primary)]">{formatResultMetric(currentEventAssumptions.revenue_growth, 'percent')}</div>
                  </div>
                  <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">Operating Margin</div>
                    <div className="mt-1 text-sm text-[var(--cb-text-primary)]">{formatResultMetric(currentEventAssumptions.operating_margin, 'percent')}</div>
                  </div>
                  <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">WACC</div>
                    <div className="mt-1 text-sm text-[var(--cb-text-primary)]">{formatResultMetric(currentEventAssumptions.wacc, 'percent')}</div>
                  </div>
                  <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">Terminal Growth</div>
                    <div className="mt-1 text-sm text-[var(--cb-text-primary)]">{formatResultMetric(currentEventAssumptions.terminal_growth_rate, 'percent')}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void suggestSmartAssumptions()}
                    disabled={smartAssumptionLoading || (!currentEventCompanyContext.companyName && !currentEventCompanyContext.ticker)}
                  >
                    {smartAssumptionLoading ? 'Suggesting…' : 'Suggest assumptions'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void reviewEventAdjustment()}
                    disabled={eventAdjustmentLoading || !eventText.trim()}
                  >
                    {eventAdjustmentLoading ? 'Reviewing…' : 'Preview Assumption Impact'}
                  </Button>
                </div>

                {smartAssumptionError ? (
                  <p className="text-xs text-red-500">{smartAssumptionError}</p>
                ) : null}
                {eventAdjustmentError ? (
                  <p className="text-xs text-red-500">{eventAdjustmentError}</p>
                ) : null}

                {appliedSmartAssumptionSummary ? (
                  <div className="space-y-3 rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-[var(--cb-surface)] px-2 py-1 text-[var(--cb-text-primary)]">
                        smart assumptions
                      </span>
                      <span className="text-[var(--cb-text-muted)]">
                        {appliedSmartAssumptionSummary.subject.companyName ?? appliedSmartAssumptionSummary.subject.ticker ?? 'Current company'}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--cb-text-primary)]">
                      {appliedSmartAssumptionSummary.provenanceSummary.companyProfile}
                    </p>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {appliedSmartAssumptionSummary.changedDrivers.map((change) => (
                        <div
                          key={`smart-${change.driver}`}
                          className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3"
                        >
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800">
                            {change.label}
                          </div>
                          <div className="mt-1 text-sm text-[var(--cb-text-primary)]">
                            {formatResultMetric(change.old, 'percent')} → {formatResultMetric(change.new, 'percent')}
                          </div>
                          <div className="mt-1 text-[11px] text-[var(--cb-text-muted)]">{change.confidence}</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs leading-6 text-[var(--cb-text-secondary)]">
                      {appliedSmartAssumptionSummary.provenanceSummary.peerContext} {appliedSmartAssumptionSummary.provenanceSummary.macroContext}
                    </p>
                    {appliedSmartAssumptionSummary.warnings.length > 0 ? (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                        {appliedSmartAssumptionSummary.warnings[0]}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {eventAdjustmentReview ? (
                  <div className="space-y-3 rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-[var(--cb-surface)] px-2 py-1 text-[var(--cb-text-primary)]">
                        {eventAdjustmentReview.eventCategory.replace(/_/g, ' ')}
                      </span>
                      <span className="rounded-full bg-[var(--cb-surface)] px-2 py-1 text-[var(--cb-text-primary)]">
                        {eventAdjustmentReview.confidence}
                      </span>
                      <span className="rounded-full bg-[var(--cb-surface)] px-2 py-1 text-[var(--cb-text-primary)]">
                        {eventAdjustmentReview.scenarioBias}
                      </span>
                      <span className="text-[var(--cb-text-muted)]">
                        {eventAdjustmentReview.applicability.relevanceSummary}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--cb-text-primary)]">{eventAdjustmentReview.normalizedEventSummary}</p>
                    {eventAdjustmentReview.changedDrivers.length > 0 ? (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {eventAdjustmentReview.changedDrivers.map((change) => (
                          <div
                            key={`summary-${change.driver}`}
                            className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3"
                          >
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800">
                              {change.label}
                            </div>
                            <div className="mt-1 text-sm text-[var(--cb-text-primary)]">
                              {formatResultMetric(change.old, 'percent')} → {formatResultMetric(change.new, 'percent')}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {eventAdjustmentReview.changedDrivers.length === 0 ? (
                      <p className="text-sm text-[var(--cb-text-muted)]">
                        No material assumption changes were proposed for the current model state.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        onClick={applyReviewedEventAdjustment}
                        disabled={eventAdjustmentReview.blockingErrors.length > 0}
                      >
                        Apply and Continue
                      </Button>
                      <Button type="button" variant="ghost" onClick={discardEventAdjustment}>
                        Discard
                      </Button>
                    </div>
                    {eventAdjustmentReview.warnings.length > 0 ? (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                        {eventAdjustmentReview.warnings[0]}
                      </div>
                    ) : null}
                    {eventAdjustmentReview.blockingErrors.length > 0 ? (
                      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">
                        {eventAdjustmentReview.blockingErrors[0]}
                      </div>
                    ) : null}
                    <details className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-3">
                      <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">
                        Why this changed
                      </summary>
                      <div className="mt-3 space-y-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">
                              What changed
                            </div>
                            <p className="mt-2 text-xs leading-6 text-[var(--cb-text-secondary)]">
                              {eventAdjustmentReview.transcription.whatChanged}
                            </p>
                          </div>
                          <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">
                              Why it matters
                            </div>
                            <p className="mt-2 text-xs leading-6 text-[var(--cb-text-secondary)]">
                              {eventAdjustmentReview.transcription.whyItMatters}
                            </p>
                          </div>
                        </div>
                        <div className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">
                            Transmission path
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {eventAdjustmentReview.transcription.transmissionChannels.map((channel) => (
                              <span
                                key={channel}
                                className="rounded-full bg-[var(--cb-surface)] px-2 py-1 text-[11px] text-[var(--cb-text-primary)]"
                              >
                                {channel.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                          <p className="mt-3 text-xs leading-6 text-[var(--cb-text-secondary)]">
                            {eventAdjustmentReview.transcription.companyExposure}
                          </p>
                        </div>
                        {flattenEventTranscriptionImpacts(eventAdjustmentReview.transcription).length > 0 ? (
                          <div className="space-y-2">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">
                              Suggested impacts
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              {flattenEventTranscriptionImpacts(eventAdjustmentReview.transcription)
                                .slice(0, 4)
                                .map((impact) => (
                                  <div
                                    key={impact.key}
                                    className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-sm text-[var(--cb-text-primary)]">{impact.label}</div>
                                      <span className="rounded-full bg-[var(--cb-surface)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">
                                        {impact.severity}
                                      </span>
                                    </div>
                                    <p className="mt-2 text-xs leading-6 text-[var(--cb-text-secondary)]">
                                      {impact.summary}
                                    </p>
                                  </div>
                                ))}
                            </div>
                          </div>
                        ) : null}
                        {eventAdjustmentReview.transcription.suggestedAssumptions.length > 0 ? (
                          <div className="space-y-2">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">
                              Suggested assumption moves
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              {eventAdjustmentReview.transcription.suggestedAssumptions.map((suggestion) => (
                                <div
                                  key={suggestion.driver}
                                  className="rounded-lg border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-3"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm text-[var(--cb-text-primary)]">
                                      {suggestion.label} {formatSuggestedAssumptionDirection(suggestion.direction)}
                                    </div>
                                    <span className="rounded-full bg-[var(--cb-surface)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--cb-text-muted)]">
                                      {suggestion.magnitude}
                                    </span>
                                  </div>
                                  <p className="mt-2 text-xs leading-6 text-[var(--cb-text-secondary)]">
                                    {suggestion.rationale}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </details>
                  </div>
                ) : null}

                {appliedEventAdjustment && !eventAdjustmentReview ? (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                    Event adjustment applied. The reviewed deltas are now layered into the current form state and will be included in the next generation request.
                  </div>
                ) : null}
                {!eventAdjustmentReview && appliedEventAdjustment ? (
                  <Button type="button" variant="ghost" onClick={discardEventAdjustment}>
                    Discard
                  </Button>
                ) : null}
              </CardContent>
            </Card>
            </details>

            {/* Custom Comps Input (only for Comps model) */}
            {modelType === 'comps' && (
              <details className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
                <summary className="cursor-pointer list-none px-6 py-4 text-sm font-semibold text-[var(--cb-text-primary)]">
                  Optional: Custom comps
                </summary>
              <Card className="border-0 bg-transparent shadow-none">
                <CardHeader>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">Step 3</p>
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
                </CardContent>
              </Card>
              </details>
            )}

            {/* Scenario Configuration */}
            {scenarioFeatureEnabled && (
              <Card className="border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
                <CardHeader className="border-b border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)]/50">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">Step 3</p>
                      <CardTitle className="text-lg">Scenarios</CardTitle>
                    </div>
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
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">Step 3</p>
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
                          Valuation Anchor Overrides
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
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">Step 3</p>
                  <CardTitle className="text-lg">Debt Capacity / Credit Inputs</CardTitle>
                  <CardDescription>
                    Size max debt from EBITDA using leverage and coverage constraints you would use in a first-pass credit screen.
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
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">Step 3</p>
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

            <div className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--cb-text-muted)]">Step 4</p>
                  <h3 className="mt-1 text-lg font-semibold text-[var(--cb-text-primary)]">Generate Banker Output</h3>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button 
                    type="submit" 
                    disabled={loading || 
                             (modelType === 'merger' && !mergerInputsValid) ||
                             (modelType === 'operating' && !operatingInputsValid) ||
                             (scenarioFeatureEnabled && Object.keys(assumptionErrors).length > 0) ||
                             (demoDataActive && !demoTickerAllowed)} 
                    className="min-w-[220px]"
                  >
                    {loading
                      ? 'Generating Banker Output…'
                      : 'Generate Banker Output'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => router.push('/app')}>
                    Cancel
                  </Button>
                </div>
              </div>
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
                <>
                  <ModelResultsShell
                    ticker={generatedModel.ticker}
                    modelName={modelName}
                    generatedAt={generatedModel.createdAt}
                    status={blocks.length > 0 ? 'failed' : 'success'}
                    companyContext={companyContextLine}
                    takeaway={modelTakeaway}
                    onDownload={lastRequestBody ? handleDownload : undefined}
                    onDownloadPdfReport={REPORTS_ENABLED ? handleDownloadReportPdf : undefined}
                    pdfReportUrl={REPORTS_ENABLED ? (runReportUrl || reportPdfUrl || undefined) : undefined}
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
                    state={generatedModel.state || 'generated'}
                    missingInputs={generatedModel.missingInputs || missingInputs}
                    estimatedInputs={generatedModel.estimatedInputs || estimatedInputs}
                    onCompleteAssumptions={() => setMissingInputsModalOpen(true)}
                    diagnostics={undefined}
                    additionalAnalysis={undefined}
                  />
                  {showExecutionTrace && generatedModel.executionTrace ? (
                    <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Execution Trace</CardTitle>
                        <CardDescription>
                          Internal debug map for this model-generation request.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <div className="grid gap-2 md:grid-cols-3">
                          <div>
                            <div className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">Surface</div>
                            <div className="text-[var(--cb-text-primary)]">{generatedModel.executionTrace.surface}</div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">Model Type</div>
                            <div className="text-[var(--cb-text-primary)]">{generatedModel.executionTrace.modelType || generatedModel.modelType}</div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">Route Intent</div>
                            <div className="text-[var(--cb-text-primary)]">{generatedModel.executionTrace.routeIntent || 'deterministic_generation'}</div>
                          </div>
                        </div>
                        <div>
                          <div className="mb-2 text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">Fired Services</div>
                          <div className="flex flex-wrap gap-2">
                            {generatedModel.executionTrace.firedServices.map((service) => (
                              <span
                                key={service}
                                className="rounded-full border border-[var(--cb-border-subtle)] px-2 py-1 text-xs text-[var(--cb-text-primary)]"
                              >
                                {service}
                              </span>
                            ))}
                          </div>
                        </div>
                        {generatedModel.executionTrace.notes?.length ? (
                          <div>
                            <div className="mb-1 text-xs uppercase tracking-wide text-[var(--cb-text-muted)]">Notes</div>
                            <ul className="list-disc pl-5 text-[var(--cb-text-secondary)]">
                              {generatedModel.executionTrace.notes.map((note) => (
                                <li key={note}>{note}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  ) : null}
                </>
              );
            })()}

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

            {generatedModel && generatedModel.modelType === 'comps' && (() => {
              const assumptions = (generatedModel as any).assumptions || {};
              const currentPrice = getPreviewMetricValue(generatedModel.modelDocument, /^current price$/i) ?? assumptions.subject?.price ?? null;
              const currentEv = getPreviewMetricValue(generatedModel.modelDocument, /^current ev$/i);
              const subjectRevenue = getPreviewMetricValue(generatedModel.modelDocument, /^revenue$/i) ?? assumptions.subject?.revenue ?? null;
              const subjectEbitda = getPreviewMetricValue(generatedModel.modelDocument, /^ebitda$/i) ?? assumptions.subject?.ebitda ?? null;
              const selectedEvRevenue = assumptions.selectedMultiples?.evToRevenue ?? null;
              const selectedEvEbitda = assumptions.selectedMultiples?.evToEbitda ?? null;
              const selectedPe = assumptions.selectedMultiples?.peRatio ?? null;
              const peerCount = Array.isArray(assumptions.peers) ? assumptions.peers.length : null;
              const primaryLens =
                typeof selectedEvEbitda === 'number'
                  ? 'EV / EBITDA'
                  : typeof selectedEvRevenue === 'number'
                    ? 'EV / Revenue'
                    : typeof selectedPe === 'number'
                      ? 'P / E'
                      : 'Peer median review';
              const selectedLensValue =
                typeof selectedEvEbitda === 'number'
                  ? formatResultMetric(selectedEvEbitda, 'multiple')
                  : typeof selectedEvRevenue === 'number'
                    ? formatResultMetric(selectedEvRevenue, 'multiple')
                    : typeof selectedPe === 'number'
                      ? formatResultMetric(selectedPe, 'multiple')
                      : 'N/A';

              return (
                <section className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-6">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-[var(--cb-text-primary)]">Trading Comparables Readout</h2>
                    <p className="text-sm text-[var(--cb-text-secondary)]">
                      Relative valuation framing across the active peer set. Start with the selected multiple, then decide whether the subject deserves a premium, discount, or in-line mark.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Primary Lens</p>
                      <p className="text-sm text-[var(--cb-text-primary)]">{primaryLens}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Selected Multiple</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">{selectedLensValue}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Peer Count</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">{peerCount ?? 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Current Price</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">{formatResultMetric(currentPrice, 'money')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Current EV</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">{formatResultMetric(currentEv, 'money')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Subject Revenue / EBITDA</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">
                        {formatResultMetric(subjectRevenue, 'money')} / {formatResultMetric(subjectEbitda, 'money')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                      <h3 className="mb-2 text-sm font-semibold text-[var(--cb-text-primary)]">Banker Read</h3>
                      <p className="text-sm leading-6 text-[var(--cb-text-primary)]">
                        Use this output to argue where the company should trade versus peers, not to force a single-point fair value. The first judgment is whether the active peer set is tight enough to support a real premium / discount view.
                      </p>
                    </div>

                    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                      <h3 className="mb-2 text-sm font-semibold text-[var(--cb-text-primary)]">Pressure-Test First</h3>
                      <div className="space-y-2 text-sm text-[var(--cb-text-primary)]">
                        <div className="flex items-center justify-between">
                          <span>Peer set quality</span>
                          <span className="text-[var(--cb-text-secondary)]">Remove weak comps</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Selected multiple</span>
                          <span className="text-[var(--cb-text-secondary)]">Favor the sector lens</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Current price anchor</span>
                          <span className="text-[var(--cb-text-secondary)]">Check market regime drift</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <CompsPeerTableCard peers={Array.isArray(assumptions.peers) ? assumptions.peers : []} />
                  </div>
                </section>
              );
            })()}

            {generatedModel && generatedModel.modelType === 'football-field' && (() => {
              const assumptions = (generatedModel as any).assumptions || {};
              const ranges = Array.isArray(assumptions.ranges) ? assumptions.ranges : [];
              const midpointPrices = ranges
                .map((range: any) => (typeof range?.midValue === 'number' && typeof assumptions.sharesOutstanding === 'number' && assumptions.sharesOutstanding > 0
                  ? (range.midValue - (typeof assumptions.netDebt === 'number' ? assumptions.netDebt : 0)) / assumptions.sharesOutstanding
                  : null))
                .filter((value: number | null): value is number => typeof value === 'number' && Number.isFinite(value));
              const midpointAverage = midpointPrices.length > 0
                ? midpointPrices.reduce((total: number, value: number) => total + value, 0) / midpointPrices.length
                : null;
              const currentPrice = assumptions.sharePrice ?? assumptions.price ?? null;
              const methodCount = ranges.length;
              const topMethods: Array<{
                label: string;
                midEv: number | null;
                midPrice: number | null;
              }> = ranges
                .slice(0, 4)
                .map((range: any) => ({
                  label: typeof range?.label === 'string' ? range.label : 'Method',
                  midEv: range?.midValue ?? null,
                  midPrice:
                    typeof range?.midValue === 'number' && typeof assumptions.sharesOutstanding === 'number' && assumptions.sharesOutstanding > 0
                      ? (range.midValue - (typeof assumptions.netDebt === 'number' ? assumptions.netDebt : 0)) / assumptions.sharesOutstanding
                      : null,
                }));

              return (
                <section className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-6">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-[var(--cb-text-primary)]">Football Field Readout</h2>
                    <p className="text-sm text-[var(--cb-text-secondary)]">
                      Banker valuation range framing across trading and transaction-style methods. Use the spread and clustering to judge whether the field is ready for a deck.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Methods Populated</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">{methodCount || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Current Price</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">{formatResultMetric(currentPrice, 'money')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Average Midpoint</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">{formatResultMetric(midpointAverage, 'money')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Revenue Anchor</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">{formatResultMetric(assumptions.revenue ?? null, 'money')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">EBITDA Anchor</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">{formatResultMetric(assumptions.ebitda ?? null, 'money')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Net Debt / Shares</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">
                        {formatResultMetric(assumptions.netDebt ?? null, 'money')} / {formatResultMetric(assumptions.sharesOutstanding ?? null)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                      <div className="mb-3">
                        <h3 className="text-sm font-semibold text-[var(--cb-text-primary)]">Method Midpoints</h3>
                        <p className="text-xs text-[var(--cb-text-secondary)]">
                          These are the first rows to challenge before the field is used externally.
                        </p>
                      </div>
                      <div className="space-y-2">
                        {topMethods.map((method, index) => (
                          <div key={`${method.label}-${index}`} className="flex items-center justify-between text-sm text-[var(--cb-text-primary)]">
                            <span>{method.label}</span>
                            <span className="font-mono">
                              {formatResultMetric(method.midEv, 'money')} / {formatResultMetric(method.midPrice, 'money')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                      <h3 className="mb-2 text-sm font-semibold text-[var(--cb-text-primary)]">Pressure-Test First</h3>
                      <div className="space-y-2 text-sm text-[var(--cb-text-primary)]">
                        <div className="flex items-center justify-between">
                          <span>Method dispersion</span>
                          <span className="text-[var(--cb-text-secondary)]">Tight enough for a range?</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Net debt and shares</span>
                          <span className="text-[var(--cb-text-secondary)]">Every price output depends on them</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Control uplift</span>
                          <span className="text-[var(--cb-text-secondary)]">Challenge weak precedent support</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <FootballFieldReviewCard
                      ranges={ranges}
                      currentPrice={typeof currentPrice === 'number' ? currentPrice : null}
                      netDebt={typeof assumptions.netDebt === 'number' ? assumptions.netDebt : null}
                      sharesOutstanding={
                        typeof assumptions.sharesOutstanding === 'number' ? assumptions.sharesOutstanding : null
                      }
                    />
                  </div>
                </section>
              );
            })()}

            {generatedModel && generatedModel.modelType === 'precedents' && (() => {
              const assumptions = (generatedModel as any).assumptions || {};
              const subjectRevenue = getPreviewMetricValue(generatedModel.modelDocument, /^subject revenue$/i);
              const subjectEbitda = getPreviewMetricValue(generatedModel.modelDocument, /^subject ebitda$/i);
              const medianRevenue = getPreviewMetricValue(generatedModel.modelDocument, /^median ev \/ revenue$/i);
              const medianEbitda = getPreviewMetricValue(generatedModel.modelDocument, /^median ev \/ ebitda$/i);
              const impliedRevenue = getPreviewMetricValue(generatedModel.modelDocument, /^implied ev \(revenue\)$/i);
              const impliedEbitda = getPreviewMetricValue(generatedModel.modelDocument, /^implied ev \(ebitda\)$/i);
              const transactions = Array.isArray(assumptions.transactions) ? assumptions.transactions.slice(0, 5) : [];

              return (
                <section className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-6">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-[var(--cb-text-primary)]">Precedent Valuation Readout</h2>
                    <p className="text-sm text-[var(--cb-text-secondary)]">
                      Control-value framing built from the selected transaction set and the subject&apos;s current revenue and EBITDA anchors.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Subject Revenue</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">{formatResultMetric(subjectRevenue, 'money')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Subject EBITDA</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">{formatResultMetric(subjectEbitda, 'money')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Transaction Count</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">
                        {typeof assumptions.transactionCount === 'number' ? assumptions.transactionCount : transactions.length || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Median EV / Revenue</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">{formatResultMetric(medianRevenue, 'multiple')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Median EV / EBITDA</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">{formatResultMetric(medianEbitda, 'multiple')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Revenue vs EBITDA Read</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">
                        {formatResultMetric(impliedRevenue, 'money')} / {formatResultMetric(impliedEbitda, 'money')}
                      </p>
                    </div>
                  </div>

                  {transactions.length > 0 && (
                    <div className="mt-5 rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                      <div className="mb-3">
                        <h3 className="text-sm font-semibold text-[var(--cb-text-primary)]">Selected Transactions</h3>
                        <p className="text-xs text-[var(--cb-text-secondary)]">
                          Use these as the first challenge set before relying on the implied control range.
                        </p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-xs">
                          <thead className="text-[var(--cb-text-muted)]">
                            <tr>
                              <th className="pb-2 pr-4 font-medium">Transaction</th>
                              <th className="pb-2 pr-4 font-medium">Year</th>
                              <th className="pb-2 pr-4 font-medium">EV / Revenue</th>
                              <th className="pb-2 pr-4 font-medium">EV / EBITDA</th>
                              <th className="pb-2 font-medium">Premium</th>
                            </tr>
                          </thead>
                          <tbody className="text-[var(--cb-text-primary)]">
                            {transactions.map((transaction: any, index: number) => (
                              <tr key={`${transaction.transaction || 'tx'}-${index}`} className="border-t border-[var(--cb-border-subtle)]">
                                <td className="py-2 pr-4">{transaction.transaction || transaction.target || 'Transaction'}</td>
                                <td className="py-2 pr-4">{transaction.announcementYear ?? '—'}</td>
                                <td className="py-2 pr-4 font-mono">{formatResultMetric(transaction.revenueMultiple ?? null, 'multiple')}</td>
                                <td className="py-2 pr-4 font-mono">{formatResultMetric(transaction.ebitdaMultiple ?? null, 'multiple')}</td>
                                <td className="py-2 font-mono">{formatResultMetric(transaction.premium ?? null, 'percent')}</td>
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

            {generatedModel && generatedModel.modelType === 'merger' && (() => {
              const assumptions = (generatedModel as any).assumptions || {};
              const dealValue = getPreviewMetricValue(generatedModel.modelDocument, /^deal value$/i);
              const standaloneEps = getPreviewMetricValue(generatedModel.modelDocument, /^standalone eps$/i);
              const proFormaRevenue = getPreviewMetricValue(generatedModel.modelDocument, /^pro forma revenue$/i);
              const proFormaEbitda = getPreviewMetricValue(generatedModel.modelDocument, /^pro forma ebitda$/i);
              const proFormaEps = getPreviewMetricValue(generatedModel.modelDocument, /^pro forma eps$/i);
              const epsAccretion = getPreviewMetricValue(generatedModel.modelDocument, /^eps accretion \/ dilution$/i);
              const cashPct = typeof assumptions.cashPct === 'number' ? assumptions.cashPct : null;
              const stockPct = typeof assumptions.stockPct === 'number' ? assumptions.stockPct : null;
              const debtPct = typeof assumptions.debtPct === 'number' ? assumptions.debtPct : null;

              return (
                <section className="rounded-2xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface)] p-6">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-[var(--cb-text-primary)]">Accretion / Dilution Readout</h2>
                    <p className="text-sm text-[var(--cb-text-secondary)]">
                      Pro forma transaction read-through across deal value, consideration mix, and EPS accretion / dilution.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Deal Value</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">{formatResultMetric(dealValue, 'money')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Standalone EPS</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">{formatResultMetric(standaloneEps, 'money')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Pro Forma EPS</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">{formatResultMetric(proFormaEps, 'money')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">EPS Accretion / Dilution</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">{formatResultMetric(epsAccretion, 'percent')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Pro Forma Revenue</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">{formatResultMetric(proFormaRevenue, 'money')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cb-text-muted)]">Pro Forma EBITDA</p>
                      <p className="font-mono text-sm text-[var(--cb-text-primary)]">{formatResultMetric(proFormaEbitda, 'money')}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                      <h3 className="mb-2 text-sm font-semibold text-[var(--cb-text-primary)]">Consideration Mix</h3>
                      <div className="space-y-2 text-sm text-[var(--cb-text-primary)]">
                        <div className="flex items-center justify-between">
                          <span>Cash</span>
                          <span className="font-mono">{formatResultMetric(cashPct, 'percent')}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Stock</span>
                          <span className="font-mono">{formatResultMetric(stockPct, 'percent')}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Debt</span>
                          <span className="font-mono">{formatResultMetric(debtPct, 'percent')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[var(--cb-border-subtle)] bg-[var(--cb-surface-alt)] p-4">
                      <h3 className="mb-2 text-sm font-semibold text-[var(--cb-text-primary)]">Deal Mechanics</h3>
                      <div className="space-y-2 text-sm text-[var(--cb-text-primary)]">
                        <div className="flex items-center justify-between">
                          <span>New Debt Rate</span>
                          <span className="font-mono">{formatResultMetric(assumptions.newDebtRate ?? null, 'percent')}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Synergies</span>
                          <span className="font-mono">{formatResultMetric(assumptions.synergies ?? null, 'money')}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>One-Time Costs</span>
                          <span className="font-mono">{formatResultMetric(assumptions.oneTimeCosts ?? null, 'money')}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Tax Rate</span>
                          <span className="font-mono">{formatResultMetric(assumptions.taxRate ?? null, 'percent')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })()}

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

            {REPORTS_ENABLED && (
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
            )}

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
