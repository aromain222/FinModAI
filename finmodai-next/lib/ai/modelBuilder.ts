import 'server-only';

import { z } from 'zod';
import type { ModelAndVizArtifact } from './schemas';
import { ModelAndVizArtifactSchema } from './schemas';
import { classifyPrompt } from './promptClassifier';
import { inferObjectiveMetricFromPrompt } from '@/lib/modeling/objectiveMetric';

/**
 * Build a minimum useful financial model to answer the user's question
 * 
 * The model is:
 * - simple (high-level drivers only)
 * - decision-oriented (supports answering implied decision)
 * - explainable (clear formulas, labeled assumptions)
 * 
 * Returns ONLY valid JSON matching the ModelSpec schema
 */

type ModelBuildInput = {
  prompt: string;
  context?: {
    ticker?: string;
    timeframe?: string;
    baseline?: number;
    [key: string]: unknown;
  };
};

type ParsedHorizon = {
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  count: number;
};

/**
 * Extract time horizon from prompt or use defaults
 */
function parseTimeHorizon(prompt: string, context?: ModelBuildInput['context']): ParsedHorizon {
  const text = prompt.toLowerCase();
  
  // Check for explicit frequency mentions
  let frequency: ParsedHorizon['frequency'] = 'quarterly';
  if (/\bweekly\b|\bweek\b/.test(text)) frequency = 'weekly';
  else if (/\bmonthly\b|\bmonth\b/.test(text)) frequency = 'monthly';
  else if (/\byearly\b|\byear\b/.test(text) || /\bdcf\b/.test(text)) frequency = 'yearly';
  
  // Extract count
  let count = 8; // Default
  
  const quarterMatch = text.match(/\b(\d+)\s*quarters?\b/i);
  const yearMatch = text.match(/\b(\d+)\s*years?\b/i);
  const monthMatch = text.match(/\b(\d+)\s*months?\b/i);
  const weekMatch = text.match(/\b(\d+)\s*weeks?\b/i);
  
  if (quarterMatch) {
    count = parseInt(quarterMatch[1], 10);
    frequency = 'quarterly';
  } else if (yearMatch) {
    count = parseInt(yearMatch[1], 10);
    frequency = 'yearly';
  } else if (monthMatch) {
    count = parseInt(monthMatch[1], 10);
    frequency = 'monthly';
  } else if (weekMatch) {
    count = parseInt(weekMatch[1], 10);
    frequency = 'weekly';
  } else if (/\bnext\s+quarter\b/i.test(text)) {
    count = 1;
    frequency = 'quarterly';
  } else if (/\bnext\s+year\b/i.test(text)) {
    count = 1;
    frequency = 'yearly';
  }
  
  // Clamp to reasonable ranges
  if (frequency === 'yearly') {
    count = Math.min(Math.max(count, 3), 10);
  } else {
    count = Math.min(Math.max(count, 4), 16);
  }
  
  return { frequency, count };
}

/**
 * Build period labels
 */
