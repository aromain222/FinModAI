import { getSupabaseServiceClient } from '@/lib/events/store';
import type {
  ExtractionSourceArtifact,
  FinancialExtractionJob,
  FinancialExtractionJobRequest,
  FinancialExtractionLane,
  FinancialExtractionStage,
  FinancialValidationFinding,
  FinancialValidationState,
  MappedModelInputs,
  NormalizedFinancialFact,
  ResolvedCompanyIdentity,
  ValidatedFinancialSnapshot,
} from '@/lib/data/financial-extraction/types';

type FinancialExtractionJobRow = {
  id: string;
  lane: FinancialExtractionLane;
  stage: FinancialExtractionStage;
  validation_state: FinancialValidationState | null;
  company_identifier: string | null;
  ticker: string | null;
  company_name: string | null;
  target_period_type: FinancialExtractionJobRequest['targetPeriodType'];
  target_model_type: string | null;
  file_ids_json: string[] | null;
  resolved_identity_json: ResolvedCompanyIdentity | null;
  source_artifacts_json: ExtractionSourceArtifact[] | null;
  facts_json: NormalizedFinancialFact[] | null;
  validation_findings_json: FinancialValidationFinding[] | null;
  mapped_model_inputs_json: MappedModelInputs | null;
  snapshot_json: ValidatedFinancialSnapshot | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function asRecord<T>(value: T | null | undefined): T | null {
  return value && typeof value === 'object' ? value : null;
}

function mapRow(row: FinancialExtractionJobRow): FinancialExtractionJob {
  return {
    id: row.id,
    lane: row.lane,
    stage: row.stage,
    validationState: row.validation_state,
    request: {
      lane: row.lane,
      ticker: row.ticker,
      companyIdentifier: row.company_identifier,
      companyName: row.company_name,
      fileIds: asArray(row.file_ids_json),
      targetPeriodType: row.target_period_type ?? null,
      targetModelType: row.target_model_type ?? null,
    },
    resolvedIdentity: asRecord(row.resolved_identity_json),
    sourceArtifacts: asArray(row.source_artifacts_json),
    facts: asArray(row.facts_json),
    validationFindings: asArray(row.validation_findings_json),
    mappedModelInputs: asRecord(row.mapped_model_inputs_json),
    snapshot: asRecord(row.snapshot_json),
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createFinancialExtractionJob(
  request: FinancialExtractionJobRequest,
): Promise<FinancialExtractionJob> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    throw new Error('Supabase service client unavailable for financial extraction jobs.');
  }

  const { data, error } = await supabase
    .from('financial_extraction_jobs')
    .insert({
      lane: request.lane,
      stage: 'queued',
      company_identifier: request.companyIdentifier ?? null,
      ticker: request.ticker?.trim().toUpperCase() ?? null,
      company_name: request.companyName?.trim() ?? null,
      target_period_type: request.targetPeriodType ?? null,
      target_model_type: request.targetModelType ?? null,
      file_ids_json: request.fileIds ?? [],
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create financial extraction job.');
  }

  return mapRow(data as FinancialExtractionJobRow);
}

export async function updateFinancialExtractionJob(
  jobId: string,
  patch: Partial<{
    stage: FinancialExtractionStage;
    validationState: FinancialValidationState | null;
    resolvedIdentity: ResolvedCompanyIdentity | null;
    sourceArtifacts: ExtractionSourceArtifact[];
    facts: NormalizedFinancialFact[];
    validationFindings: FinancialValidationFinding[];
    mappedModelInputs: MappedModelInputs | null;
    snapshot: ValidatedFinancialSnapshot | null;
    errorMessage: string | null;
  }>,
): Promise<FinancialExtractionJob> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    throw new Error('Supabase service client unavailable for financial extraction jobs.');
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.stage) updatePayload.stage = patch.stage;
  if ('validationState' in patch) updatePayload.validation_state = patch.validationState ?? null;
  if ('resolvedIdentity' in patch) updatePayload.resolved_identity_json = patch.resolvedIdentity ?? {};
  if ('sourceArtifacts' in patch) updatePayload.source_artifacts_json = patch.sourceArtifacts ?? [];
  if ('facts' in patch) updatePayload.facts_json = patch.facts ?? [];
  if ('validationFindings' in patch) updatePayload.validation_findings_json = patch.validationFindings ?? [];
  if ('mappedModelInputs' in patch) updatePayload.mapped_model_inputs_json = patch.mappedModelInputs ?? {};
  if ('snapshot' in patch) updatePayload.snapshot_json = patch.snapshot ?? {};
  if ('errorMessage' in patch) updatePayload.error_message = patch.errorMessage ?? null;

  const { data, error } = await supabase
    .from('financial_extraction_jobs')
    .update(updatePayload)
    .eq('id', jobId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to update financial extraction job.');
  }

  return mapRow(data as FinancialExtractionJobRow);
}

export async function getFinancialExtractionJob(jobId: string): Promise<FinancialExtractionJob | null> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return null;

  const normalizedJobId = String(jobId ?? '').trim();
  if (!normalizedJobId) return null;

  const { data, error } = await supabase
    .from('financial_extraction_jobs')
    .select('*')
    .eq('id', normalizedJobId)
    .maybeSingle();

  if (error || !data) return null;
  return mapRow(data as FinancialExtractionJobRow);
}

export async function listFinancialExtractionJobs(params: {
  lane?: FinancialExtractionLane | null;
  ticker?: string | null;
  companyName?: string | null;
  targetModelType?: string | null;
  limit?: number;
}): Promise<FinancialExtractionJob[]> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return [];

  const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);
  let query = supabase
    .from('financial_extraction_jobs')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (params.lane) {
    query = query.eq('lane', params.lane);
  }
  if (params.ticker?.trim()) {
    query = query.eq('ticker', params.ticker.trim().toUpperCase());
  }
  if (params.companyName?.trim()) {
    query = query.ilike('company_name', params.companyName.trim());
  }
  if (params.targetModelType?.trim()) {
    query = query.eq('target_model_type', params.targetModelType.trim());
  }

  const { data, error } = await query;
  if (error || !Array.isArray(data)) return [];
  return data.map((row) => mapRow(row as FinancialExtractionJobRow));
}
