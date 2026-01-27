import 'server-only';

import type { ModelAndVizArtifact } from '@/lib/ai/schemas';

/**
 * Model Skeletons
 * Minimal templates for common model patterns
 * LLM fills in labels, defaults, and formulas
 */

export type ModelSkeleton = {
  id: string;
  name: string;
  description: string;
  keywords: string[]; // Keywords that trigger this skeleton
  structure: {
    kind: 'forecast' | 'sensitivity' | 'dcf' | 'generic';
    inputs: Array<{
      key: string;
      label: string; // Placeholder - LLM will fill
      value: number; // Placeholder default
      unit?: string;
      notes?: string;
    }>;
    equations: Array<{
      key: string;
      label: string; // Placeholder - LLM will fill
      definition: string; // Placeholder formula - LLM will fill
    }>;
    outputs: Array<{
      key: string;
      label: string; // Placeholder - LLM will fill
      unit?: string;
    }>;
    objective_metric_key?: string;
  };
};

/**
 * Profitability Bridge Skeleton
 * Analyzes path from revenue to profit with margin drivers
 */
export const profitability_bridge: ModelSkeleton = {
  id: 'profitability_bridge',
  name: 'Profitability Bridge',
  description: 'Analyzes path from revenue to profit with margin drivers',
  keywords: ['profitability', 'margin', 'profit', 'bridge', 'path to profit', 'improve margin'],
  structure: {
    kind: 'forecast',
    inputs: [
      { key: 'revenue', label: 'Starting Revenue', value: 1000, unit: '$' },
      { key: 'revenue_growth', label: 'Revenue Growth', value: 0.1, unit: '%' },
      { key: 'cogs_pct', label: 'COGS %', value: 0.4, unit: '%' },
      { key: 'opex_pct', label: 'OpEx %', value: 0.3, unit: '%' },
      { key: 'tax_rate', label: 'Tax Rate', value: 0.21, unit: '%' },
      { key: 'cogs_improvement', label: 'COGS Improvement', value: 0, unit: 'pp' },
      { key: 'opex_improvement', label: 'OpEx Improvement', value: 0, unit: 'pp' },
    ],
    equations: [
      { key: 'revenue_t', label: 'Revenue', definition: 'revenue * (1 + revenue_growth) ^ t' },
      { key: 'cogs', label: 'COGS', definition: 'revenue_t * (cogs_pct - cogs_improvement)' },
      { key: 'gross_profit', label: 'Gross Profit', definition: 'revenue_t - cogs' },
      { key: 'gross_margin', label: 'Gross Margin', definition: 'gross_profit / revenue_t' },
      { key: 'opex', label: 'OpEx', definition: 'revenue_t * (opex_pct - opex_improvement)' },
      { key: 'ebit', label: 'EBIT', definition: 'gross_profit - opex' },
      { key: 'ebit_margin', label: 'EBIT Margin', definition: 'ebit / revenue_t' },
      { key: 'tax', label: 'Tax', definition: 'ebit * tax_rate' },
      { key: 'net_profit', label: 'Net Profit', definition: 'ebit - tax' },
      { key: 'net_margin', label: 'Net Margin', definition: 'net_profit / revenue_t' },
    ],
    outputs: [
      { key: 'revenue_t', label: 'Revenue', unit: '$' },
      { key: 'gross_profit', label: 'Gross Profit', unit: '$' },
      { key: 'gross_margin', label: 'Gross Margin', unit: '%' },
      { key: 'ebit', label: 'EBIT', unit: '$' },
      { key: 'ebit_margin', label: 'EBIT Margin', unit: '%' },
      { key: 'net_profit', label: 'Net Profit', unit: '$' },
      { key: 'net_margin', label: 'Net Margin', unit: '%' },
    ],
    objective_metric_key: 'net_profit',
  },
};

/**
 * SaaS Growth Skeleton
 * Models SaaS metrics: ARR, MRR, churn, expansion, CAC
 */
