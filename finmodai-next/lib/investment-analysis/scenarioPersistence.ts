import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildFreeCashFlowForecastChart,
  buildRevenueForecastChart,
  buildSensitivityTable,
} from '@/lib/investment-analysis/chartSeries';
import type {
  InvestmentAnalysisDocument,
  InvestmentSavedScenarioCharts,
  InvestmentSavedScenarioListItem,
  InvestmentSavedScenarioRecord,
  InvestmentScenarioKey,
  SaveInvestmentScenarioInput,
} from '@/lib/investment-analysis/types';

type InvestmentSavedScenarioRow = {
  id: string;
  user_id: string;
  company_id: string | null;
  company_ticker: string;
  company_name: string;
  model_type: 'DCF';
  scenario_name: string;
  scenario_key: InvestmentScenarioKey;
  assumptions: SaveInvestmentScenarioInput['assumptions'];
  valuation: SaveInvestmentScenarioInput['valuation'];
  chart_payload: InvestmentSavedScenarioCharts;
  created_at: string;
  updated_at: string;
};

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

function mapRow(row: InvestmentSavedScenarioRow): InvestmentSavedScenarioRecord {
  return {
    id: row.id,
    userId: row.user_id,
    companyId: row.company_id,
    companyTicker: row.company_ticker,
    companyName: row.company_name,
    modelType: row.model_type,
    scenarioName: row.scenario_name,
    scenarioKey: row.scenario_key,
    assumptions: row.assumptions,
    valuation: row.valuation,
    chartPayload: row.chart_payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapListItem(row: InvestmentSavedScenarioRow): InvestmentSavedScenarioListItem {
  const mapped = mapRow(row);
  return {
    id: mapped.id,
    companyId: mapped.companyId,
    companyTicker: mapped.companyTicker,
    companyName: mapped.companyName,
    modelType: mapped.modelType,
    scenarioName: mapped.scenarioName,
    scenarioKey: mapped.scenarioKey,
    valuation: mapped.valuation,
    createdAt: mapped.createdAt,
    updatedAt: mapped.updatedAt,
  };
}

export function buildSavedScenarioChartsFromDocument(
  document: InvestmentAnalysisDocument,
  scenarioKey: InvestmentScenarioKey,
): InvestmentSavedScenarioCharts {
  const scenario = document.scenarios[scenarioKey];

  return {
    revenueForecast: buildRevenueForecastChart(scenario),
    freeCashFlowForecast: buildFreeCashFlowForecastChart(scenario),
    sensitivity: buildSensitivityTable(scenario),
  };
}

export function buildSaveScenarioInputFromDocument(args: {
  document: InvestmentAnalysisDocument;
  scenarioName: string;
  scenarioKey?: InvestmentScenarioKey;
  companyId?: string | null;
}): SaveInvestmentScenarioInput {
  const scenarioKey = args.scenarioKey ?? args.document.activeScenario;
  const scenario = args.document.scenarios[scenarioKey];

  return {
    companyId: args.companyId ?? null,
    company: args.document.company,
    scenarioName: args.scenarioName.trim(),
    scenarioKey,
    modelType: 'DCF',
    assumptions: scenario.assumptions,
    valuation: scenario.result.valuation,
    chartPayload: buildSavedScenarioChartsFromDocument(args.document, scenarioKey),
  };
}

export async function saveInvestmentScenario(
  supabase: SupabaseClient,
  userId: string,
  input: SaveInvestmentScenarioInput,
): Promise<InvestmentSavedScenarioRecord> {
  const row = {
    user_id: userId,
    company_id: input.companyId ?? null,
    company_ticker: normalizeTicker(input.company.ticker),
    company_name: input.company.companyName,
    model_type: input.modelType ?? 'DCF',
    scenario_name: input.scenarioName.trim(),
    scenario_key: input.scenarioKey,
    assumptions: input.assumptions,
    valuation: input.valuation,
    chart_payload: input.chartPayload,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('investment_saved_scenarios')
    .upsert(row, {
      onConflict: 'user_id,company_ticker,scenario_name',
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to save investment scenario.');
  }

  return mapRow(data as InvestmentSavedScenarioRow);
}

export async function listSavedInvestmentScenarios(
  supabase: SupabaseClient,
  userId: string,
  options?: {
    ticker?: string;
    limit?: number;
  },
): Promise<InvestmentSavedScenarioListItem[]> {
  let query = supabase
    .from('investment_saved_scenarios')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(options?.limit ?? 25);

  if (options?.ticker) {
    query = query.eq('company_ticker', normalizeTicker(options.ticker));
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data as InvestmentSavedScenarioRow[] | null)?.map(mapListItem) ?? [];
}

export async function getSavedInvestmentScenario(
  supabase: SupabaseClient,
  userId: string,
  scenarioId: string,
): Promise<InvestmentSavedScenarioRecord | null> {
  const { data, error } = await supabase
    .from('investment_saved_scenarios')
    .select('*')
    .eq('user_id', userId)
    .eq('id', scenarioId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;
  return mapRow(data as InvestmentSavedScenarioRow);
}
