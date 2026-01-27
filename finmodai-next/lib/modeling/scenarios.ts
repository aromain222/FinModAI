import 'server-only';

import type { ModelAndVizArtifact } from '@/lib/ai/schemas';
import type { DependencyGraph } from './graph';
import { buildDependencyGraph } from './graph';

/**
 * Scenario Configuration
 */
export type Scenario = {
  id: string;
  name: string; // 'Base', 'Upside', 'Downside'
  inputShocks: Record<string, number>; // input key -> shock multiplier (1.0 = no change, 1.2 = +20%, 0.8 = -20%)
  description?: string;
};

/**
 * Generate automatic scenarios: Base, Upside, Downside
 * Identifies 1-2 key inputs to shock and creates scenarios
 */
export function generateScenarios(
  artifact: ModelAndVizArtifact,
  shockPercent: number = 0.2 // 20% default shock
): Scenario[] {
  const { model } = artifact;
  const graph = buildDependencyGraph(artifact);

  // Identify key inputs to shock
  // Priority: inputs that are referenced by many outputs or are in the objective metric path
  const keyInputs = identifyKeyInputs(artifact, graph, 2);

  if (keyInputs.length === 0) {
    // No inputs to shock - return only Base scenario
    return [
      {
        id: 'base',
        name: 'Base',
        inputShocks: {},
        description: 'Base case with no input shocks',
      },
    ];
  }

  const scenarios: Scenario[] = [
    {
      id: 'base',
      name: 'Base',
      inputShocks: {},
      description: 'Base case with no input shocks',
    },
  ];

  // Create Upside scenario (positive shocks)
  const upsideShocks: Record<string, number> = {};
  for (const inputKey of keyInputs) {
    // For upside: increase growth rates, margins, positive inputs; decrease costs, churn
    const input = model.inputs.find(i => i.key === inputKey);
    if (input) {
      // Determine shock direction based on input type/key
      const isPositive = isPositiveShock(input.key, input.label);
      upsideShocks[inputKey] = isPositive ? 1 + shockPercent : 1 - shockPercent;
    } else {
      upsideShocks[inputKey] = 1 + shockPercent; // Default to positive
    }
  }

  scenarios.push({
    id: 'upside',
    name: 'Upside',
    inputShocks: upsideShocks,
    description: `Optimistic scenario: ${keyInputs.map(k => {
      const input = model.inputs.find(i => i.key === k);
      return input?.label || k;
    }).join(', ')} shocked`,
  });

  // Create Downside scenario (negative shocks)
  const downsideShocks: Record<string, number> = {};
  for (const inputKey of keyInputs) {
    const input = model.inputs.find(i => i.key === inputKey);
    if (input) {
      const isPositive = isPositiveShock(input.key, input.label);
      // Opposite of upside
      downsideShocks[inputKey] = isPositive ? 1 - shockPercent : 1 + shockPercent;
    } else {
      downsideShocks[inputKey] = 1 - shockPercent; // Default to negative
    }
  }

  scenarios.push({
    id: 'downside',
    name: 'Downside',
    inputShocks: downsideShocks,
    description: `Pessimistic scenario: ${keyInputs.map(k => {
      const input = model.inputs.find(i => i.key === k);
      return input?.label || k;
    }).join(', ')} shocked`,
  });

  return scenarios;
}

/**
 * Identify key inputs to shock
 * Prioritizes inputs that:
 * - Are in the dependency path of the objective metric
 * - Are referenced by many outputs
 * - Have meaningful impact (growth rates, margins, volumes)
 */
function identifyKeyInputs(
  artifact: ModelAndVizArtifact,
  graph: DependencyGraph,
  maxShocks: number = 2
): string[] {
  const { model } = artifact;
  const inputScores = new Map<string, number>();

  // Score each input based on:
  // 1. Is it in the objective metric path?
  // 2. How many outputs depend on it?
  // 3. Is it a "key driver" (growth, margin, volume, price, churn, etc.)?

  const objectiveKey = model.objective_metric_key;
  
  for (const input of model.inputs) {
    let score = 0;

    // Check if input is a key driver based on name/label
    if (isKeyDriver(input.key, input.label)) {
      score += 10;
    }

    // Check how many outputs depend on this input (transitively)
    const node = graph.nodes.get(input.key);
    if (node) {
      score += node.dependents.length * 2;
    }

    // Check if input is in objective metric path
    if (objectiveKey) {
      const objectiveNode = graph.nodes.get(objectiveKey);
      if (objectiveNode && objectiveNode.dependencies.includes(input.key)) {
        score += 20;
      }
    }

    inputScores.set(input.key, score);
  }

  // Sort by score and return top N
  const sorted = Array.from(inputScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxShocks)
    .map(([key]) => key)
    .filter(key => {
      // Only include inputs with meaningful scores
      const score = inputScores.get(key) || 0;
      return score > 5;
    });

  return sorted;
}

/**
 * Check if an input is a "key driver" based on naming patterns
 */
function isKeyDriver(key: string, label: string): boolean {
  const text = `${key} ${label}`.toLowerCase();
  
  const patterns = [
    'growth',
    'rate',
    'margin',
    'price',
    'volume',
    'units',
    'customers',
    'churn',
    'cac',
    'ltv',
    'elasticity',
    'revenue',
    'cost',
  ];

  return patterns.some(pattern => text.includes(pattern));
}

/**
 * Determine if shocking an input positively (increasing) is good for the model
 */
function isPositiveShock(key: string, label: string): boolean {
  const text = `${key} ${label}`.toLowerCase();
  
  // Positive shocks: growth, margin, price, volume, customers, expansion
  const positivePatterns = [
    'growth',
    'margin',
    'price',
    'volume',
    'units',
    'customers',
    'expansion',
    'arr',
    'mrr',
    'arpu',
  ];

  // Negative shocks: costs, churn, cogs, opex, expenses
  const negativePatterns = [
    'churn',
    'cost',
    'cogs',
    'opex',
    'expense',
    'cac',
  ];

  if (positivePatterns.some(p => text.includes(p))) {
    return true;
  }

  if (negativePatterns.some(p => text.includes(p))) {
    return false;
  }

  // Default: assume positive (growth rates, margins, etc.)
  return true;
}

/**
 * Apply scenario shocks to input values
 */
export function applyScenarioShocks(
  inputs: Array<{ key: string; value: number }>,
  scenario: Scenario
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const input of inputs) {
    const shock = scenario.inputShocks[input.key];
    if (shock !== undefined) {
      result[input.key] = input.value * shock;
    } else {
      result[input.key] = input.value;
    }
  }

  return result;
}

