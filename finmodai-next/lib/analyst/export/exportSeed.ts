import type {
  AnalystGeneratedModelExportSeed,
  AnalystGeneratedModelPayload,
  AnalystGeneratedModelRecentRun,
} from '@/lib/analyst/types';

export function buildAnalystGeneratedModelRecentRun(input: {
  runId: string;
  versionNumber: number | null;
  createdAt: string;
  status: string;
}): AnalystGeneratedModelRecentRun {
  return {
    runId: input.runId,
    versionNumber: input.versionNumber,
    createdAt: input.createdAt,
    status: input.status,
  };
}

export function buildAnalystGeneratedModelExportSeed(
  payload: AnalystGeneratedModelPayload,
): AnalystGeneratedModelExportSeed {
  const { recentRun: _recentRun, ...seed } = payload;
  return seed;
}

export function rebuildAnalystGeneratedModelPayloadFromSeed(
  seed: AnalystGeneratedModelExportSeed,
  recentRun: AnalystGeneratedModelRecentRun | null,
): AnalystGeneratedModelPayload {
  return {
    ...seed,
    recentRun,
  };
}

export function isAnalystGeneratedModelExportSeed(value: unknown): value is AnalystGeneratedModelExportSeed {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    (
      row.modelType === 'DCF' ||
      row.modelType === 'THREE_STATEMENT' ||
      row.modelType === 'CAP_TABLE' ||
      row.modelType === 'SAAS_OPERATING_MODEL' ||
      row.modelType === 'COMPS' ||
      row.modelType === 'PRECEDENTS' ||
      row.modelType === 'LBO' ||
      row.modelType === 'FOOTBALL_FIELD' ||
      row.modelType === 'MERGER' ||
      row.modelType === 'DEBT_CAPACITY_LITE'
    ) &&
    typeof row.prompt === 'string' &&
    typeof row.title === 'string' &&
    Array.isArray(row.tabs) &&
    Array.isArray(row.keyOutputs) &&
    row.extractedInputs !== null &&
    typeof row.extractedInputs === 'object' &&
    row.defaultsUsed !== null &&
    typeof row.defaultsUsed === 'object' &&
    row.provenanceSummary !== null &&
    typeof row.provenanceSummary === 'object' &&
    Array.isArray(row.narrativeBlocks)
  );
}
