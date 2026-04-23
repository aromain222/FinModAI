import {
  buildMissingInputSpecs,
  getModelRequiredInputKeys,
  getModelRequiredInputSpecs,
  normalizeMissingInputKeys,
} from './missingInputSpecs';
import type { MissingInputSpec } from './missingInputSpecs';

export type RequiredInputSpec = MissingInputSpec & {
  reason?: string;
};

export type ExportEligibility = {
  ok: boolean;
  missing: string[];
  message: string;
};

export type RequiredInputState = {
  missing: string[];
  requiredInputs: RequiredInputSpec[];
  isComputable: boolean;
  exportEligibility: ExportEligibility;
};

function withReason(specs: MissingInputSpec[], reason?: string): RequiredInputSpec[] {
  return specs.map((spec) => ({
    ...spec,
    hint: spec.hint || reason,
    reason: spec.hint || reason,
  }));
}

export function buildRequiredInputs(missingKeys: string[], reason?: string): RequiredInputSpec[] {
  const specs = buildMissingInputSpecs('generic', missingKeys);
  return withReason(specs, reason);
}

export function buildRequiredInputsForModel(
  modelType: string,
  missingKeys: string[],
  reason?: string
): RequiredInputSpec[] {
  const specs = buildMissingInputSpecs(modelType, missingKeys);
  return withReason(specs, reason);
}

export function getAllRequiredInputsForModel(modelType: string, reason?: string): RequiredInputSpec[] {
  return withReason(getModelRequiredInputSpecs(modelType), reason);
}

export function getAllRequiredInputKeysForModel(modelType: string): string[] {
  return normalizeMissingInputKeys(getModelRequiredInputKeys(modelType));
}

export function buildRequiredInputState(
  modelType: string,
  missingKeys: string[],
  reason?: string
): RequiredInputState {
  const missing = normalizeMissingInputKeys(missingKeys);
  const requiredInputs = buildRequiredInputsForModel(modelType, missing, reason);
  const isComputable = missing.length === 0;
  return {
    missing,
    requiredInputs,
    isComputable,
    exportEligibility: {
      ok: isComputable,
      missing,
      message:
        reason ||
        (isComputable
          ? 'All required inputs are present for workbook generation.'
          : 'Complete the missing required inputs before generating or exporting the workbook.'),
    },
  };
}
