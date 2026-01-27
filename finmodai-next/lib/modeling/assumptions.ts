import type { ModelAndVizArtifact } from '@/lib/ai/schemas';

export type AssumptionsSummary = {
  placeholder_count: number;
  high_impact_placeholders: string[];
  notes: string;
};

/**
 * Analyzes model inputs and generates an assumptions summary
 * identifying placeholders, inferred values, and user-provided inputs.
 */
export function computeAssumptionsSummary(artifact: ModelAndVizArtifact): AssumptionsSummary {
  const { model } = artifact;
  const { inputs } = model;

  const placeholders: Array<{ key: string; label: string; source: string }> = [];
  const inferred: Array<{ key: string; label: string; source: string }> = [];
  const userProvided: Array<{ key: string; label: string; source: string }> = [];

  // Categorize inputs by source
  for (const input of inputs) {
    const source = (input as any).source || inferSource(input);
    const item = { key: input.key, label: input.label, source };

    if (source === 'placeholder') {
      placeholders.push(item);
    } else if (source === 'inferred') {
      inferred.push(item);
    } else {
      userProvided.push(item);
    }
  }

  // Identify high-impact placeholders (those affecting primary outputs)
  const highImpactPlaceholders: string[] = [];
  const primaryOutputs = model.outputs.slice(0, 3).map((o) => o.key.toLowerCase());
  const primaryLabels = model.outputs.slice(0, 3).map((o) => o.label.toLowerCase());

  for (const placeholder of placeholders) {
    const keyLower = placeholder.key.toLowerCase();
    const labelLower = placeholder.label.toLowerCase();

    // Check if this input likely affects primary outputs
    const isRevenueRelated = keyLower.includes('revenue') || keyLower.includes('sales') || labelLower.includes('revenue');
    const isGrowthRelated = keyLower.includes('growth') || keyLower.includes('rate') || labelLower.includes('growth');
    const isPriceRelated = keyLower.includes('price') || keyLower.includes('margin') || labelLower.includes('price');
    const isVolumeRelated = keyLower.includes('volume') || keyLower.includes('units') || labelLower.includes('volume');

    // Check if it's referenced in equations
    const referencedInEquations = model.equations?.some((eq) => {
      const def = eq.definition.toLowerCase();
      return def.includes(keyLower) || def.includes(labelLower);
    });

    if (isRevenueRelated || isGrowthRelated || isPriceRelated || isVolumeRelated || referencedInEquations) {
      highImpactPlaceholders.push(placeholder.label);
    }
  }

  // Build notes
  const notesParts: string[] = [];
  if (placeholders.length > 0) {
    notesParts.push(`${placeholders.length} placeholder assumption${placeholders.length > 1 ? 's' : ''} detected`);
  }
  if (inferred.length > 0) {
    notesParts.push(`${inferred.length} inferred value${inferred.length > 1 ? 's' : ''}`);
  }
  if (userProvided.length > 0) {
    notesParts.push(`${userProvided.length} user-provided input${userProvided.length > 1 ? 's' : ''}`);
  }

  const notes = notesParts.length > 0
    ? notesParts.join('; ') + '. ' + (highImpactPlaceholders.length > 0
        ? `High-impact placeholders: ${highImpactPlaceholders.slice(0, 3).join(', ')}${highImpactPlaceholders.length > 3 ? '...' : ''}`
        : 'Review assumptions before using model outputs.')
    : 'All assumptions appear to be user-provided or validated.';

  return {
    placeholder_count: placeholders.length,
    high_impact_placeholders: highImpactPlaceholders,
    notes,
  };
}

/**
 * Infer source from input properties if not explicitly set
 */
function inferSource(input: { key?: string; label?: string; value?: number | string | null; notes?: string }): 'user' | 'inferred' | 'placeholder' {
  const keyLower = (input.key || '').toLowerCase();
  const labelLower = (input.label || '').toLowerCase();
  const notesLower = (input.notes || '').toLowerCase();

  // Explicit placeholder markers
  if (
    notesLower.includes('placeholder') ||
    notesLower.includes('example') ||
    notesLower.includes('illustrative') ||
    notesLower.includes('assumed') ||
    keyLower.includes('baseline') ||
    keyLower.includes('index') ||
    keyLower.includes('example')
  ) {
    return 'placeholder';
  }

  // Inferred markers
  if (
    notesLower.includes('inferred') ||
    notesLower.includes('estimated') ||
    notesLower.includes('derived') ||
    notesLower.includes('computed') ||
    notesLower.includes('calculated')
  ) {
    return 'inferred';
  }

  // Default to user-provided if no clear markers
  return 'user';
}

