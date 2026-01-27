import type { ModelAndVizArtifact } from '@/lib/ai/schemas';

export type ValidationWarning = {
  code: string;
  message: string;
  affected_keys: string[];
};

export type ValidationResult = {
  passed: boolean;
  warnings: ValidationWarning[];
};

type ModelInput = {
  key: string;
  label: string;
  value: number | string | null;
  unit?: string;
  notes?: string;
  source?: 'user' | 'inferred' | 'placeholder';
};

type ModelRow = {
  period: string;
  [key: string]: string | number | null;
};

/**
 * Validates a ModelAndVizArtifact for numerical sanity and consistency.
 * Checks for negative values, extreme margins, growth rates, discontinuities,
 * NPV issues, and scenario ordering.
 */
export function validateModel(artifact: ModelAndVizArtifact): ValidationResult {
  const warnings: ValidationWarning[] = [];
  const { model, evaluation } = artifact;
  const { inputs, outputs } = model;
  const { rows } = evaluation;

  // Helper to extract numeric value
  const toNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/,/g, ''));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  // Helper to find output key by label or key
  const findOutputKey = (searchKey: string): string | null => {
    const output = outputs.find((o) => o.key === searchKey || o.label.toLowerCase() === searchKey.toLowerCase());
    return output?.key ?? null;
  };

  // 1. Check for negative revenue, price, units, customers (unless explicitly allowed)
  const revenueKeys = ['revenue', 'sales', 'top_line', 'revenue_t', 'sales_t'];
  const priceKeys = ['price', 'price_per_unit', 'unit_price', 'asp'];
  const unitsKeys = ['units', 'quantity', 'volume', 'units_sold'];
  const customersKeys = ['customers', 'users', 'subscribers', 'accounts'];

  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (key === 'period') continue;
      const num = toNumber(value);
      if (num === null) continue;

      const keyLower = key.toLowerCase();
      const isRevenue = revenueKeys.some((rk) => keyLower.includes(rk));
      const isPrice = priceKeys.some((pk) => keyLower.includes(pk));
      const isUnits = unitsKeys.some((uk) => keyLower.includes(uk));
      const isCustomers = customersKeys.some((ck) => keyLower.includes(ck));

      if ((isRevenue || isPrice || isUnits || isCustomers) && num < 0) {
        // Check if negative is explicitly allowed in notes
        const input = inputs.find((inp) => inp.key === key);
        const notes = input?.notes?.toLowerCase() || '';
        if (!notes.includes('negative') && !notes.includes('allow') && !notes.includes('can be')) {
          warnings.push({
            code: 'negative_value',
            message: `Negative ${key} detected in period ${row.period}`,
            affected_keys: [key, row.period],
          });
        }
      }
    }
  }

  // 2. Check margins < -50% or > 95%
  const marginKeys = ['margin', 'profit_margin', 'gross_margin', 'ebitda_margin', 'net_margin'];
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (key === 'period') continue;
      const num = toNumber(value);
      if (num === null) continue;

      const keyLower = key.toLowerCase();
      const isMargin = marginKeys.some((mk) => keyLower.includes(mk));
      const isPct = keyLower.includes('%') || keyLower.includes('pct') || keyLower.includes('percent');

      if (isMargin || (isPct && Math.abs(num) <= 100)) {
        const marginPct = Math.abs(num) > 1 ? num : num * 100; // Handle both decimal and percentage formats
        if (marginPct < -50 || marginPct > 95) {
          warnings.push({
            code: 'extreme_margin',
            message: `Extreme margin detected: ${marginPct.toFixed(1)}% for ${key} in period ${row.period}`,
            affected_keys: [key, row.period],
          });
        }
      }
    }
  }

  // 3. Check growth rates > 200% QoQ or < -80%
  const growthKeys = ['growth', 'growth_rate', 'yoy', 'qoq', 'mom', 'change', 'popPct', 'pop'];
  for (let i = 1; i < rows.length; i++) {
    const prevRow = rows[i - 1];
    const currRow = rows[i];

    for (const [key, currValue] of Object.entries(currRow)) {
      if (key === 'period') continue;
      const prevValue = prevRow[key];
      const curr = toNumber(currValue);
      const prev = toNumber(prevValue);

      if (curr === null || prev === null || prev === 0) continue;

      const keyLower = key.toLowerCase();
      const isGrowth = growthKeys.some((gk) => keyLower.includes(gk));

      // Calculate period-over-period change
      const changePct = ((curr - prev) / Math.abs(prev)) * 100;

      if (isGrowth || Math.abs(changePct) > 10) {
        // Growth rate or significant change
        if (changePct > 200 || changePct < -80) {
          warnings.push({
            code: 'extreme_growth',
            message: `Extreme growth rate detected: ${changePct.toFixed(1)}% for ${key} from ${prevRow.period} to ${currRow.period}`,
            affected_keys: [key, prevRow.period, currRow.period],
          });
        }
      }
    }
  }

  // 4. Check discontinuous jumps (>3x change between periods)
  for (let i = 1; i < rows.length; i++) {
    const prevRow = rows[i - 1];
    const currRow = rows[i];

    for (const [key, currValue] of Object.entries(currRow)) {
      if (key === 'period') continue;
      const prevValue = prevRow[key];
      const curr = toNumber(currValue);
      const prev = toNumber(prevValue);

      if (curr === null || prev === null || prev === 0) continue;

      // Skip growth rate fields (they're expected to have large changes)
      const keyLower = key.toLowerCase();
      if (growthKeys.some((gk) => keyLower.includes(gk))) continue;

      const ratio = Math.abs(curr / prev);
      if (ratio > 3 || ratio < 1 / 3) {
        warnings.push({
          code: 'discontinuous_jump',
          message: `Discontinuous jump detected: ${key} changed by ${(ratio > 3 ? ratio : 1 / ratio).toFixed(1)}x from ${prevRow.period} to ${currRow.period}`,
          affected_keys: [key, prevRow.period, currRow.period],
        });
      }
    }
  }

  // 5. Check NPV with no discounting or horizon < 3 periods
  if (model.kind === 'dcf') {
    const hasWacc = inputs.some((inp) => {
      const key = inp.key.toLowerCase();
      return key.includes('wacc') || key.includes('discount');
    });
    const waccInput = inputs.find((inp) => {
      const key = inp.key.toLowerCase();
      return key.includes('wacc') || key.includes('discount');
    });
    const wacc = waccInput ? toNumber(waccInput.value) : null;

    if (!hasWacc || wacc === null || wacc === 0) {
      warnings.push({
        code: 'npv_no_discounting',
        message: 'NPV/DCF model detected without discount rate (WACC)',
        affected_keys: ['wacc', 'discount_rate'],
      });
    }

    if (rows.length < 3) {
      warnings.push({
        code: 'npv_horizon_too_short',
        message: `DCF model has only ${rows.length} periods (minimum 3 recommended)`,
        affected_keys: ['horizon', 'periods'],
      });
    }
  }

  // 6. Check scenario ordering (upside >= base >= downside)
  const scenarioInputs = inputs.filter((inp) => {
    const key = inp.key.toLowerCase();
    return key.includes('upside') || key.includes('downside') || key.includes('base') || key.includes('scenario');
  });

  if (scenarioInputs.length >= 3) {
    const upsideInput = inputs.find((inp) => inp.key.toLowerCase().includes('upside'));
    const baseInput = inputs.find((inp) => inp.key.toLowerCase().includes('base') && !inp.key.toLowerCase().includes('upside') && !inp.key.toLowerCase().includes('downside'));
    const downsideInput = inputs.find((inp) => inp.key.toLowerCase().includes('downside'));

    // Check primary output metric across scenarios
    const primaryOutput = outputs[0]?.key;
    if (primaryOutput) {
      // Find scenario values from summary or rows
      const summary = evaluation.summary || [];
      const upsideValue = summary.find((s) => s.key.includes('upside'))?.value;
      const baseValue = summary.find((s) => s.key.includes('base') && !s.key.includes('upside') && !s.key.includes('downside'))?.value;
      const downsideValue = summary.find((s) => s.key.includes('downside'))?.value;

      const upside = toNumber(upsideValue);
      const base = toNumber(baseValue);
      const downside = toNumber(downsideValue);

      if (upside !== null && base !== null && upside < base) {
        warnings.push({
          code: 'scenario_ordering',
          message: 'Upside scenario value is less than base case',
          affected_keys: ['upside', 'base', primaryOutput],
        });
      }

      if (downside !== null && base !== null && downside > base) {
        warnings.push({
          code: 'scenario_ordering',
          message: 'Downside scenario value is greater than base case',
          affected_keys: ['downside', 'base', primaryOutput],
        });
      }
    }
  }

  return {
    passed: warnings.length === 0,
    warnings,
  };
}

