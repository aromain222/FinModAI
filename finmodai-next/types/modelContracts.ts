import type { Scenario as LegacyScenario } from './models';
import type { DcfAssumptions, DcfValidation, UnitsSpec, QualityTier } from './dcfContracts';

export type ScenarioValue = LegacyScenario | 'BASE';

export type ModelTypeValue = 'dcf' | 'lbo' | 'three-statement' | 'comps' | 'merger' | 'operating';

export type ModelStatus = 'created' | 'generating' | 'ready' | 'failed' | 'error';

export interface ModelRow {
  id: string;
  user_id: string;
  ticker: string;
  company_name: string | null;
  model_type: ModelTypeValue;
  type?: ModelTypeValue | null;
  scenario: string;
  scenario_adjustment_notes: string | null;
  scenario_summary_notes?: string | null;
  assumptions: Record<string, any>;
  normalized_assumptions?: DcfAssumptions | null;
  validation?: DcfValidation | null;
  units?: UnitsSpec | null;
  results: Record<string, any> | null;
  preview: Record<string, any> | null;
  status: ModelStatus;
  notes?: string | null;
  r2_key: string | null;
  file_name: string | null;
  signed_url: string | null;
  export_key: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateModelRequest {
  ticker: string;
  modelType?: ModelTypeValue;
  model_type?: ModelTypeValue;
  scenario?: string;
  scenario_adjustment_notes?: string | null;
  scenarioAdjustmentNotes?: string | null;
  scenario_summary_notes?: string | null;
  scenarioSummaryNotes?: string | null;
  assumptions?: Record<string, any>;
  companyName?: string | null;
  company_name?: string | null;
  qualityTier?: QualityTier;
  quality_tier?: QualityTier;
}

export interface CreateModelResponse {
  modelId: string;
  id?: string;
  model?: Pick<ModelRow, 'id' | 'ticker' | 'model_type' | 'type' | 'status' | 'scenario'>;
  traceId?: string;
}

export interface GenerateModelRequest {
  ticker?: string;
  modelType?: ModelTypeValue;
  model_type?: ModelTypeValue;
  scenario?: string;
  scenario_adjustment_notes?: string | null;
  scenarioAdjustmentNotes?: string | null;
  companyName?: string | null;
  company_name?: string | null;
  assumptions?: Record<string, any>;
  modelId: string;
  qualityTier?: QualityTier;
  quality_tier?: QualityTier;
  normalizedAssumptions?: Record<string, any>;
  validation?: Record<string, any>;
  units?: UnitsSpec;
  [key: string]: any;
}

export interface GenerateModelResponse {
  success: boolean;
  modelId: string;
  ticker: string;
  modelType: ModelTypeValue;
  scenario: string;
  status: ModelStatus;
  downloadUrl?: string;
  results?: Record<string, any>;
  preview?: Record<string, any>;
  warnings?: string[];
  qualityTier?: QualityTier;
  normalizedAssumptions?: DcfAssumptions | null;
  validation?: DcfValidation | null;
  units?: UnitsSpec | null;
}

export interface DownloadResponse {
  url: string;
}

export interface NormalizedModelPayload {
  ticker: string;
  modelType: ModelTypeValue;
  scenario: ScenarioValue;
  scenario_adjustment_notes: string;
  scenario_summary_notes: string;
  assumptions: Record<string, any>;
  companyName: string | null;
  qualityTier: QualityTier;
}

const SCENARIO_ALIASES: Record<string, ScenarioValue> = {
  BASE: 'BASE',
  BULL: 'BULLISH',
  BULLISH: 'BULLISH',
  BEAR: 'BEARISH',
  BEARISH: 'BEARISH',
};

export function normalizeModelRequest(body: any): NormalizedModelPayload {
  const tickerCandidate =
    typeof body?.ticker === 'string' && body.ticker.trim().length > 0
      ? body.ticker
      : typeof body?.tickerSymbol === 'string' && body.tickerSymbol.trim().length > 0
      ? body.tickerSymbol
      : typeof body?.symbol === 'string' && body.symbol.trim().length > 0
      ? body.symbol
      : typeof body?.assumptions?.ticker === 'string' && body.assumptions.ticker.trim().length > 0
      ? body.assumptions.ticker
      : typeof body?.assumptions?.tickerSymbol === 'string' && body.assumptions.tickerSymbol.trim().length > 0
      ? body.assumptions.tickerSymbol
      : typeof body?.assumptions?.symbol === 'string' && body.assumptions.symbol.trim().length > 0
      ? body.assumptions.symbol
      : '';

  const ticker = typeof tickerCandidate === 'string' ? tickerCandidate.trim().toUpperCase() : '';

  const modelTypeInput =
    typeof body?.modelType === 'string' && body.modelType.trim().length > 0
      ? body.modelType.trim()
      : typeof body?.model_type === 'string' && body.model_type.trim().length > 0
      ? body.model_type.trim()
      : '';
  const modelType = (modelTypeInput || 'dcf') as ModelTypeValue;

  const scenarioInput =
    (body?.scenario ??
      body?.settings?.scenario ??
      body?.assumptions?.scenario ??
      'BASE') ?? 'BASE';
  const scenarioKey = typeof scenarioInput === 'string' ? scenarioInput.trim().toUpperCase() : 'BASE';
  const scenario = SCENARIO_ALIASES[scenarioKey] ?? 'BASE';

  const scenarioAdjustmentNotesRaw =
    body?.scenario_adjustment_notes ??
    body?.scenarioAdjustmentNotes ??
    body?.settings?.scenario_adjustment_notes ??
    body?.settings?.scenarioAdjustmentNotes ??
    body?.assumptions?.scenario_adjustment_notes ??
    body?.assumptions?.scenarioAdjustmentNotes ??
    '';
  const scenario_adjustment_notes =
    typeof scenarioAdjustmentNotesRaw === 'string'
      ? scenarioAdjustmentNotesRaw
      : '';

  const scenarioSummaryNotesRaw =
    body?.scenario_summary_notes ??
    body?.scenarioSummaryNotes ??
    body?.settings?.scenario_summary_notes ??
    body?.assumptions?.scenario_summary_notes ??
    '';
  const scenario_summary_notes =
    typeof scenarioSummaryNotesRaw === 'string'
      ? scenarioSummaryNotesRaw
      : '';

  const assumptionsSource =
    (body?.assumptions && typeof body.assumptions === 'object'
      ? body.assumptions
      : body?.settings?.assumptions && typeof body.settings.assumptions === 'object'
      ? body.settings.assumptions
      : {}) ?? {};

  const companyName =
    typeof body?.company_name === 'string'
      ? body.company_name
      : typeof body?.companyName === 'string'
      ? body.companyName
      : body?.assumptions?.company_name ?? body?.assumptions?.companyName ?? null;
  const qualityTierInput =
    typeof body?.qualityTier === 'string' && (body.qualityTier === 'preview' || body.qualityTier === 'institutional')
      ? (body.qualityTier as QualityTier)
      : typeof body?.quality_tier === 'string' && (body.quality_tier === 'preview' || body.quality_tier === 'institutional')
      ? (body.quality_tier as QualityTier)
      : 'preview';

  return {
    ticker,
    modelType,
    scenario,
    scenario_adjustment_notes,
    scenario_summary_notes,
    assumptions: assumptionsSource,
    companyName: companyName ?? null,
    qualityTier: qualityTierInput,
  };
}
