/**
 * Model Runs Tracking
 *
 * Tracks actual model generation runs (success/failure) for workspace snapshot.
 */

import 'server-only';

import { getSupabaseServerClient } from '@/lib/supabaseClient';

export type ModelRunStatus = 'success' | 'failed';

export type ModelRun = {
  id: string;
  user_id: string | null;
  model_id: string | null;
  ticker: string;
  model_type: string;
  status: ModelRunStatus;
  runtime_ms: number | null;
  error_message: string | null;
  created_at: string;
};

const isSchemaMissing = (error: any) => {
  const code = error?.code || error?.details;
  return typeof code === 'string' && (code.includes('42P01') || code.includes('42703'));
};

const isRlsViolation = (error: any) =>
  typeof error?.message === 'string' && error.message.toLowerCase().includes('row-level security');

/**
 * Create a run record (call at start of generation)
 */
export async function createModelRun(params: {
  ticker: string;
  modelType: string;
  modelId?: string | null;
  traceId?: string;
}): Promise<string | null> {
  try {
    const supabase = getSupabaseServerClient();
    
    // Get current user (if available)
    const { data: { user } } = await supabase.auth.getUser();
    
    const payload = {
      ticker: params.ticker.trim().toUpperCase(),
      model_type: params.modelType,
      model_id: params.modelId || null,
      user_id: user?.id || null,
      status: 'failed' as ModelRunStatus, // Default to failed, update on success
      runtime_ms: null,
      error_message: null,
      trace_id: params.traceId || null,
    };

    const { data, error } = await supabase
      .from('model_runs')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      if (isSchemaMissing(error)) {
        console.warn('[modelRuns] model_runs table missing, skipping run logging');
        return null;
      }
      if (isRlsViolation(error)) {
        console.warn('[modelRuns] RLS blocked model_runs insert, continuing without run record');
        return null;
      }
      console.error('[modelRuns] Failed to create run record:', error);
      return null;
    }

    return data?.id || null;
  } catch (error: any) {
    if (isSchemaMissing(error)) {
      console.warn('[modelRuns] model_runs table missing (caught), skipping run logging');
      return null;
    }
    if (isRlsViolation(error)) {
      console.warn('[modelRuns] RLS blocked model_runs insert (caught), continuing without run record');
      return null;
    }
    console.error('[modelRuns] Unexpected error creating run:', error?.message || error);
    return null;
  }
}

/**
 * Update run record on success
 */
export async function updateModelRunSuccess(params: {
  runId: string | null;
  runtimeMs: number;
}): Promise<void> {
  if (!params.runId) return;
  
  try {
    const supabase = getSupabaseServerClient();
    
    const { error } = await supabase
      .from('model_runs')
      .update({
        status: 'success',
        runtime_ms: Math.max(0, Math.round(params.runtimeMs)),
      })
      .eq('id', params.runId);

    if (error) {
      if (isSchemaMissing(error)) {
        console.warn('[modelRuns] model_runs table missing, skipping update');
        return;
      }
      console.error('[modelRuns] Failed to update run to success:', error);
    }
  } catch (error) {
    if (isSchemaMissing(error)) {
      console.warn('[modelRuns] model_runs table missing (caught), skipping update');
      return;
    }
    console.error('[modelRuns] Unexpected error updating run:', error);
  }
}

/**
 * Update run record on failure
 */
export async function updateModelRunFailed(params: {
  runId: string | null;
  errorMessage?: string;
}): Promise<void> {
  if (!params.runId) return;
  
  try {
    const supabase = getSupabaseServerClient();
    
    const { error } = await supabase
      .from('model_runs')
      .update({
        status: 'failed',
        error_message: params.errorMessage || null,
      })
      .eq('id', params.runId);

    if (error) {
      if (isSchemaMissing(error)) {
        console.warn('[modelRuns] model_runs table missing, skipping update');
        return;
      }
      console.error('[modelRuns] Failed to update run to failed:', error);
    }
  } catch (error) {
    if (isSchemaMissing(error)) {
      console.warn('[modelRuns] model_runs table missing (caught), skipping update');
      return;
    }
    console.error('[modelRuns] Unexpected error updating run:', error);
  }
}

/**
 * Get last successful run timestamp
 */
export async function getLastSuccessfulRun(): Promise<string | null> {
  try {
    const supabase = getSupabaseServerClient();
    
    const { data, error } = await supabase
      .from('model_runs')
      .select('created_at')
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return data.created_at;
  } catch (error) {
    console.error('[modelRuns] Error fetching last successful run:', error);
    return null;
  }
}

/**
 * Get average runtime from last N successful runs
 */
export async function getAverageRuntime(maxSamples: number = 20): Promise<number | null> {
  try {
    const supabase = getSupabaseServerClient();
    
    const { data, error } = await supabase
      .from('model_runs')
      .select('runtime_ms')
      .eq('status', 'success')
      .not('runtime_ms', 'is', null)
      .order('created_at', { ascending: false })
      .limit(maxSamples);

    if (error || !data || data.length === 0) {
      return null;
    }

    const runtimes = data
      .map((row) => (typeof row.runtime_ms === 'number' ? row.runtime_ms : null))
      .filter((value): value is number => typeof value === 'number' && value >= 0);

    if (runtimes.length === 0) {
      return null;
    }

    return Math.round(
      runtimes.reduce((sum, value) => sum + value, 0) / runtimes.length
    );
  } catch (error) {
    console.error('[modelRuns] Error fetching average runtime:', error);
    return null;
  }
}
