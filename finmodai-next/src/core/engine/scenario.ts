import type { ModelInputs } from '@/src/core/contracts/modelInputs';

export interface Scenario {
  id: string;
  name: string;
  assumptionsOverride?: Partial<ModelInputs['assumptions']>;
  createdAt: string;
}

const cloneAssumptions = (assumptions: ModelInputs['assumptions']): ModelInputs['assumptions'] => ({
  ...assumptions,
  growth: Array.isArray(assumptions.growth) ? [...assumptions.growth] : assumptions.growth,
  margins: Array.isArray(assumptions.margins) ? [...assumptions.margins] : assumptions.margins,
});

export function applyScenarioToInputs(base: ModelInputs, scenario?: Scenario): ModelInputs {
  if (!scenario?.assumptionsOverride) {
    return {
      ...base,
      assumptions: cloneAssumptions(base.assumptions),
      metadata: {
        ...base.metadata,
        scenarioId: scenario?.id ?? base.metadata.scenarioId,
      },
    };
  }

  return {
    ...base,
    assumptions: {
      ...cloneAssumptions(base.assumptions),
      ...scenario.assumptionsOverride,
    },
    metadata: {
      ...base.metadata,
      scenarioId: scenario.id,
    },
  };
}