export const saas_growth: ModelSkeleton = {
  id: 'saas_growth',
  name: 'SaaS Growth',
  description: 'Models SaaS metrics: ARR, MRR, churn, expansion, CAC',
  keywords: ['saas', 'arr', 'mrr', 'churn', 'expansion', 'cac', 'ltv', 'recurring revenue'],
  structure: {
    kind: 'forecast',
    inputs: [
      { key: 'starting_arr', label: 'Starting ARR', value: 1000, unit: '$' },
      { key: 'new_customers', label: 'New Customers per Quarter', value: 10, unit: 'customers' },
      { key: 'starting_arpu', label: 'Starting ARPU', value: 100, unit: '$' },
      { key: 'churn_rate', label: 'Churn Rate', value: 0.05, unit: '%' },
      { key: 'expansion_rate', label: 'Expansion Rate', value: 0.1, unit: '%' },
      { key: 'cac', label: 'CAC', value: 50, unit: '$' },
      { key: 'cac_trend', label: 'CAC Trend', value: 0, unit: '%' },
    ],
    equations: [
      { key: 'customers_t', label: 'Customers', definition: 'customers[t-1] * (1 - churn_rate) + new_customers' },
      { key: 'arpu_t', label: 'ARPU', definition: 'starting_arpu * (1 + expansion_rate) ^ t' },
      { key: 'arr_t', label: 'ARR', definition: 'customers_t * arpu_t' },
      { key: 'mrr_t', label: 'MRR', definition: 'arr_t / 12' },
      { key: 'cac_t', label: 'CAC', definition: 'cac * (1 + cac_trend) ^ t' },
      { key: 'ltv', label: 'LTV', definition: 'arpu_t / churn_rate' },
      { key: 'ltv_cac_ratio', label: 'LTV:CAC', definition: 'ltv / cac_t' },
    ],
    outputs: [
      { key: 'customers_t', label: 'Customers', unit: 'customers' },
      { key: 'arr_t', label: 'ARR', unit: '$' },
      { key: 'mrr_t', label: 'MRR', unit: '$' },
      { key: 'ltv_cac_ratio', label: 'LTV:CAC', unit: 'ratio' },
    ],
    objective_metric_key: 'arr_t',
  },
};

/**
 * Pricing Sensitivity Skeleton
 * Analyzes impact of price changes on revenue and margin
 */
export const pricing_sensitivity: ModelSkeleton = {
  id: 'pricing_sensitivity',
  name: 'Pricing Sensitivity',
  description: 'Analyzes impact of price changes on revenue and margin',
  keywords: ['pricing', 'price change', 'price increase', 'price decrease', 'pricing impact', 'elasticity'],
  structure: {
    kind: 'sensitivity',
    inputs: [
      { key: 'base_price', label: 'Base Price', value: 100, unit: '$' },
      { key: 'base_units', label: 'Base Units', value: 1000, unit: 'units' },
      { key: 'price_change', label: 'Price Change', value: 0.1, unit: '%' },
      { key: 'elasticity', label: 'Price Elasticity', value: -1.5, unit: 'ratio' },
      { key: 'unit_cost', label: 'Unit Cost', value: 60, unit: '$' },
      { key: 'fixed_costs', label: 'Fixed Costs', value: 10000, unit: '$' },
    ],
    equations: [
      { key: 'new_price', label: 'New Price', definition: 'base_price * (1 + price_change)' },
      { key: 'volume_change', label: 'Volume Change', definition: 'price_change * elasticity' },
      { key: 'new_units', label: 'New Units', definition: 'base_units * (1 + volume_change)' },
      { key: 'revenue', label: 'Revenue', definition: 'new_price * new_units' },
      { key: 'variable_costs', label: 'Variable Costs', definition: 'new_units * unit_cost' },
      { key: 'gross_profit', label: 'Gross Profit', definition: 'revenue - variable_costs' },
      { key: 'net_profit', label: 'Net Profit', definition: 'gross_profit - fixed_costs' },
      { key: 'margin', label: 'Margin', definition: 'net_profit / revenue' },
    ],
    outputs: [
      { key: 'revenue', label: 'Revenue', unit: '$' },
      { key: 'new_units', label: 'Units', unit: 'units' },
      { key: 'gross_profit', label: 'Gross Profit', unit: '$' },
      { key: 'net_profit', label: 'Net Profit', unit: '$' },
      { key: 'margin', label: 'Margin', unit: '%' },
    ],
    objective_metric_key: 'net_profit',
  },
};

