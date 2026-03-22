import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InvestmentAnalysisDocument,
  InvestmentEventAnalysisRunListItem,
  InvestmentEventAnalysisRunRecord,
  SaveInvestmentEventAnalysisRunInput,
} from '@/lib/investment-analysis/types';
import type {
  InvestmentEventAssumptionApplicationResult,
  InvestmentEventClassificationResult,
} from '@/lib/investment-analysis/eventTypes';
import type { ParsedPromptEventContext } from '@/lib/investment-analysis/promptParser';

type InvestmentEventAnalysisRunRow = {
  id: string;
  user_id: string;
  company_id: string | null;
  company_ticker: string;
  company_name: string;
  model_type: 'DCF';
  original_prompt: string;
  parsed_prompt_context: SaveInvestmentEventAnalysisRunInput['parsedPromptContext'];
  event_category: string | null;
  event_confidence: string | null;
  detected_event: SaveInvestmentEventAnalysisRunInput['detectedEvent'];
  base_assumptions: SaveInvestmentEventAnalysisRunInput['baseAssumptions'];
  assumption_deltas: SaveInvestmentEventAnalysisRunInput['assumptionDeltas'];
  adjusted_assumptions: SaveInvestmentEventAnalysisRunInput['adjustedAssumptions'];
  valuation_outputs: SaveInvestmentEventAnalysisRunInput['valuationOutputs'];
  generated_summary: SaveInvestmentEventAnalysisRunInput['generatedSummary'];
  created_at: string;
  updated_at: string;
};

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

function extractEventMetadata(
  detectedEvent: SaveInvestmentEventAnalysisRunInput['detectedEvent'],
): { category: string | null; confidence: string | null } {
  if (!detectedEvent || typeof detectedEvent !== 'object') {
    return { category: null, confidence: null };
  }

  const category = typeof detectedEvent.category === 'string' ? detectedEvent.category : null;
  const confidence = typeof detectedEvent.confidence === 'string' ? detectedEvent.confidence : null;
  return { category, confidence };
}

function mapRow(row: InvestmentEventAnalysisRunRow): InvestmentEventAnalysisRunRecord {
  return {
    id: row.id,
    userId: row.user_id,
    companyId: row.company_id,
    companyTicker: row.company_ticker,
    companyName: row.company_name,
    modelType: row.model_type,
    originalPrompt: row.original_prompt,
    parsedPromptContext: row.parsed_prompt_context,
    eventCategory: row.event_category,
    eventConfidence: row.event_confidence,
    detectedEvent: row.detected_event,
    baseAssumptions: row.base_assumptions,
    assumptionDeltas: row.assumption_deltas,
    adjustedAssumptions: row.adjusted_assumptions,
    valuationOutputs: row.valuation_outputs,
    generatedSummary: row.generated_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapListItem(row: InvestmentEventAnalysisRunRow): InvestmentEventAnalysisRunListItem {
  const mapped = mapRow(row);
  return {
    id: mapped.id,
    companyId: mapped.companyId,
    companyTicker: mapped.companyTicker,
    companyName: mapped.companyName,
    modelType: mapped.modelType,
    originalPrompt: mapped.originalPrompt,
    eventCategory: mapped.eventCategory,
    eventConfidence: mapped.eventConfidence,
    valuationOutputs: mapped.valuationOutputs,
    createdAt: mapped.createdAt,
    updatedAt: mapped.updatedAt,
  };
}

export function buildSaveInvestmentEventAnalysisRunInput(args: {
  originalPrompt: string;
  parsedPromptContext: ParsedPromptEventContext;
  detectedEvent: InvestmentEventClassificationResult | null;
  baseDocument: InvestmentAnalysisDocument;
  refreshedDocument: InvestmentAnalysisDocument;
  assumptionApplication: InvestmentEventAssumptionApplicationResult;
  generatedSummary?: Record<string, unknown> | null;
  companyId?: string | null;
}): SaveInvestmentEventAnalysisRunInput {
  const activeScenario = args.refreshedDocument.scenarios[args.refreshedDocument.activeScenario];

  return {
    companyId: args.companyId ?? null,
    company: args.refreshedDocument.company,
    modelType: args.refreshedDocument.modelType,
    originalPrompt: args.originalPrompt,
    parsedPromptContext: args.parsedPromptContext as Record<string, unknown>,
    detectedEvent: args.detectedEvent ? (args.detectedEvent as Record<string, unknown>) : null,
    baseAssumptions: args.baseDocument.scenarios.base.assumptions,
    assumptionDeltas: {
      summary: args.assumptionApplication.summary,
      changes: args.assumptionApplication.changes,
      validationIssues: args.assumptionApplication.validationIssues,
      hasMaterialChanges: args.assumptionApplication.hasMaterialChanges,
    },
    adjustedAssumptions: activeScenario.assumptions,
    valuationOutputs: {
      activeScenario: args.refreshedDocument.activeScenario,
      forecast: activeScenario.result.forecast,
      valuation: activeScenario.result.valuation,
      scenarios: {
        base: args.refreshedDocument.scenarios.base.result.valuation,
        bull: args.refreshedDocument.scenarios.bull.result.valuation,
        bear: args.refreshedDocument.scenarios.bear.result.valuation,
        custom: args.refreshedDocument.scenarios.custom.result.valuation,
      },
    },
    generatedSummary: args.generatedSummary ?? null,
  };
}

export async function saveInvestmentEventAnalysisRun(
  supabase: SupabaseClient,
  userId: string,
  input: SaveInvestmentEventAnalysisRunInput,
): Promise<InvestmentEventAnalysisRunRecord> {
  const eventMetadata = extractEventMetadata(input.detectedEvent);

  const row = {
    user_id: userId,
    company_id: input.companyId ?? null,
    company_ticker: normalizeTicker(input.company.ticker),
    company_name: input.company.companyName,
    model_type: input.modelType ?? 'DCF',
    original_prompt: input.originalPrompt.trim(),
    parsed_prompt_context: input.parsedPromptContext,
    event_category: eventMetadata.category,
    event_confidence: eventMetadata.confidence,
    detected_event: input.detectedEvent ?? null,
    base_assumptions: input.baseAssumptions,
    assumption_deltas: input.assumptionDeltas,
    adjusted_assumptions: input.adjustedAssumptions,
    valuation_outputs: input.valuationOutputs,
    generated_summary: input.generatedSummary ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('investment_event_analysis_runs')
    .insert(row)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to save investment event analysis run.');
  }

  return mapRow(data as InvestmentEventAnalysisRunRow);
}

export async function listInvestmentEventAnalysisRuns(
  supabase: SupabaseClient,
  userId: string,
  options?: {
    ticker?: string;
    eventCategory?: string;
    limit?: number;
  },
): Promise<InvestmentEventAnalysisRunListItem[]> {
  let query = supabase
    .from('investment_event_analysis_runs')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(options?.limit ?? 25);

  if (options?.ticker) {
    query = query.eq('company_ticker', normalizeTicker(options.ticker));
  }

  if (options?.eventCategory) {
    query = query.eq('event_category', options.eventCategory);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data as InvestmentEventAnalysisRunRow[] | null)?.map(mapListItem) ?? [];
}

export async function getInvestmentEventAnalysisRun(
  supabase: SupabaseClient,
  userId: string,
  runId: string,
): Promise<InvestmentEventAnalysisRunRecord | null> {
  const { data, error } = await supabase
    .from('investment_event_analysis_runs')
    .select('*')
    .eq('user_id', userId)
    .eq('id', runId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;
  return mapRow(data as InvestmentEventAnalysisRunRow);
}
