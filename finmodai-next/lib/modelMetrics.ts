import 'server-only';

import { getSupabaseServerClient } from '@/lib/supabaseClient';

export type ModelType = 'dcf' | 'lbo' | 'comps' | 'three-statement';

type StatsResponse = {
  ticker: string;
  modelType: ModelType;
  sampleCount: number;
  avgDurationMs: number | null;
  p50Ms: number | null;
  p80Ms: number | null;
};

export const mapModelTypeToMetrics = (value: string): ModelType | null => {
  if (value === 'dcf' || value === 'lbo' || value === 'comps') {
    return value;
  }
  if (value === 'three-statement' || value === 'three_statement' || value === 'threeStatement') {
    return 'three-statement';
  }
  return null;
};

export async function logModelRun(params: {
  ticker: string;
  modelType: ModelType;
  durationMs: number;
  success: boolean;
}): Promise<void> {
  try {
    const supabase = getSupabaseServerClient();
    const payload = {
      ticker: params.ticker.trim().toUpperCase(),
      model_type: params.modelType,
      duration_ms: Math.max(0, Math.round(params.durationMs)),
      success: params.success,
    };

    const { error } = await supabase.from('model_run_stats').insert(payload).select('id').single();
    if (error) {
      console.error('[METRICS] Failed to insert model_run_stats', error);
    }
  } catch (error) {
    console.error('[METRICS] Unexpected error logging model run', error);
  }
}

export async function getModelStats(params: {
  ticker: string;
  modelType: ModelType;
  maxSamples?: number;
}): Promise<StatsResponse> {
  const supabase = getSupabaseServerClient();
  const ticker = params.ticker.trim().toUpperCase();
  const limit = Math.max(1, params.maxSamples ?? 200);

  try {
    const { data, error } = await supabase
      .from('model_run_stats')
      .select('duration_ms')
      .eq('ticker', ticker)
      .eq('model_type', params.modelType)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[METRICS] Failed to fetch model run stats', error);
      return {
        ticker,
        modelType: params.modelType,
        sampleCount: 0,
        avgDurationMs: null,
        p50Ms: null,
        p80Ms: null,
      };
    }

    const durations = (data ?? [])
      .map((row) => (typeof row.duration_ms === 'number' ? row.duration_ms : null))
      .filter((value): value is number => typeof value === 'number' && value >= 0);

    if (durations.length === 0) {
      return {
        ticker,
        modelType: params.modelType,
        sampleCount: 0,
        avgDurationMs: null,
        p50Ms: null,
        p80Ms: null,
      };
    }

    const avgDurationMs = Math.round(
      durations.reduce((sum, value) => sum + value, 0) / durations.length
    );

    const sorted = [...durations].sort((a, b) => a - b);
    const percentile = (p: number) => {
      if (sorted.length === 1) return sorted[0];
      const index = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1))));
      return sorted[index];
    };

    return {
      ticker,
      modelType: params.modelType,
      sampleCount: durations.length,
      avgDurationMs,
      p50Ms: percentile(0.5),
      p80Ms: percentile(0.8),
    };
  } catch (error) {
    console.error('[METRICS] Unexpected error computing stats', error);
    return {
      ticker,
      modelType: params.modelType,
      sampleCount: 0,
      avgDurationMs: null,
      p50Ms: null,
      p80Ms: null,
    };
  }
}
