import 'server-only';

import { evaluate } from 'mathjs';
import type { ModelAndVizArtifact } from '@/lib/ai/schemas';
import { buildDependencyGraph, type DependencyGraph } from './graph';
import { validateModel, type ValidationResult } from './validate';
import { generateScenarios, applyScenarioShocks, type Scenario } from './scenarios';
import { checkModelSanity, computeDecisionSignal, applyClampedInputs, type DecisionSignal, type SanityResult } from './sanity';

/**
 * Evaluation Output Schema
 */
export type EvaluationOutput = {
  rows: Array<Record<string, number | string | null>>;
  series: Record<string, number[]>; // Variable key -> time series (may include scenario prefixes)
  charts: Array<{
    name: string;
    chartType: 'line' | 'bar';
    xKey: string;
    yKey: string | string[]; // Single key or array for multi-line charts
    data: Array<Record<string, any>>;
    scenarios?: string[]; // Scenario IDs for multi-line charts
  }>;
  graph: {
    nodes: Array<{
      key: string;
      definition: string;
      dependencies: string[];
      dependents: string[];
    }>;
    edges: Array<{
      from: string;
      to: string;
    }>;
  };
  validation: ValidationResult;
  scenarios?: Scenario[]; // Generated scenarios
  sanity?: SanityResult; // Sanity check results
  decision_signal?: DecisionSignal; // Decision guidance based on objective metric
};

/**
 * Evaluator cache
 */
const evaluatorCache = new Map<string, DependencyGraph>();

/**
 * Generate cache key from artifact structure
 */
function getCacheKey(artifact: ModelAndVizArtifact): string {
  const { model } = artifact;
  const equationKeys = (model.equations || []).map((e) => `${e.key}:${e.definition}`).sort().join('|');
  const outputKeys = model.outputs.map((o) => o.key).sort().join('|');
  return `${model.kind}:${equationKeys}:${outputKeys}`;
}

/**
 * Get or build dependency graph (cached)
 */
function getDependencyGraph(artifact: ModelAndVizArtifact): DependencyGraph {
  const cacheKey = getCacheKey(artifact);
  let graph = evaluatorCache.get(cacheKey);

  if (!graph) {
    graph = buildDependencyGraph(artifact);
    evaluatorCache.set(cacheKey, graph);
  }

  return graph;
}

/**
 * Parse and normalize formula definition for evaluation
 * Handles time indexing: x[t], x[t-1]
 * Returns a string with variable references replaced with actual values
 */
function normalizeFormula(
  definition: string,
  periodIndex: number,
  series: Map<string, number[]>,
  currentValues: Record<string, number>
): string {
  if (!definition) return '0';

  let formula = definition.trim();

  // Replace time-indexed references: x[t-1], x[t-2], etc. (do this first, before simple var replacement)
  formula = formula.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\[t\s*-\s*(\d+)\]/g, (match, varName, offset) => {
    const offsetNum = parseInt(offset, 10);
    const targetIndex = periodIndex - offsetNum;
    if (targetIndex < 0) return '0'; // Before time series starts
    
    const varSeries = series.get(varName);
    if (varSeries && varSeries[targetIndex] !== undefined && Number.isFinite(varSeries[targetIndex])) {
      return String(varSeries[targetIndex]);
    }
    return '0';
  });

  // Replace current time references: x[t] → use current value
  formula = formula.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\[t\]/g, (match, varName) => {
    // Use current value if available in currentValues (already computed)
    if (currentValues[varName] !== undefined && Number.isFinite(currentValues[varName])) {
      return String(currentValues[varName]);
    }
    
    // Otherwise use series value
    const varSeries = series.get(varName);
    if (varSeries && varSeries[periodIndex] !== undefined && Number.isFinite(varSeries[periodIndex])) {
      return String(varSeries[periodIndex]);
    }
    return '0';
  });

  // Replace simple variable references (but preserve function names and constants)
  // We need to be careful not to replace function names like max(), min(), abs()
  // Strategy: only replace variables that are NOT followed by '('
  const mathFunctions = ['abs', 'max', 'min', 'round', 'sqrt', 'pow', 'exp', 'log', 'sin', 'cos', 'tan', 'if', 'then', 'else', 'and', 'or', 'not'];
  const constants = ['pi', 'e'];
  const allReserved = new Set([...mathFunctions, ...constants]);

  // Split formula into tokens while preserving function calls
  // More careful replacement: only replace standalone variable references
  formula = formula.replace(/\b([a-zA-Z_][a-zA-Z0-9_]+)\b/g, (match, varName) => {
    // Skip if it's a reserved word (function or constant)
    if (allReserved.has(varName.toLowerCase())) {
      return match;
    }

    // Skip if it's already been replaced (contains brackets or is a number)
    const context = formula.substring(Math.max(0, formula.indexOf(match) - 1), Math.min(formula.length, formula.indexOf(match) + match.length + 1));
    if (context.includes('[') || context.includes(']') || !isNaN(Number(match))) {
      return match;
    }

    // Check if it's followed by '(' - if so, it's a function call, not a variable
    const matchIndex = formula.indexOf(match, formula.lastIndexOf(varName));
    if (matchIndex !== -1) {
      const afterMatch = formula.substring(matchIndex + match.length).trim();
      if (afterMatch.startsWith('(')) {
        return match; // It's a function call
      }
    }

    // Use currentValues if available (for variables computed earlier in this period)
    if (currentValues[varName] !== undefined && Number.isFinite(currentValues[varName])) {
      return String(currentValues[varName]);
    }

    // Otherwise use series value
    const varSeries = series.get(varName);
    if (varSeries && varSeries[periodIndex] !== undefined && Number.isFinite(varSeries[periodIndex])) {
      return String(varSeries[periodIndex]);
    }
    
    return '0'; // Default to 0 if not found
  });

  return formula;
}

