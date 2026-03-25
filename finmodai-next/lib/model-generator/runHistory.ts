import { getSupabaseServiceClient } from '@/lib/events/store';
import type { ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';

export type ProvenanceSummary = {
  sourceType: 'cached_real' | 'demo_fallback' | 'prompt_defaults' | 'inferred';
  sources: string[];
  asOfDate: string | null;
  lastSynced: string | null;
  fallbackUsed: string[];
};

export type ComparisonSummary = {
  previousVersionNumber: number | null;
  changedKeys: string[];
  currentVersionNumber: number | null;
};

export type PromptRunVersion = {
  id: string;
  runId: string;
  versionNumber: number;
  status: string;
  assumptions: Record<string, unknown>;
  defaultsUsed: Record<string, unknown>;
  extractedInputs: Record<string, unknown>;
  provenance: ProvenanceSummary | null;
  comparison: ComparisonSummary | null;
  workbookFilename: string | null;
  createdAt: string;
};

export type PromptRunRecord = {
  id: string;
  surface: 'model_generator' | 'analyst_chat';
  sessionId: string | null;
  prompt: string;
  modelType: ModelGeneratorType;
  companyName: string | null;
  ticker: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  latestVersion: PromptRunVersion | null;
};

type SaveRunInput = {
  surface: 'model_generator' | 'analyst_chat';
  sessionId?: string | null;
  prompt: string;
  modelType: ModelGeneratorType;
  companyName?: string | null;
  ticker?: string | null;
  status: 'previewed' | 'generated';
  assumptions: Record<string, unknown>;
  defaultsUsed: Record<string, unknown>;
  extractedInputs: Record<string, unknown>;
  provenance: ProvenanceSummary | null;
  workbookFilename?: string | null;
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function mapVersion(row: any): PromptRunVersion {
  return {
    id: row.id,
    runId: row.run_id,
    versionNumber: Number(row.version_number ?? 1),
    status: String(row.status ?? 'previewed'),
    assumptions: toRecord(row.assumptions_json),
    defaultsUsed: toRecord(row.defaults_json),
    extractedInputs: toRecord(row.extracted_inputs_json),
    provenance: row.provenance_json ? (row.provenance_json as ProvenanceSummary) : null,
    comparison: row.comparison_json ? (row.comparison_json as ComparisonSummary) : null,
    workbookFilename: typeof row.workbook_filename === 'string' ? row.workbook_filename : null,
    createdAt: String(row.created_at),
  };
}

function mapRun(row: any): PromptRunRecord {
  const latestVersionRaw = Array.isArray(row.prompt_model_run_versions) ? row.prompt_model_run_versions[0] : null;
  return {
    id: row.id,
    surface: row.surface,
    sessionId: row.session_id ?? null,
    prompt: row.prompt,
    modelType: row.model_type,
    companyName: row.company_name ?? null,
    ticker: row.ticker ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestVersion: latestVersionRaw ? mapVersion(latestVersionRaw) : null,
  };
}

function extractComparableAssumptions(inputs: Record<string, unknown>): Record<string, unknown> {
  const skip = new Set(['modelType', 'source', 'companyName', 'ticker', 'companyType', 'peerTickers', 'peerSet', 'transactions', 'ranges', 'sourceType']);
  return Object.fromEntries(Object.entries(inputs).filter(([key]) => !skip.has(key)));
}

function computeChangedKeys(previous: Record<string, unknown>, current: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  return Array.from(keys).filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(current[key]));
}

async function getOrCreateRun(input: SaveRunInput): Promise<{ runId: string; previousVersion: PromptRunVersion | null }> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    throw new Error('Supabase service client unavailable for prompt model history.');
  }

  const baseQuery = supabase
    .from('prompt_model_runs')
    .select('*,prompt_model_run_versions(*)')
    .eq('surface', input.surface)
    .eq('model_type', input.modelType)
    .order('created_at', { ascending: false })
    .limit(1);

  let query = baseQuery;
  if (input.sessionId) query = query.eq('session_id', input.sessionId);
  if (input.ticker) query = query.eq('ticker', input.ticker);
  else if (input.companyName) query = query.eq('company_name', input.companyName);

  const existingResult = await query.maybeSingle();
  if (existingResult.data) {
    const previousVersion = Array.isArray(existingResult.data.prompt_model_run_versions)
      ? existingResult.data.prompt_model_run_versions
          .map(mapVersion)
          .sort((left: PromptRunVersion, right: PromptRunVersion) => right.versionNumber - left.versionNumber)[0] ?? null
      : null;

    await supabase
      .from('prompt_model_runs')
      .update({
        prompt: input.prompt,
        status: input.status,
        company_name: input.companyName ?? null,
        ticker: input.ticker ?? null,
      })
      .eq('id', existingResult.data.id);

    return { runId: existingResult.data.id, previousVersion };
  }

  const insertResult = await supabase
    .from('prompt_model_runs')
    .insert({
      surface: input.surface,
      session_id: input.sessionId ?? null,
      prompt: input.prompt,
      model_type: input.modelType,
      company_name: input.companyName ?? null,
      ticker: input.ticker ?? null,
      status: input.status,
    })
    .select('*')
    .single();

  if (insertResult.error || !insertResult.data) {
    throw new Error(insertResult.error?.message || 'Failed to create prompt model run.');
  }

  return { runId: insertResult.data.id, previousVersion: null };
}