/**
 * Churn ROI Skeleton
 * Analyzes ROI of churn reduction initiatives
 */
export const churn_roi: ModelSkeleton = {
  id: 'churn_roi',
  name: 'Churn ROI',
  description: 'Analyzes ROI of churn reduction initiatives',
  keywords: ['churn', 'retention', 'roi', 'churn reduction', 'retention improvement', 'customer lifetime'],
  structure: {
    kind: 'forecast',
    inputs: [
      { key: 'starting_customers', label: 'Starting Customers', value: 1000, unit: 'customers' },
      { key: 'base_churn', label: 'Base Churn Rate', value: 0.05, unit: '%' },
      { key: 'improved_churn', label: 'Improved Churn Rate', value: 0.03, unit: '%' },
      { key: 'arpu', label: 'ARPU', value: 100, unit: '$' },
      { key: 'retention_cost', label: 'Retention Cost per Customer', value: 10, unit: '$' },
      { key: 'new_customers', label: 'New Customers per Period', value: 50, unit: 'customers' },
    ],
    equations: [
      { key: 'customers_base', label: 'Customers (Base)', definition: 't == 0 ? starting_customers : customers_base[t-1] * (1 - base_churn) + new_customers' },
      { key: 'customers_improved', label: 'Customers (Improved)', definition: 't == 0 ? starting_customers : customers_improved[t-1] * (1 - improved_churn) + new_customers' },
      { key: 'arr_base', label: 'ARR (Base)', definition: 'customers_base * arpu * 12' },
      { key: 'arr_improved', label: 'ARR (Improved)', definition: 'customers_improved * arpu * 12' },
      { key: 'retention_investment', label: 'Retention Investment', definition: 'customers_improved * retention_cost' },
      { key: 'arr_delta', label: 'ARR Delta', definition: 'arr_improved - arr_base' },
      { key: 'roi', label: 'ROI', definition: '(arr_delta - retention_investment) / retention_investment' },
    ],
    outputs: [
      { key: 'customers_improved', label: 'Customers', unit: 'customers' },
      { key: 'arr_improved', label: 'ARR', unit: '$' },
      { key: 'arr_delta', label: 'ARR Delta', unit: '$' },
      { key: 'roi', label: 'ROI', unit: '%' },
    ],
    objective_metric_key: 'roi',
  },
};

/**
 * Market Entry Light Skeleton
 * Simple model for market entry decision: revenue, costs, breakeven
 */