/**
 * Evaluate a formula using mathjs
 */
function evaluateFormula(
  definition: string,
  periodIndex: number,
  series: Map<string, number[]>,
  currentValues: Record<string, number>
): number {
  try {
    // Normalize formula (replace variable references with actual values)
    const formula = normalizeFormula(definition, periodIndex, series, currentValues);

    // Build scope for mathjs evaluation
    // mathjs supports max/min with multiple arguments natively
    const scope: Record<string, any> = {
      // Math functions - mathjs handles max/min/abs natively, but we provide wrappers for safety
      abs: (x: number) => (typeof x === 'number' ? Math.abs(x) : 0),
      max: (...args: any[]) => {
        const numbers = args.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
        return numbers.length > 0 ? Math.max(...numbers) : 0;
      },
      min: (...args: any[]) => {
        const numbers = args.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
        return numbers.length > 0 ? Math.min(...numbers) : 0;
      },
      round: (x: number) => (typeof x === 'number' ? Math.round(x) : 0),
      sqrt: (x: number) => (typeof x === 'number' && x >= 0 ? Math.sqrt(x) : 0),
      pow: (x: number, y: number) => (typeof x === 'number' && typeof y === 'number' ? Math.pow(x, y) : 0),
      exp: (x: number) => (typeof x === 'number' ? Math.exp(x) : 0),
      log: (x: number) => (typeof x === 'number' && x > 0 ? Math.log(x) : 0),
      sin: (x: number) => (typeof x === 'number' ? Math.sin(x) : 0),
      cos: (x: number) => (typeof x === 'number' ? Math.cos(x) : 0),
      tan: (x: number) => (typeof x === 'number' ? Math.tan(x) : 0),
      
      // Constants
      pi: Math.PI,
      e: Math.E,
      
      // Current period index (may be used in formulas)
      t: periodIndex,
    };
    
    // Handle ternary operator support (mathjs doesn't have native ternary)
    // Replace ? : with conditional evaluation
    let finalFormula = formula;
    if (formula.includes('?')) {
      // Handle ternary: condition ? trueValue : falseValue
      const ternaryMatch = formula.match(/^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
      if (ternaryMatch) {
        const [, condition, trueValue, falseValue] = ternaryMatch;
        try {
          const conditionResult = evaluate(condition, scope);
          if (conditionResult) {
            finalFormula = trueValue.trim();
          } else {
            finalFormula = falseValue.trim();
          }
        } catch {
          // If ternary evaluation fails, try evaluating the whole thing as-is
          finalFormula = formula;
        }
      }
    }

    // Evaluate using mathjs
    const result = evaluate(finalFormula, scope);
    
    if (typeof result === 'number' && Number.isFinite(result)) {
      return result;
    }
    
    return 0;
  } catch (error) {
    // Formula evaluation failed
    console.warn(`[evaluator] Formula evaluation failed: ${definition}`, error);
    return 0;
  }
}

/**
 * Evaluate model across all periods
 * If buildModel=true (indicated by generateScenarios=true), automatically generates and evaluates Base/Upside/Downside scenarios
 */
export function evaluateModel(
  artifact: ModelAndVizArtifact,
  inputOverrides?: Record<string, number>,
  options?: {
    generateScenarios?: boolean; // Auto-generate scenarios if true
    scenarios?: Scenario[]; // Pre-defined scenarios (if not generating)
  }
): EvaluationOutput {
  const startTime = performance.now();
  const { model } = artifact;

  // Validate model first
  const validation = validateModel(artifact);
  if (!validation.passed) {
    // Return empty output if validation failed
    return {
      rows: [],
      series: {},
      charts: [],
      graph: {
        nodes: [],
        edges: [],
      },
      validation,
    };
  }

  // Run sanity checks and apply clamped inputs
  const sanityResult = checkModelSanity(artifact);
  let sanitizedArtifact = artifact;
  if (Object.keys(sanityResult.clamped_inputs).length > 0) {
    sanitizedArtifact = applyClampedInputs(artifact, sanityResult.clamped_inputs);
  }

  // Get dependency graph
  const graph = getDependencyGraph(sanitizedArtifact);

  // Generate scenarios if requested
  let scenarios: Scenario[] = [];
  const shouldGenerateScenarios = options?.generateScenarios ?? false;
  if (shouldGenerateScenarios) {
    scenarios = generateScenarios(sanitizedArtifact);
  } else if (options?.scenarios) {
    scenarios = options.scenarios;
  }

  // If no scenarios, evaluate single base case
  if (scenarios.length === 0) {
    const singleResult = evaluateSingleScenario(sanitizedArtifact, graph, inputOverrides, validation, startTime);
    
    // Add sanity checks and decision signal
    const finalSanity = checkModelSanity(sanitizedArtifact, singleResult);
    const decisionSignal = computeDecisionSignal(sanitizedArtifact, singleResult);
    
    return {
      ...singleResult,
      sanity: finalSanity,
      decision_signal: decisionSignal || undefined,
    };
  }

  // Evaluate each scenario
  const allRows: Array<Record<string, number | string | null>> = [];
  const allSeries: Record<string, number[]> = {};
  const periods = sanitizedArtifact.model.index.periods;

  for (const scenario of scenarios) {
    // Apply scenario shocks to inputs (use sanitized artifact inputs)
    const scenarioInputs = applyScenarioShocks(
      sanitizedArtifact.model.inputs.map(i => ({ key: i.key, value: inputOverrides?.[i.key] ?? i.value })),
      scenario
    );

    // Merge with overrides
    const mergedInputs = { ...scenarioInputs, ...inputOverrides };

    // Evaluate this scenario
    const scenarioResult = evaluateSingleScenario(sanitizedArtifact, graph, mergedInputs, validation, startTime);

    // Prefix series keys with scenario name
    for (const [key, values] of Object.entries(scenarioResult.series)) {
      const prefixedKey = `${key}__${scenario.name}`;
      allSeries[prefixedKey] = values;
    }

    // Merge rows (add scenario column if multiple scenarios)
    if (scenarios.length > 1) {
      for (const row of scenarioResult.rows) {
        allRows.push({
          ...row,
          scenario: scenario.name,
        });
      }
    } else {
      allRows.push(...scenarioResult.rows);
    }
  }

  // Build multi-line charts for outputs across scenarios (use sanitized artifact model)
  const charts = buildMultiScenarioCharts(sanitizedArtifact.model, allSeries, periods, scenarios);

  // Build graph representation
  const graphNodes = Array.from(graph.nodes.values()).map((node) => ({
    key: node.key,
    definition: node.definition,
    dependencies: node.dependencies,
    dependents: node.dependents,
  }));

  const graphEdges: Array<{ from: string; to: string }> = [];
  for (const [key, node] of graph.nodes) {
    for (const dep of node.dependencies) {
      graphEdges.push({ from: dep, to: key });
    }
  }

  // Create evaluation output for sanity check and decision signal
  const tempOutput: EvaluationOutput = {
    rows: allRows,
    series: allSeries,
    charts,
    graph: {
      nodes: graphNodes,
      edges: graphEdges,
    },
    validation,
    scenarios,
  };

  // Re-run sanity checks on evaluation output (check for exponential blowups)
  const finalSanity = checkModelSanity(sanitizedArtifact, tempOutput);
  
  // Compute decision signal
  const decisionSignal = computeDecisionSignal(sanitizedArtifact, tempOutput);

  const elapsed = performance.now() - startTime;
  if (elapsed > 50) {
    console.warn(`[evaluator] Evaluation took ${elapsed.toFixed(1)}ms`);
  }

  return {
    ...tempOutput,
    sanity: finalSanity,
    decision_signal: decisionSignal || undefined,
  };
}

/**
 * Evaluate model for a single scenario (no scenario prefixing)
 */
function evaluateSingleScenario(
  artifact: ModelAndVizArtifact,
  graph: DependencyGraph,
  inputOverrides: Record<string, number> | undefined,
  validation: ValidationResult,
  startTime: number
): Omit<EvaluationOutput, 'scenarios'> {
  const { model } = artifact;

  // Build input values map (with overrides)
  const inputValues: Record<string, number> = {};
  for (const input of model.inputs) {
    const overrideValue = inputOverrides?.[input.key];
    inputValues[input.key] = overrideValue !== undefined ? overrideValue : input.value;
  }

  // Initialize series storage: variable key -> [period0, period1, ...]
  const series = new Map<string, number[]>();
  const periods = model.index.periods;
  const numPeriods = periods.length;

  // Initialize all series
  for (const [key] of graph.nodes) {
    series.set(key, new Array(numPeriods).fill(0));
  }

  // Evaluate for each period
  const rows: Array<Record<string, number | string | null>> = [];

  for (let periodIndex = 0; periodIndex < numPeriods; periodIndex++) {
    const row: Record<string, number | string | null> = {
      period: periods[periodIndex],
    };

    // Build current values map for this period (accumulated as we evaluate)
    const currentPeriodValues: Record<string, number> = { ...inputValues };

    // Evaluate in topological order
    for (const varKey of graph.topologicalOrder) {
      let value: number;

      if (graph.inputs.has(varKey)) {
        // Input value (constant across periods)
        value = inputValues[varKey] || 0;
      } else {
        // Evaluate formula
        const node = graph.nodes.get(varKey);
        if (node && node.definition) {
          value = evaluateFormula(node.definition, periodIndex, series, currentPeriodValues);
        } else {
          value = 0;
        }
      }

      // Store in series
      const varSeries = series.get(varKey);
      if (varSeries) {
        varSeries[periodIndex] = value;
      }

      // Add to current period values for subsequent evaluations
      currentPeriodValues[varKey] = value;

      // Add to row if it's an output
      if (graph.outputs.has(varKey)) {
        row[varKey] = value;
      }
    }

    rows.push(row);
  }

  // Build series map (variable key -> array of values)
  // Include all variables, not just outputs/inputs (for intermediate calculations)
  const seriesMap: Record<string, number[]> = {};
  for (const [key, values] of series) {
    seriesMap[key] = [...values];
  }

  // Build charts from outputs (single scenario)
  const charts = model.outputs.map((output) => ({
    name: output.label || output.key,
    chartType: 'line' as const,
    xKey: 'period',
    yKey: output.key,
    data: rows,
  }));

  // Build graph representation
  const graphNodes = Array.from(graph.nodes.values()).map((node) => ({
    key: node.key,
    definition: node.definition,
    dependencies: node.dependencies,
    dependents: node.dependents,
  }));

  const graphEdges: Array<{ from: string; to: string }> = [];
  for (const [key, node] of graph.nodes) {
    for (const dep of node.dependencies) {
      graphEdges.push({ from: dep, to: key });
    }
  }

  const elapsed = performance.now() - startTime;
  if (elapsed > 50) {
    console.warn(`[evaluator] Evaluation took ${elapsed.toFixed(1)}ms`);
  }

  return {
    rows,
    series: seriesMap,
    charts,
    graph: {
      nodes: graphNodes,
      edges: graphEdges,
    },
    validation,
  };
}

/**
 * Build multi-line charts for outputs across scenarios
 * Charts support multi-line rendering with yKey as array and scenarios array
 */
function buildMultiScenarioCharts(
  model: ModelAndVizArtifact['model'],
  allSeries: Record<string, number[]>,
  periods: string[],
  scenarios: Scenario[]
): EvaluationOutput['charts'] {
  const charts: EvaluationOutput['charts'] = [];

  for (const output of model.outputs) {
    // Find series for this output across all scenarios
    const scenarioSeries: Record<string, number[]> = {};
    const scenarioIds: string[] = [];

    for (const scenario of scenarios) {
      const prefixedKey = `${output.key}__${scenario.name}`;
      if (allSeries[prefixedKey]) {
        scenarioSeries[scenario.name] = allSeries[prefixedKey];
        scenarioIds.push(scenario.name);
      }
    }

    if (scenarioIds.length > 0) {
      // Build data rows with all scenario values
      const data = periods.map((period, idx) => {
        const row: Record<string, any> = { period };
        for (const [scenarioName, values] of Object.entries(scenarioSeries)) {
          row[`${output.key}__${scenarioName}`] = values[idx];
        }
        return row;
      });

      // Create multi-line chart
      charts.push({
        name: output.label || output.key,
        chartType: 'line',
        xKey: 'period',
        yKey: scenarioIds.map(name => `${output.key}__${name}`), // Array of keys for multi-line
        data,
        scenarios: scenarioIds,
      });
    }
  }

  return charts;
}

/**
 * Clear evaluator cache
 */
export function clearEvaluatorCache(): void {
  evaluatorCache.clear();
}
