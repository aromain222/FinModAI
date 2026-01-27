import type { SupabaseClient } from '@supabase/supabase-js';
import type { ModelReport, ModelType } from './reportTypes';

export async function saveModelReport(
  supabase: SupabaseClient,
  report: ModelReport,
  userId?: string | null
): Promise<string> {
  const insertPayload = {
    ticker: report.ticker,
    model_type: report.modelType,
    user_id: userId ?? null,
    report,
  };

  const { data, error } = await supabase
    .from('model_reports')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

export async function getLatestReportFor(
  supabase: SupabaseClient,
  ticker: string,
  modelType: ModelType
): Promise<ModelReport | null> {
  const { data, error } = await supabase
    .from('model_reports')
    .select('report')
    .eq('ticker', ticker)
    .eq('model_type', modelType)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return (data?.report as ModelReport) ?? null;
}