export const market_entry_light: ModelSkeleton = {
  id: 'market_entry_light',
  name: 'Market Entry Light',
  description: 'Simple model for market entry decision: revenue, costs, breakeven',
  keywords: ['market entry', 'new market', 'launch', 'breakeven', 'entry decision', 'go to market'],
  structure: {
    kind: 'forecast',
    inputs: [
      { key: 'market_size', label: 'Market Size', value: 10000, unit: '$' },
      { key: 'market_share', label: 'Target Market Share', value: 0.05, unit: '%' },
      { key: 'price', label: 'Price', value: 100, unit: '$' },
      { key: 'unit_cost', label: 'Unit Cost', value: 60, unit: '$' },
      { key: 'fixed_costs', label: 'Fixed Costs', value: 50000, unit: '$' },
      { key: 'ramp_periods', label: 'Ramp Periods', value: 4, unit: 'periods' },
      { key: 'sales_marketing', label: 'Sales & Marketing', value: 20000, unit: '$' },
    ],
    equations: [
      { key: 'ramp_factor', label: 'Ramp Factor', definition: 'min(1, t / ramp_periods)' },
      { key: 'target_revenue', label: 'Target Revenue', definition: 'market_size * market_share' },
      { key: 'revenue_t', label: 'Revenue', definition: 'target_revenue * ramp_factor' },
      { key: 'units_t', label: 'Units', definition: 'revenue_t / price' },
      { key: 'variable_costs', label: 'Variable Costs', definition: 'units_t * unit_cost' },
      { key: 'gross_profit', label: 'Gross Profit', definition: 'revenue_t - variable_costs' },
      { key: 'total_costs', label: 'Total Costs', definition: 'variable_costs + fixed_costs + sales_marketing' },
      { key: 'net_profit', label: 'Net Profit', definition: 'revenue_t - total_costs' },
      { key: 'cumulative_profit', label: 'Cumulative Profit', definition: 't == 0 ? net_profit : cumulative_profit[t-1] + net_profit' },
    ],
    outputs: [
      { key: 'revenue_t', label: 'Revenue', unit: '$' },
      { key: 'units_t', label: 'Units', unit: 'units' },
      { key: 'gross_profit', label: 'Gross Profit', unit: '$' },
      { key: 'net_profit', label: 'Net Profit', unit: '$' },
      { key: 'cumulative_profit', label: 'Cumulative Profit', unit: '$' },
    ],
    objective_metric_key: 'cumulative_profit',
  },
};

/**
 * All available skeletons
 */
export const MODEL_SKELETONS: ModelSkeleton[] = [
  profitability_bridge,
  saas_growth,
  pricing_sensitivity,
  churn_roi,
  market_entry_light,
];

/**
 * Select skeleton by keywords in prompt
 */
export function selectSkeleton(prompt: string): ModelSkeleton | null {
  const text = prompt.toLowerCase();
  
  // Score each skeleton by keyword matches
  let bestSkeleton: ModelSkeleton | null = null;
  let bestScore = 0;

  for (const skeleton of MODEL_SKELETONS) {
    let score = 0;
    for (const keyword of skeleton.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestSkeleton = skeleton;
    }
  }

  // Require at least 1 keyword match
  return bestScore > 0 ? bestSkeleton : null;
}

/**
 * Build model artifact from skeleton
 * LLM should fill in labels, defaults, and refine formulas
 */
export function buildModelFromSkeleton(skeleton: ModelSkeleton): Partial<ModelAndVizArtifact> {
  const periods = Array.from({ length: 8 }, (_, i) => {
    const now = new Date();
    const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
    const year = now.getUTCFullYear();
    const targetQuarter = quarter + i + 1;
    const targetYear = year + Math.floor((targetQuarter - 1) / 4);
    const q = ((targetQuarter - 1) % 4) + 1;
    return `${targetYear} Q${q}`;
  });

  return {
    model: {
      kind: skeleton.structure.kind,
      title: `${skeleton.name} Model`,
      index: {
        frequency: 'quarterly',
        periods,
      },
      inputs: skeleton.structure.inputs.map(input => ({
        key: input.key,
        label: input.label,
        value: input.value,
        unit: input.unit,
        notes: input.notes || 'Placeholder - LLM will refine',
        source: 'placeholder' as const,
      })),
      equations: skeleton.structure.equations.map(eq => ({
        key: eq.key,
        label: eq.label,
        definition: eq.definition,
      })),
      outputs: skeleton.structure.outputs.map(output => ({
        key: output.key,
        label: output.label,
        unit: output.unit,
      })),
      objective_metric_key: skeleton.structure.objective_metric_key,
      objective_metric_label: skeleton.structure.outputs.find(o => o.key === skeleton.structure.objective_metric_key)?.label || '',
    },
    evaluation: {
      asOf: new Date().toISOString(),
      rows: [],
      summary: [],
    },
    charts: skeleton.structure.outputs.slice(0, 4).map(output => ({
      name: output.label,
      chartType: 'line' as const,
      xKey: 'period',
      yKey: output.key,
      data: [],
    })),
  };
}

