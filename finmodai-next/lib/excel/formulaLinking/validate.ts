/**
 * Formula-Linking Validation Engine
 *
 * Pre-build validation:
 *   - Detects unintentional circular references in the dependency graph.
 *   - Verifies all formula deps reference defined inputs or line items.
 *   - Checks that every section item key exists.
 *   - Validates named range uniqueness.
 *
 * Post-build checklist (for humans / CI):
 *   - All checks on the Checks sheet pass.
 *   - No #REF errors in any cell.
 *   - Every named range resolves.
 *   - Input cells are unlocked; formula cells are locked.
 */

import type {
  FormulaLinkedModelDef,
  InputSpec,
  LineItemSpec,
  CheckSpec,
} from './types';

export interface ValidationError {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

/**
 * Validate a model definition before building.
 * Returns an array of errors/warnings. Empty = valid.
 */
export function validateModelDefinition(def: FormulaLinkedModelDef): ValidationError[] {
  const errors: ValidationError[] = [];
  const allKeys = new Set<string>();
  const allNamedRanges = new Set<string>();

  for (const input of def.inputs) {
    if (allKeys.has(input.key)) {
      errors.push({ severity: 'error', code: 'DUPLICATE_KEY', message: `Duplicate key: "${input.key}"` });
    }
    allKeys.add(input.key);

    if (allNamedRanges.has(input.namedRange)) {
      errors.push({ severity: 'warning', code: 'DUPLICATE_NAMED_RANGE', message: `Duplicate named range base: "${input.namedRange}" on input "${input.key}"` });
    }
    allNamedRanges.add(input.namedRange);

    if (input.perPeriod && !Array.isArray(input.defaultValue) && typeof input.defaultValue !== 'number') {
      errors.push({ severity: 'warning', code: 'MISSING_DEFAULT', message: `Per-period input "${input.key}" has no numeric default` });
    }
  }

  for (const li of def.lineItems) {
    if (allKeys.has(li.key)) {
      errors.push({ severity: 'error', code: 'DUPLICATE_KEY', message: `Duplicate key: "${li.key}"` });
    }
    allKeys.add(li.key);

    if (allNamedRanges.has(li.namedRange)) {
      errors.push({ severity: 'warning', code: 'DUPLICATE_NAMED_RANGE', message: `Duplicate named range base: "${li.namedRange}" on line item "${li.key}"` });
    }
    allNamedRanges.add(li.namedRange);

    for (const dep of li.deps) {
      if (!allKeys.has(dep) && !def.inputs.some((i) => i.key === dep) && !def.lineItems.some((l) => l.key === dep)) {
        errors.push({ severity: 'error', code: 'MISSING_DEP', message: `Line item "${li.key}" depends on "${dep}" which is not defined` });
      }
    }
  }

  for (const check of def.checks) {
    for (const dep of check.deps) {
      if (!allKeys.has(dep)) {
        errors.push({ severity: 'error', code: 'MISSING_CHECK_DEP', message: `Check "${check.key}" depends on "${dep}" which is not defined` });
      }
    }
  }

  for (const sheet of def.sheets) {
    for (const section of sheet.sections) {
      for (const itemKey of section.items) {
        if (!allKeys.has(itemKey)) {
          errors.push({ severity: 'error', code: 'MISSING_SECTION_ITEM', message: `Section "${section.title}" on sheet "${sheet.name}" references "${itemKey}" which is not defined` });
        }
      }
    }
  }

  const circularErrors = detectCircularDeps(def);
  errors.push(...circularErrors);

  return errors;
}

/**
 * Detect circular dependencies in the line-item graph.
 * Ignores cycles listed in def.intentionalCirculars.
 */
function detectCircularDeps(def: FormulaLinkedModelDef): ValidationError[] {
  const errors: ValidationError[] = [];
  const intentional = new Set(def.intentionalCirculars ?? []);

  const adjList = new Map<string, string[]>();
  for (const li of def.lineItems) {
    adjList.set(li.key, li.deps.filter((d) => d !== li.key));
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const key of adjList.keys()) color.set(key, WHITE);

  function dfs(node: string, path: string[]): void {
    color.set(node, GRAY);
    path.push(node);

    for (const neighbor of adjList.get(node) ?? []) {
      if (!adjList.has(neighbor)) continue;

      if (color.get(neighbor) === GRAY) {
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart).concat(neighbor);
        const cycleKey = cycle.sort().join('<->');

        if (!intentional.has(cycleKey)) {
          errors.push({
            severity: 'error',
            code: 'CIRCULAR_DEP',
            message: `Circular dependency detected: ${cycle.join(' → ')}`,
          });
        }
        continue;
      }

      if (color.get(neighbor) === WHITE) {
        dfs(neighbor, path);
      }
    }

    path.pop();
    color.set(node, BLACK);
  }

  for (const key of adjList.keys()) {
    if (color.get(key) === WHITE) {
      dfs(key, []);
    }
  }

  return errors;
}

/**
 * Post-build validation checklist.
 * Returns a structured checklist for human review or automated CI.
 */
export interface PostBuildCheck {
  check: string;
  description: string;
  automated: boolean;
}

export function getPostBuildChecklist(): PostBuildCheck[] {
  return [
    {
      check: 'CHECKS_PASS',
      description: 'All rows on the "Checks" sheet show "PASS".',
      automated: true,
    },
    {
      check: 'NO_REF_ERRORS',
      description: 'No cell in the workbook contains #REF!, #NAME?, or #VALUE! errors.',
      automated: true,
    },
    {
      check: 'NAMED_RANGES_RESOLVE',
      description: 'Every defined named range resolves to a valid cell address.',
      automated: true,
    },
    {
      check: 'INPUT_CELLS_UNLOCKED',
      description: 'All input cells (blue font / light blue fill) are unlocked for editing.',
      automated: true,
    },
    {
      check: 'FORMULA_CELLS_LOCKED',
      description: 'All formula/derived cells are locked (protected).',
      automated: true,
    },
    {
      check: 'EQUATIONS_TAB_COMPLETE',
      description: 'Every formula cell has a corresponding row in the Equations tab.',
      automated: true,
    },
    {
      check: 'BS_BALANCES',
      description: 'Balance Sheet: Total Assets = Total Liabilities + Equity for all periods.',
      automated: true,
    },
    {
      check: 'CF_TIES_TO_CASH',
      description: 'Cash Flow: Beginning Cash + Net CF = Ending Cash for all periods.',
      automated: true,
    },
    {
      check: 'NI_FLOWS_TO_RE',
      description: 'Net Income flows to Retained Earnings on the Balance Sheet.',
      automated: true,
    },
    {
      check: 'SIGN_CONVENTIONS',
      description: 'Expenses negative, revenue positive, consistent CapEx sign in CF.',
      automated: false,
    },
    {
      check: 'PERIOD_LABELS',
      description: 'All period headers use FYxxxxA/E convention. No broken labels.',
      automated: true,
    },
    {
      check: 'NO_HARDCODED_PROJECTIONS',
      description: 'No projection-year cell contains a hardcoded number (must be formula).',
      automated: true,
    },
  ];
}
