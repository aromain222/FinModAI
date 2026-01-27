import 'server-only';

import type { ModelAndVizArtifact } from '@/lib/ai/schemas';
import { buildDependencyGraph, type DependencyGraph } from './graph';

/**
 * Validation Result
 */
export type ValidationIssue = {
  code: string;
  message: string;
  affected_keys: string[];
  severity: 'error' | 'warning';
};

export type ValidationResult = {
  passed: boolean;
  issues: ValidationIssue[];
};

/**
 * Validate model for missing references and cycles
 */
export function validateModel(artifact: ModelAndVizArtifact): ValidationResult {
  const issues: ValidationIssue[] = [];
  const { model } = artifact;

  try {
    // Build dependency graph
    const graph = buildDependencyGraph(artifact);

    // Check for missing references
    const missingRefs = checkMissingReferences(graph, model.inputs.map(i => i.key));
    if (missingRefs.length > 0) {
      issues.push({
        code: 'missing_references',
        message: `Formula references undefined variables: ${missingRefs.join(', ')}`,
        affected_keys: missingRefs,
        severity: 'error',
      });
    }

    // Check for cycles
    const cycles = detectCycles(graph);
    if (cycles.length > 0) {
      issues.push({
        code: 'circular_dependency',
        message: `Circular dependencies detected: ${cycles.join(' → ')}`,
        affected_keys: cycles,
        severity: 'error',
      });
    }

    // Check for unreachable outputs
    const unreachableOutputs = checkUnreachableOutputs(graph);
    if (unreachableOutputs.length > 0) {
      issues.push({
        code: 'unreachable_outputs',
        message: `Outputs cannot be computed: ${unreachableOutputs.join(', ')}`,
        affected_keys: unreachableOutputs,
        severity: 'warning',
      });
    }

    // Check for unused inputs
    const unusedInputs = checkUnusedInputs(graph);
    if (unusedInputs.length > 0) {
      issues.push({
        code: 'unused_inputs',
        message: `Inputs are not referenced in any formula: ${unusedInputs.join(', ')}`,
        affected_keys: unusedInputs,
        severity: 'warning',
      });
    }
  } catch (error: any) {
    issues.push({
      code: 'validation_error',
      message: `Validation failed: ${error?.message || 'Unknown error'}`,
      affected_keys: [],
      severity: 'error',
    });
  }

  const errors = issues.filter(i => i.severity === 'error');
  
  return {
    passed: errors.length === 0,
    issues,
  };
}

/**
 * Check for missing references (variables used but not defined)
 */
function checkMissingReferences(graph: DependencyGraph, inputKeys: string[]): string[] {
  const missing: string[] = [];
  const definedKeys = new Set([...graph.nodes.keys(), ...inputKeys]);

  for (const [key, node] of graph.nodes) {
    for (const dep of node.dependencies) {
      if (!definedKeys.has(dep)) {
        if (!missing.includes(dep)) {
          missing.push(dep);
        }
      }
    }
  }

  return missing;
}

/**
 * Detect cycles in dependency graph using DFS
 */
function detectCycles(graph: DependencyGraph): string[] {
  const cycles: string[] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function hasCycle(nodeKey: string): boolean {
    if (recStack.has(nodeKey)) {
      // Found a cycle - extract the cycle path
      const cycleStart = path.indexOf(nodeKey);
      if (cycleStart !== -1) {
        const cycle = path.slice(cycleStart).concat(nodeKey);
        if (cycles.length === 0 || !arraysEqual(cycles, cycle)) {
          cycles.push(...cycle);
        }
      }
      return true;
    }

    if (visited.has(nodeKey)) {
      return false;
    }

    visited.add(nodeKey);
    recStack.add(nodeKey);
    path.push(nodeKey);

    const node = graph.nodes.get(nodeKey);
    if (node) {
      for (const dep of node.dependencies) {
        if (graph.nodes.has(dep) && hasCycle(dep)) {
          return true;
        }
      }
    }

    recStack.delete(nodeKey);
    path.pop();
    return false;
  }

  // Check all nodes
  for (const key of graph.nodes.keys()) {
    if (!visited.has(key)) {
      hasCycle(key);
    }
  }

  // Return unique cycle (first one found)
  return Array.from(new Set(cycles));
}

/**
 * Check for outputs that cannot be computed
 */
function checkUnreachableOutputs(graph: DependencyGraph): string[] {
  const unreachable: string[] = [];

  for (const outputKey of graph.outputs) {
    const node = graph.nodes.get(outputKey);
    if (!node) {
      unreachable.push(outputKey);
      continue;
    }

    // Check if all dependencies are reachable
    const missingDeps = node.dependencies.filter(dep => !graph.nodes.has(dep) && !graph.inputs.has(dep));
    if (missingDeps.length > 0) {
      unreachable.push(outputKey);
    }
  }

  return unreachable;
}

/**
 * Check for inputs that are not used
 */
function checkUnusedInputs(graph: DependencyGraph): string[] {
  const unused: string[] = [];

  for (const inputKey of graph.inputs) {
    const node = graph.nodes.get(inputKey);
    if (node && node.dependents.length === 0) {
      // Check if it's an output (in which case it's used)
      if (!graph.outputs.has(inputKey)) {
        unused.push(inputKey);
      }
    }
  }

  return unused;
}

/**
 * Helper: check if two arrays are equal
 */
function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