function buildPeriods(frequency: ParsedHorizon['frequency'], count: number): string[] {
  const periods: string[] = [];
  const now = new Date();
  
  if (frequency === 'yearly') {
    const startYear = now.getUTCFullYear() + 1;
    for (let i = 0; i < count; i++) {
      periods.push(String(startYear + i));
    }
  } else if (frequency === 'quarterly') {
    let quarter = Math.floor(now.getUTCMonth() / 3) + 1;
    let year = now.getUTCFullYear();
    
    // Start from next quarter
    quarter += 1;
    if (quarter > 4) {
      quarter = 1;
      year += 1;
    }
    
    for (let i = 0; i < count; i++) {
      periods.push(`${year} Q${quarter}`);
      quarter += 1;
      if (quarter > 4) {
        quarter = 1;
        year += 1;
      }
    }
  } else if (frequency === 'monthly') {
    let month = now.getUTCMonth() + 1;
    let year = now.getUTCFullYear();
    
    // Start from next month
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    
    for (let i = 0; i < count; i++) {
      periods.push(`${year}-${String(month).padStart(2, '0')}`);
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  } else {
    // Weekly - simplified
    for (let i = 1; i <= count; i++) {
      periods.push(`Week ${i}`);
    }
  }
  
  return periods;
}

/**
 * Extract ticker from prompt or context
 */
function extractTicker(prompt: string, context?: ModelBuildInput['context']): string | null {
  if (context?.ticker) return context.ticker.toUpperCase().trim();
  
  const match = prompt.match(/\b[A-Z]{1,5}\b/g) || [];
  const blacklist = new Set(['THE', 'AND', 'FOR', 'WITH', 'BASE', 'UP', 'DOWN', 'Q1', 'Q2', 'Q3', 'Q4', 'SQL', 'DCF', 'LBO', 'NPV', 'ROI', 'IRR']);
  const candidate = match.find((t) => !blacklist.has(t));
  return candidate ? candidate.toUpperCase() : null;
}

/**
 * Infer primary metric from prompt
 */
function inferPrimaryMetric(prompt: string): { key: string; label: string; unit: string; isRevenueLike: boolean } {
  const text = prompt.toLowerCase();
  
  if (/\brevenue\b|\bsales\b/i.test(text)) {
    return { key: 'revenue', label: 'Revenue', unit: '$', isRevenueLike: true };
  }
  if (/\barr\b|\bmrr\b/i.test(text)) {
    return { key: 'arr', label: 'ARR', unit: '$', isRevenueLike: true };
  }
  if (/\bprofit\b|\bnet\s+income\b/i.test(text)) {
    return { key: 'profit', label: 'Net Profit', unit: '$', isRevenueLike: false };
  }
  if (/\bmargin\b/i.test(text)) {
    return { key: 'grossMargin', label: 'Gross Margin', unit: '%', isRevenueLike: false };
  }
  if (/\bunits?\b|\bvolume\b/i.test(text)) {
    return { key: 'units', label: 'Units', unit: 'units', isRevenueLike: false };
  }
  if (/\bcustomers?\b|\busers?\b/i.test(text)) {
    return { key: 'customers', label: 'Customers', unit: 'customers', isRevenueLike: false };
  }
  if (/\bchurn\b/i.test(text)) {
    return { key: 'churnRate', label: 'Churn Rate', unit: '%', isRevenueLike: false };
  }
  if (/\bcash\s+flow\b|\bfcf\b/i.test(text)) {
    return { key: 'fcf', label: 'Free Cash Flow', unit: '$', isRevenueLike: false };
  }
  
  // Default to revenue-like metric
  return { key: 'value', label: 'Value', unit: 'index', isRevenueLike: true };
}

/**
 * Infer decision question from prompt
 */
function inferDecision(prompt: string): string {
  const text = prompt.toLowerCase();
  
  if (/\bshould\s+we\b|\bshould\s+i\b/i.test(text)) {
    return 'Decision: ' + prompt.match(/\bshould\s+(we|i)\s+(.+?)(?:\?|$)/i)?.[2] || 'proceed with proposed action';
  }
  if (/\bwhat\s+if\b/i.test(text)) {
    return 'Decision: Evaluate impact of proposed change';
  }
  if (/\bimpact\b/i.test(text)) {
    return 'Decision: Understand impact of change';
  }
  if (/\btrade[-\s]?off\b/i.test(text)) {
    return 'Decision: Choose optimal balance between competing priorities';
  }
  
  return 'Decision: Answer implied question from prompt';
}

/**
 * Build a simple, decision-oriented model
 */
export function buildMinimumModel(input: ModelBuildInput): ModelAndVizArtifact {
  const { prompt, context } = input;
  
  // Check if model is needed
  const classification = classifyPrompt(prompt);
  if (!classification.buildModel) {
    throw new Error(`Prompt does not require a model: ${classification.reason}`);
  }
  
  const ticker = extractTicker(prompt, context) ?? null;
  const horizon = parseTimeHorizon(prompt, context);
  const periods = buildPeriods(horizon.frequency, horizon.count);
  const metric = inferPrimaryMetric(prompt);
  const decision = inferDecision(prompt);
  
  // Determine model kind
  const kind = /\bdcf\b|\bvaluation\b/i.test(prompt) ? 'dcf' :
               /\bsensitivity\b/i.test(prompt) ? 'sensitivity' :
               'forecast';
  
  // Build inputs based on metric type
  const inputs: Array<{
    key: string;
    label: string;
    value: number;
    unit?: string;
    notes?: string;
    source?: 'user' | 'inferred' | 'placeholder';
  }> = [];
  
  // Baseline value
  const baseline = context?.baseline ?? (metric.unit === 'index' ? 100 : (metric.unit === '$' ? 1000 : 100));
  inputs.push({
    key: 'baseline',
    label: `Starting ${metric.label}`,
    value: baseline,
    unit: metric.unit,
    notes: metric.unit === 'index' ? 'Index baseline to avoid fake absolute numbers' : 'Placeholder baseline value',
    source: 'placeholder',
  });
  
  // Growth rate
  const growthMatch = prompt.match(/(\d+(?:\.\d+)?)\s*%\s*(?:growth|increase)/i);
  const growthRate = growthMatch ? parseFloat(growthMatch[1]) / 100 : 0.05; // Default 5%
  inputs.push({
    key: 'growthRate',
    label: 'Growth Rate',
    value: growthRate * 100,
    unit: '%',
    notes: 'Period-over-period growth rate',
    source: 'placeholder',
  });
  
  // If revenue-like, add margin driver
  if (metric.isRevenueLike && /\bmargin\b|\bprofitability\b/i.test(prompt)) {
    inputs.push({
      key: 'grossMargin',
      label: 'Gross Margin',
      value: 0.3 * 100, // 30%
      unit: '%',
      notes: 'Gross margin percentage',
      source: 'placeholder',
    });
  }
  
  // If units/customers, add price driver and ensure units output exists
  if (metric.key === 'units') {
    inputs.push({
      key: 'pricePerUnit',
      label: 'Price per Unit',
      value: 10,
      unit: '$',
      notes: 'Average price per unit',
      source: 'placeholder',
    });
  }
  
  if (metric.key === 'customers') {
    inputs.push({
      key: 'pricePerUnit',
      label: 'Price per Customer',
      value: 100,
      unit: '$',
      notes: 'Average revenue per customer',
      source: 'placeholder',
    });
  }
  
  // If churn, add retention
  if (metric.key === 'churnRate') {
    inputs.push({
      key: 'startingCustomers',
      label: 'Starting Customers',
      value: 1000,
      unit: 'customers',
      notes: 'Initial customer base',
      source: 'placeholder',
    });
    inputs.push({
      key: 'churnRate',
      label: 'Churn Rate',
      value: 5, // 5% per period
      unit: '%',
      notes: 'Period-over-period churn rate',
      source: 'placeholder',
    });
  }
  
  // Build equations (simple, deterministic)
  const equations: Array<{ key: string; label: string; definition: string }> = [];
  
  if (metric.isRevenueLike && inputs.some(i => i.key === 'grossMargin')) {
    equations.push(
      { key: metric.key, label: metric.label, definition: 'Baseline × (1 + Growth Rate) ^ t' },
      { key: 'grossProfit', label: 'Gross Profit', definition: `${metric.label} × Gross Margin` },
      { key: 'grossProfitMargin', label: 'Gross Margin %', definition: '(Gross Profit / ' + metric.label + ') × 100' }
    );
  } else if (metric.key === 'units') {
    equations.push(
      { key: 'units', label: 'Units', definition: 'Baseline × (1 + Growth Rate) ^ t' },
      { key: 'revenue', label: 'Revenue', definition: 'Units × Price per Unit' }
    );
  } else if (metric.key === 'customers') {
    equations.push(
      { key: 'customers', label: 'Customers', definition: 'Baseline × (1 + Growth Rate) ^ t' },
      { key: 'revenue', label: 'Revenue', definition: 'Customers × Price per Customer' }
    );
  } else if (metric.key === 'churnRate') {
    equations.push(
      { key: 'customers', label: 'Customers', definition: 'Starting Customers × (1 - Churn Rate / 100) ^ t' },
      { key: 'churnRate', label: 'Churn Rate', definition: 'Period-over-period churn percentage (constant)' }
    );
  } else {
    equations.push({
      key: metric.key,
      label: metric.label,
      definition: 'Baseline × (1 + Growth Rate) ^ t',
    });
  }
  
  // Build outputs
  const outputs: Array<{ key: string; label: string; unit?: string }> = [];
  
  // Add primary metric
  if (metric.key === 'units') {
    outputs.push({ key: 'units', label: 'Units', unit: 'units' });
    outputs.push({ key: 'revenue', label: 'Revenue', unit: '$' });
  } else if (metric.key === 'customers') {
    outputs.push({ key: 'customers', label: 'Customers', unit: 'customers' });
    outputs.push({ key: 'revenue', label: 'Revenue', unit: '$' });
  } else if (metric.key === 'churnRate') {
    outputs.push({ key: 'churnRate', label: 'Churn Rate', unit: '%' });
    outputs.push({ key: 'customers', label: 'Customers', unit: 'customers' });
  } else {
    outputs.push({ key: metric.key, label: metric.label, unit: metric.unit });
    
    if (metric.isRevenueLike && inputs.some(i => i.key === 'grossMargin')) {
      outputs.push(
        { key: 'grossProfit', label: 'Gross Profit', unit: '$' },
        { key: 'grossProfitMargin', label: 'Gross Margin', unit: '%' }
      );
    }
  }
  
  // Build evaluation rows (computed)
  const rows = periods.map((period, i) => {
    const growthFactor = Math.pow(1 + growthRate, i);
    const value = baseline * growthFactor;
    
    const row: Record<string, string | number | null> = {
      period,
    };
    
    if (metric.key === 'units') {
      row.units = Number(value.toFixed(0));
      const pricePerUnit = inputs.find(i => i.key === 'pricePerUnit')!.value;
      row.revenue = Number((value * pricePerUnit).toFixed(2));
    } else if (metric.key === 'customers') {
      row.customers = Number(value.toFixed(0));
      const pricePerUnit = inputs.find(i => i.key === 'pricePerUnit')!.value;
      row.revenue = Number((value * pricePerUnit).toFixed(2));
    } else if (metric.key === 'churnRate') {
      const startingCustomers = inputs.find(i => i.key === 'startingCustomers')!.value;
      const churnRate = inputs.find(i => i.key === 'churnRate')!.value / 100; // Convert % to decimal
      row.customers = Number((startingCustomers * Math.pow(1 - churnRate, i)).toFixed(0));
      row.churnRate = Number((churnRate * 100).toFixed(1)); // Convert back to % for display
    } else {
      row[metric.key] = Number(value.toFixed(2));
      
      if (metric.isRevenueLike && inputs.some(i => i.key === 'grossMargin')) {
        const grossMarginPct = inputs.find(i => i.key === 'grossMargin')!.value / 100;
        row.grossProfit = Number((value * grossMarginPct).toFixed(2));
        row.grossProfitMargin = Number((grossMarginPct * 100).toFixed(1));
      }
    }
    
    return row;
  });
  
  // Infer objective metric using existing logic
  const objectiveMetric = inferObjectiveMetricFromPrompt(prompt, outputs);
  
  // Build summary (key metrics)
  const summary = [
    {
      key: 'start',
      label: `Starting ${metric.label}`,
      value: baseline,
      unit: metric.unit,
    },
    {
      key: 'end',
      label: `Ending ${metric.label}`,
      value: Number((baseline * Math.pow(1 + growthRate, periods.length - 1)).toFixed(2)),
      unit: metric.unit,
    },
    {
      key: 'cagr',
      label: 'CAGR',
      value: Number((growthRate * 100).toFixed(1)),
      unit: '%',
    },
  ];
  
  // Build charts
  const charts = [
    {
      name: metric.label,
      chartType: 'line' as const,
      xKey: 'period',
      yKey: metric.key,
      data: rows,
    },
  ];
  
  if (metric.isRevenueLike && inputs.some(i => i.key === 'grossMargin')) {
    charts.push({
      name: 'Gross Margin %',
      chartType: 'line' as const,
      xKey: 'period',
      yKey: 'grossProfitMargin',
      data: rows,
    });
  }
  
  // Build artifact
  const titlePrefix = ticker ? `${ticker} — ` : '';
  const artifact: ModelAndVizArtifact = {
    model: {
      kind: kind === 'dcf' ? 'dcf' : kind === 'sensitivity' ? 'sensitivity' : 'forecast',
      title: `${titlePrefix}${decision} — ${metric.label} Model`,
      index: {
        frequency: horizon.frequency,
        periods,
      },
      inputs,
      equations,
      outputs,
      objective_metric_key: objectiveMetric.key,
      objective_metric_label: objectiveMetric.label,
    },
    evaluation: {
      asOf: new Date().toISOString(),
      rows,
      summary,
    },
    charts,
  };
  
  // Validate before returning
  const validated = ModelAndVizArtifactSchema.safeParse(artifact);
  if (!validated.success) {
    throw new Error(`Invalid model artifact: ${validated.error.message}`);
  }
  
  return validated.data;
}

/**
 * Validate input and build model
 */
export function buildModelFromPrompt(prompt: string, context?: ModelBuildInput['context']): ModelAndVizArtifact {
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('Prompt is required and must be a non-empty string');
  }
  
  return buildMinimumModel({ prompt: prompt.trim(), context });
}

