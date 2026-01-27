import 'server-only';

import type { ModelAndVizArtifact } from '@/lib/ai/schemas';

/**
 * Dependency Graph Utilities
 * Builds and manages dependency graphs for model evaluation
 */

export type DependencyNode = {
  key: string;
  definition: string;
  dependencies: string[]; // Variable keys this formula depends on
  dependents: string[]; // Variable keys that depend on this
};

export type DependencyGraph = {
  nodes: Map<string, DependencyNode>;
  inputs: Set<string>; // Input variable keys (no dependencies)
  outputs: Set<string>; // Output variable keys
  topologicalOrder: string[]; // Evaluation order (topologically sorted)
};

/**
 * Build dependency graph from artifact
 */
export function buildDependencyGraph(artifact: ModelAndVizArtifact): DependencyGraph {
  const { model } = artifact;
  const nodes = new Map<string, DependencyNode>();
  const inputs = new Set<string>();
  const outputs = new Set<string>();

  // Add inputs as base nodes
  for (const input of model.inputs || []) {
    inputs.add(input.key);
    nodes.set(input.key, {
      key: input.key,
      definition: '',
      dependencies: [],
      dependents: [],
    });
  }

  // Parse equations and build nodes
  for (const equation of model.equations || []) {
    const deps = extractDependencies(equation.definition);
    
    nodes.set(equation.key, {
      key: equation.key,
      definition: equation.definition,
      dependencies: deps,
      dependents: [],
    });
  }

  // Mark outputs
  for (const output of model.outputs || []) {
    outputs.add(output.key);
    
    // If output doesn't have a node yet, it might be a direct input
    if (!nodes.has(output.key)) {
      const input = model.inputs?.find((inp) => inp.key === output.key);
      if (input) {
        inputs.add(output.key);
        nodes.set(output.key, {
          key: output.key,
          definition: '',
          dependencies: [],
          dependents: [],
        });
      }
    }
  }

  // Build reverse dependencies (dependents)
  for (const [key, node] of nodes) {
    for (const dep of node.dependencies) {
      const depNode = nodes.get(dep);
      if (depNode && !depNode.dependents.includes(key)) {
        depNode.dependents.push(key);
      }
    }
  }

  // Topological sort for evaluation order
  const topologicalOrder = topologicalSort(nodes, inputs);

  return {
    nodes,
    inputs,
    outputs,
    topologicalOrder,
  };
}

/**
 * Extract dependencies from formula definition
 * Handles: variable references, time indexing (x[t], x[t-1])
 */
function extractDependencies(definition: string): string[] {
  if (!definition) return [];

  const dependencies: string[] = [];
  
  // Match variable references:
  // 1. Simple references: revenue, cost, margin
  // 2. Time-indexed: revenue[t], revenue[t-1], cost[t-2]
  const patterns = [
    /\b([a-zA-Z_][a-zA-Z0-9_]*)\[t\b/g, // x[t], revenue[t]
    /\b([a-zA-Z_][a-zA-Z0-9_]*)\[t\s*-\s*\d+\]/g, // x[t-1], revenue[t-2]
    /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, // Simple references: revenue, cost
  ];

  const keywords = new Set([
    'if', 'then', 'else', 'and', 'or', 'not',
    'abs', 'max', 'min', 'sum', 'avg', 'round',
    'sqrt', 'pow', 'exp', 'log', 'sin', 'cos', 'tan',
    't', 'pi', 'e',
  ]);

  for (const pattern of patterns) {
    const matches = definition.matchAll(pattern);
    for (const match of matches) {
      const varName = match[1];
      if (varName && !keywords.has(varName.toLowerCase())) {
        // Extract base variable name (remove time indexing for dependency tracking)
        const baseName = varName.split('[')[0];
        if (baseName && !dependencies.includes(baseName)) {
          dependencies.push(baseName);
        }
      }
    }
  }

  return dependencies;
}

/**
 * Topological sort using Kahn's algorithm
 * Returns evaluation order (inputs first, then dependents)
 */
function topologicalSort(
  nodes: Map<string, DependencyNode>,
  inputs: Set<string>
): string[] {
  // Build in-degree map
  const inDegree = new Map<string, number>();
  
  for (const [key] of nodes) {
    inDegree.set(key, 0);
  }

  // Compute in-degrees
  for (const [key, node] of nodes) {
    for (const dep of node.dependencies) {
      if (nodes.has(dep)) {
        inDegree.set(key, (inDegree.get(key) || 0) + 1);
      }
    }
  }

  // Start with inputs (they have no dependencies from within the graph)
  const queue: string[] = [];
  for (const inputKey of inputs) {
    if ((inDegree.get(inputKey) || 0) === 0) {
      queue.push(inputKey);
    }
  }

  // Also add any node with in-degree 0 that's not an input
  for (const [key, degree] of inDegree) {
    if (degree === 0 && !inputs.has(key) && !queue.includes(key)) {
      queue.push(key);
    }
  }

  const result: string[] = [];

  // Process queue
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    const node = nodes.get(current);
    if (node) {
      // Reduce in-degree of dependents
      for (const dependent of node.dependents) {
        const newDegree = (inDegree.get(dependent) || 0) - 1;
        inDegree.set(dependent, newDegree);
        
        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }
  }

  // Add any remaining nodes (shouldn't happen in a valid DAG, but handle gracefully)
  for (const [key] of nodes) {
    if (!result.includes(key)) {
      result.push(key);
    }
  }

  return result;
}

/**
 * Get all nodes that depend on a given variable (transitive closure)
 */
export function getDependents(key: string, graph: DependencyGraph): string[] {
  const result: string[] = [];
  const visited = new Set<string>();

  function visit(nodeKey: string) {
    if (visited.has(nodeKey)) return;
    visited.add(nodeKey);

    const node = graph.nodes.get(nodeKey);
    if (node) {
      for (const dependent of node.dependents) {
        result.push(dependent);
        visit(dependent);
      }
    }
  }

  visit(key);
  return result;
}

/**
 * Get all nodes that a given variable depends on (transitive closure)
 */
export function getDependencies(key: string, graph: DependencyGraph): string[] {
  const result: string[] = [];
  const visited = new Set<string>();

  function visit(nodeKey: string) {
    if (visited.has(nodeKey)) return;
    visited.add(nodeKey);

    const node = graph.nodes.get(key);
    if (node) {
      for (const dep of node.dependencies) {
        result.push(dep);
        visit(dep);
      }
    }
  }

  const node = graph.nodes.get(key);
  if (node) {
    for (const dep of node.dependencies) {
      result.push(dep);
      visit(dep);
    }
  }

  return result;
}