export async function savePromptModelRunVersion(input: SaveRunInput): Promise<{ runId: string; version: PromptRunVersion }> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    throw new Error('Supabase service client unavailable for prompt model history.');
  }

  const { runId, previousVersion } = await getOrCreateRun(input);
  const nextVersionNumber = (previousVersion?.versionNumber ?? 0) + 1;
  const assumptions = extractComparableAssumptions(input.extractedInputs);
  const changedKeys = previousVersion ? computeChangedKeys(previousVersion.assumptions, assumptions) : [];
  const comparison: ComparisonSummary | null =
    previousVersion || changedKeys.length > 0
      ? {
          previousVersionNumber: previousVersion?.versionNumber ?? null,
          currentVersionNumber: nextVersionNumber,
          changedKeys,
        }
      : null;

  const versionResult = await supabase
    .from('prompt_model_run_versions')
    .insert({
      run_id: runId,
      version_number: nextVersionNumber,
      status: input.status,
      assumptions_json: assumptions,
      defaults_json: input.defaultsUsed,
      extracted_inputs_json: input.extractedInputs,
      provenance_json: input.provenance ?? {},
      comparison_json: comparison,
      workbook_filename: input.workbookFilename ?? null,
    })
    .select('*')
    .single();

  if (versionResult.error || !versionResult.data) {
    throw new Error(versionResult.error?.message || 'Failed to persist prompt model run version.');
  }

  await supabase.from('prompt_model_runs').update({ status: input.status }).eq('id', runId);
  return { runId, version: mapVersion(versionResult.data) };
}

export async function getRecentPromptModelRuns(params: {
  surface?: 'model_generator' | 'analyst_chat';
  sessionId?: string | null;
  limit?: number;
}): Promise<PromptRunRecord[]> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return [];

  let query = supabase
    .from('prompt_model_runs')
    .select('*,prompt_model_run_versions(*)')
    .order('updated_at', { ascending: false })
    .limit(params.limit ?? 8);

  if (params.surface) query = query.eq('surface', params.surface);
  if (params.sessionId) query = query.eq('session_id', params.sessionId);

  const result = await query;
  if (result.error || !Array.isArray(result.data)) return [];

  return result.data.map(mapRun).map((run) => ({
    ...run,
    latestVersion: run.latestVersion,
  }));
}

export async function getLatestComparableRun(params: {
  surface: 'model_generator' | 'analyst_chat';
  sessionId?: string | null;
  modelType: ModelGeneratorType;
  companyName?: string | null;
  ticker?: string | null;
}): Promise<PromptRunRecord | null> {
  const rows = await getRecentPromptModelRuns({ surface: params.surface, sessionId: params.sessionId, limit: 12 });
  return (
    rows.find((row) => {
      if (row.modelType !== params.modelType) return false;
      if (params.ticker) return row.ticker === params.ticker;
      if (params.companyName) return row.companyName === params.companyName;
      return false;
    }) ?? null
  );
}
