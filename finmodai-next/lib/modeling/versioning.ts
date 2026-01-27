import type { ModelAndVizArtifact } from '@/lib/ai/schemas';

export type ModelVersion = {
  id: string;
  artifact_id: string;
  user_id: string;
  created_at: string;
  label: string | null;
  notes: string | null;
  base_inputs: Array<{
    key: string;
    label: string;
    value: number | string;
    unit?: string;
    notes?: string;
    source?: 'user' | 'inferred' | 'placeholder';
  }>;
  scenario_overrides: Record<string, any> | null;
  formula_overrides: Array<{
    key: string;
    label: string;
    definition: string;
  }> | null;
  derived_key_outputs: Record<string, any>;
};

export type VersionComparison = {
  inputs_changed: Array<{
    key: string;
    label: string;
    before: any;
    after: any;
    delta?: number | string;
  }>;
  scenarios_changed: boolean;
  formulas_changed: Array<{
    key: string;
    label: string;
    before: string;
    after: string;
  }>;
  outputs_changed: Array<{
    key: string;
    label: string;
    before: any;
    after: any;
    delta?: number | string;
    delta_pct?: number;
  }>;
};

/**
 * Compare a version with the current artifact state
 */
export function compareVersionWithCurrent(
  version: ModelVersion,
  currentArtifact: ModelAndVizArtifact
): VersionComparison {
  const comparison: VersionComparison = {
    inputs_changed: [],
    scenarios_changed: false,
    formulas_changed: [],
    outputs_changed: [],
  };

  // Compare inputs
  const currentInputs = currentArtifact.model.inputs || [];
  const versionInputs = version.base_inputs || [];

  const currentInputsMap = new Map(currentInputs.map((inp) => [inp.key, inp]));
  const versionInputsMap = new Map(versionInputs.map((inp) => [inp.key, inp]));

  // Find changed inputs
  for (const [key, currentInp] of currentInputsMap) {
    const versionInp = versionInputsMap.get(key);
    if (!versionInp) {
      // Input was added
      comparison.inputs_changed.push({
        key,
        label: currentInp.label,
        before: null,
        after: currentInp.value,
      });
    } else if (versionInp.value !== currentInp.value) {
      // Input was modified
      const currentVal = typeof currentInp.value === 'number' ? currentInp.value : Number(currentInp.value);
      const versionVal = typeof versionInp.value === 'number' ? versionInp.value : Number(versionInp.value);

      let delta: number | string | undefined;
      if (typeof currentVal === 'number' && typeof versionVal === 'number' && !Number.isNaN(currentVal) && !Number.isNaN(versionVal)) {
        delta = currentVal - versionVal;
      } else {
        delta = `${currentInp.value} → ${versionInp.value}`;
      }

      comparison.inputs_changed.push({
        key,
        label: currentInp.label,
        before: versionInp.value,
        after: currentInp.value,
        delta,
      });
    }
  }

  // Find removed inputs
  for (const [key, versionInp] of versionInputsMap) {
    if (!currentInputsMap.has(key)) {
      comparison.inputs_changed.push({
        key,
        label: versionInp.label,
        before: versionInp.value,
        after: null,
      });
    }
  }

  // Compare formulas
  const currentFormulas = currentArtifact.model.equations || [];
  const versionFormulas = version.formula_overrides || [];

  const currentFormulasMap = new Map(currentFormulas.map((f) => [f.key, f]));
  const versionFormulasMap = new Map(versionFormulas.map((f) => [f.key, f]));

  for (const [key, currentFormula] of currentFormulasMap) {
    const versionFormula = versionFormulasMap.get(key);
    if (!versionFormula) {
      // Formula was added
      comparison.formulas_changed.push({
        key,
        label: currentFormula.label,
        before: '',
        after: currentFormula.definition,
      });
    } else if (versionFormula.definition !== currentFormula.definition) {
      // Formula was modified
      comparison.formulas_changed.push({
        key,
        label: currentFormula.label,
        before: versionFormula.definition,
        after: currentFormula.definition,
      });
    }
  }

  // Find removed formulas
  for (const [key, versionFormula] of versionFormulasMap) {
    if (!currentFormulasMap.has(key)) {
      comparison.formulas_changed.push({
        key,
        label: versionFormula.label,
        before: versionFormula.definition,
        after: '',
      });
    }
  }

  // Compare outputs (using derived_key_outputs from version)
  const currentSummary = currentArtifact.evaluation?.summary || [];
  const versionOutputs = version.derived_key_outputs || {};

  const currentSummaryMap = new Map(currentSummary.map((s) => [s.key, s]));
  const versionOutputsKeys = Object.keys(versionOutputs).filter((k) => !k.startsWith('_')); // Skip internal keys

  for (const key of versionOutputsKeys) {
    const versionOutput = versionOutputs[key];
    const currentOutput = currentSummaryMap.get(key);

    if (currentOutput) {
      const currentVal = typeof currentOutput.value === 'number' ? currentOutput.value : Number(currentOutput.value);
      const versionVal = typeof versionOutput.value === 'number' ? versionOutput.value : Number(versionOutput.value);

      if (typeof currentVal === 'number' && typeof versionVal === 'number' && !Number.isNaN(currentVal) && !Number.isNaN(versionVal) && versionVal !== 0) {
        const delta = currentVal - versionVal;
        const delta_pct = (delta / Math.abs(versionVal)) * 100;

        comparison.outputs_changed.push({
          key,
          label: versionOutput.label || key,
          before: versionVal,
          after: currentVal,
          delta,
          delta_pct,
        });
      } else if (currentOutput.value !== versionOutput.value) {
        comparison.outputs_changed.push({
          key,
          label: versionOutput.label || key,
          before: versionOutput.value,
          after: currentOutput.value,
        });
      }
    }
  }

  // Check scenario changes (if scenario_overrides exist)
  if (version.scenario_overrides) {
    comparison.scenarios_changed = true; // Simplified - could do deeper comparison
  }

  return comparison;
}

