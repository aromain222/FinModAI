import { buildMissingInputSpecs } from './missingInputSpecs';
import type { MissingInputSpec } from './missingInputSpecs';

export type RequiredInputSpec = MissingInputSpec & {
  reason?: string;
};

export function buildRequiredInputs(missingKeys: string[], reason?: string): RequiredInputSpec[] {
  const specs = buildMissingInputSpecs('generic', missingKeys);
  return specs.map((spec) => ({
    ...spec,
    hint: spec.hint || reason,
    reason: spec.hint || reason,
  }));
}
