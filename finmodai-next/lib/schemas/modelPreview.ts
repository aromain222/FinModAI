/**
 * CapitalBase Model Preview Schemas
 * 
 * Unified schema system for all model preview types.
 * Previews are deterministic, never crash, and render even when data is missing.
 */

import { z } from 'zod';

// ============================================================================
// BASE SCHEMA
// ============================================================================

export const ModelTypeSchema = z.enum([
  'MERGER',
  'OPERATING',
  'DCF',
  'LBO',
  'COMPS',
  'THREE_STATEMENT',
]);

export type ModelType = z.infer<typeof ModelTypeSchema>;

export const ConfidenceSchema = z.enum(['Low', 'Medium', 'High']);

export type Confidence = z.infer<typeof ConfidenceSchema>;

export const SourceSchema = z.object({
  provider: z.string(),
  status: z.enum(['live', 'fallback', 'missing']),
  note: z.string().optional(),
});

export type Source = z.infer<typeof SourceSchema>;

export const AssumptionSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export type Assumption = z.infer<typeof AssumptionSchema>;

export const BasePreviewSchema = z.object({
  id: z.string().uuid(),
  modelType: ModelTypeSchema,
  createdAt: z.string().datetime(),
  headline: z.string().max(200),
  confidence: ConfidenceSchema,
  sources: z.array(SourceSchema).default([]),
  assumptions: z.array(AssumptionSchema).default([]),
  keyTakeaways: z.array(z.string()).min(3).max(6),
  risks: z.array(z.string()).min(0).max(6).default([]),
});

// ============================================================================
// VISUALS SCHEMA
// ============================================================================

export const BarCompareVisualSchema = z.object({
  kind: z.literal('bar_compare'),
  title: z.string(),
  aLabel: z.string(),
  aValue: z.number(),
  bLabel: z.string(),
  bValue: z.number(),
  unit: z.string().optional(),
});

export const SparklineVisualSchema = z.object({
  kind: z.literal('sparkline'),
  title: z.string(),
  points: z.array(z.number()),
  unit: z.string().optional(),
});

export const GaugeVisualSchema = z.object({
  kind: z.literal('gauge'),
  title: z.string(),
  value: z.number(),
  min: z.number(),
  max: z.number(),
  unit: z.string().optional(),
});

export const ChipsVisualSchema = z.object({
  kind: z.literal('chips'),
  title: z.string(),
  items: z.array(z.string()),
});

export const VisualSchema = z.discriminatedUnion('kind', [
  BarCompareVisualSchema,
  SparklineVisualSchema,
  GaugeVisualSchema,
  ChipsVisualSchema,
]);

export type Visual = z.infer<typeof VisualSchema>;

export const VisualsSchema = z.array(VisualSchema).default([]);

// ============================================================================
// MERGER MODEL SCHEMA
// ============================================================================

export const AccretionDilutionSchema = z.object({
  year1: z.number(), // Percent value, can be negative
  year2: z.number(), // Percent value, can be negative
});

export type AccretionDilution = z.infer<typeof AccretionDilutionSchema>;

export const MergerKeyAssumptionsSchema = z.object({
  purchaseMultiple: z.string(),
  financingMix: z.string(),
  synergies: z.string(),
});

export type MergerKeyAssumptions = z.infer<typeof MergerKeyAssumptionsSchema>;

export const ProFormaHighlightLabelSchema = z.enum([
  'Revenue',
  'EBITDA',
  'Net Income',
  'EPS',
]);

export const ProFormaHighlightSchema = z.object({
  label: ProFormaHighlightLabelSchema,
  change: z.string(), // e.g., "+15%", "-5%", "Neutral"
});

export type ProFormaHighlight = z.infer<typeof ProFormaHighlightSchema>;

export const MergerPreviewSchema = BasePreviewSchema.extend({
  modelType: z.literal('MERGER'),
  buyerTicker: z.string().min(1).max(10),
  targetTicker: z.string().min(1).max(10),
  accretionDilution: AccretionDilutionSchema,
  keyAssumptions: MergerKeyAssumptionsSchema,
  proFormaHighlights: z.array(ProFormaHighlightSchema).min(1).max(4),
  whoWins: z.array(z.string()).min(0).max(5).default([]),
  visuals: VisualsSchema,
});

export type MergerPreview = z.infer<typeof MergerPreviewSchema>;

// ============================================================================
// OPERATING MODEL SCHEMA
// ============================================================================

export const RunwaySchema = z.object({
  cashMonths: z.number().min(0).max(120),
  burnRate: z.string().max(50), // e.g., "$20-30M/month"
});

export type Runway = z.infer<typeof RunwaySchema>;

export const OperatingTrendSchema = z.object({
  revenue: z.string().max(100), // e.g., "Growing 15-20% YoY"
  margin: z.string().max(100), // e.g., "Expanding 200bp annually"
  opex: z.string().max(100), // e.g., "Growing slower than revenue"
});

export type OperatingTrend = z.infer<typeof OperatingTrendSchema>;

export const SensitivitySchema = z.object({
  variable: z.string().max(50),
  impact: z.string().max(100),
});

export type Sensitivity = z.infer<typeof SensitivitySchema>;

export const OperatingPreviewSchema = BasePreviewSchema.extend({
  modelType: z.literal('OPERATING'),
  ticker: z.string().min(1).max(10),
  runway: RunwaySchema,
  operatingTrend: OperatingTrendSchema,
  sensitivities: z.array(SensitivitySchema).min(1).max(6),
  managementQuestions: z.array(z.string()).min(2).max(6),
  visuals: VisualsSchema,
});

export type OperatingPreview = z.infer<typeof OperatingPreviewSchema>;

// ============================================================================
// PLACEHOLDER SCHEMAS (for future implementation)
// ============================================================================

export const DcfPreviewSchema = BasePreviewSchema.extend({
  modelType: z.literal('DCF'),
  ticker: z.string().min(1).max(10),
  visuals: VisualsSchema,
  // TODO: Add DCF-specific fields
});

export type DcfPreview = z.infer<typeof DcfPreviewSchema>;

export const LboPreviewSchema = BasePreviewSchema.extend({
  modelType: z.literal('LBO'),
  ticker: z.string().min(1).max(10),
  visuals: VisualsSchema,
  // TODO: Add LBO-specific fields
});

export type LboPreview = z.infer<typeof LboPreviewSchema>;

export const CompsPreviewSchema = BasePreviewSchema.extend({
  modelType: z.literal('COMPS'),
  ticker: z.string().min(1).max(10),
  visuals: VisualsSchema,
  // TODO: Add Comps-specific fields
});

export type CompsPreview = z.infer<typeof CompsPreviewSchema>;

export const ThreeStatementPreviewSchema = BasePreviewSchema.extend({
  modelType: z.literal('THREE_STATEMENT'),
  ticker: z.string().min(1).max(10),
  visuals: VisualsSchema,
  // TODO: Add Three-Statement-specific fields
});

export type ThreeStatementPreview = z.infer<typeof ThreeStatementPreviewSchema>;

// ============================================================================
// DISCRIMINATED UNION
// ============================================================================

export const ModelPreviewSchema = z.discriminatedUnion('modelType', [
  MergerPreviewSchema,
  OperatingPreviewSchema,
  DcfPreviewSchema,
  LboPreviewSchema,
  CompsPreviewSchema,
  ThreeStatementPreviewSchema,
]);

export type ModelPreview = z.infer<typeof ModelPreviewSchema>;

export type ModelPreviewUnion =
  | MergerPreview
  | OperatingPreview
  | DcfPreview
  | LboPreview
  | CompsPreview
  | ThreeStatementPreview;

// ============================================================================
// PARSE + VALIDATE HELPER
// ============================================================================

/**
 * Parse and validate model preview input
 * Returns typed output or throws helpful ZodError with path hints
 */
export function parseModelPreview(input: unknown): ModelPreviewUnion {
  try {
    return ModelPreviewSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Format helpful error message with path hints
      const pathHints = error.errors.map((err) => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
      });
      
      throw new Error(
        `Invalid model preview schema:\n${pathHints.join('\n')}\n\n` +
        `Received: ${JSON.stringify(input, null, 2).substring(0, 500)}`
      );
    }
    throw error;
  }
}

/**
 * Safe parse that returns result or null
 */
export function safeParseModelPreview(
  input: unknown
): { success: true; data: ModelPreviewUnion } | { success: false; error: z.ZodError } {
  const result = ModelPreviewSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

// ============================================================================
// DEFAULT BUILDERS
// ============================================================================

/**
 * Generate a realistic default Merger preview
 */
export function buildDefaultMergerPreview(
  buyerTicker: string,
  targetTicker: string
): MergerPreview {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  return {
    id,
    modelType: 'MERGER',
    createdAt: now,
    buyerTicker: buyerTicker.toUpperCase(),
    targetTicker: targetTicker.toUpperCase(),
    headline: `${buyerTicker.toUpperCase()} acquisition of ${targetTicker.toUpperCase()}: Strategic fit with potential synergies`,
    confidence: 'Low',
    sources: [
      { provider: 'CapitalBase', status: 'fallback', note: 'Using sector-typical assumptions' },
    ],
    assumptions: [
      { key: 'Purchase Multiple', value: '8-12x EBITDA (sector-typical)' },
      { key: 'Financing Mix', value: '60% equity, 40% debt' },
      { key: 'Synergies', value: '$50-100M annual run-rate' },
    ],
    keyTakeaways: [
      `Transaction creates scale advantages in combined entity`,
      `Revenue synergies from cross-selling opportunities`,
      `Cost synergies from operational overlap reduction`,
      `EPS accretion expected in Year 1-2 if assumptions hold`,
    ],
    risks: [
      'Integration execution risk',
      'Regulatory approval uncertainty',
    ],
    accretionDilution: {
      year1: 5.0, // +5% EPS accretion
      year2: 8.0, // +8% EPS accretion
    },
    keyAssumptions: {
      purchaseMultiple: '10x EBITDA',
      financingMix: '60% equity / 40% debt',
      synergies: '$75M annual run-rate by Year 3',
    },
    proFormaHighlights: [
      { label: 'Revenue', change: '+25%' },
      { label: 'EBITDA', change: '+30%' },
      { label: 'Net Income', change: '+15%' },
      { label: 'EPS', change: '+5%' },
    ],
    whoWins: [
      `${buyerTicker.toUpperCase()} shareholders (scale benefits)`,
      `${targetTicker.toUpperCase()} shareholders (premium)`,
    ],
    visuals: [
      {
        kind: 'bar_compare',
        title: 'Pro Forma Revenue',
        aLabel: 'Standalone',
        aValue: 1000,
        bLabel: 'Combined',
        bValue: 1250,
        unit: '$M',
      },
      {
        kind: 'gauge',
        title: 'EPS Accretion (Year 1)',
        value: 5.0,
        min: -10,
        max: 20,
        unit: '%',
      },
    ],
  };
}

/**
 * Generate a realistic default Operating preview
 */
export function buildDefaultOperatingPreview(ticker: string): OperatingPreview {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  return {
    id,
    modelType: 'OPERATING',
    createdAt: now,
    ticker: ticker.toUpperCase(),
    headline: `Operating leverage improves if revenue growth holds; cash runway remains manageable`,
    confidence: 'Low',
    sources: [
      { provider: 'CapitalBase', status: 'fallback', note: 'Using sector-typical assumptions' },
    ],
    assumptions: [
      { key: 'Revenue Growth', value: '20-30% YoY (sector-typical)' },
      { key: 'Gross Margin', value: '70-75% (typical SaaS)' },
      { key: 'OpEx Growth', value: 'Slower than revenue (operating leverage)' },
    ],
    keyTakeaways: [
      `Revenue growth trajectory drives operating leverage`,
      `Gross margin expansion supports profitability path`,
      `Cash runway sufficient for growth investments`,
      `Key sensitivities: revenue growth rate and burn efficiency`,
    ],
    risks: [
      'Revenue growth deceleration risk',
      'Competitive pressure on margins',
    ],
    runway: {
      cashMonths: 18,
      burnRate: '$15-25M/month',
    },
    operatingTrend: {
      revenue: 'Growing 20-30% YoY',
      margin: 'Expanding 200-300bp annually',
      opex: 'Growing slower than revenue',
    },
    sensitivities: [
      { variable: '+5% revenue growth', impact: '+2-3 months runway' },
      { variable: '-10% burn rate', impact: '+1-2 months runway' },
      { variable: '+100bp margin expansion', impact: '+1 month runway' },
    ],
    managementQuestions: [
      'What is the path to profitability?',
      'How sustainable is current growth rate?',
      'What are the key operating leverage drivers?',
    ],
    visuals: [
      {
        kind: 'gauge',
        title: 'Cash Runway',
        value: 18,
        min: 0,
        max: 36,
        unit: 'months',
      },
      {
        kind: 'sparkline',
        title: 'Revenue Trend',
        points: [100, 120, 145, 175, 210],
        unit: '$M',
      },
    ],
  };
}

/**
 * Build default preview for any model type
 */
export function buildDefaultPreview(
  modelType: ModelType,
  ticker: string,
  targetTicker?: string
): ModelPreviewUnion {
  switch (modelType) {
    case 'MERGER':
      if (!targetTicker) {
        throw new Error('Merger preview requires both buyerTicker and targetTicker');
      }
      return buildDefaultMergerPreview(ticker, targetTicker);
    case 'OPERATING':
      return buildDefaultOperatingPreview(ticker);
    case 'DCF':
    case 'LBO':
    case 'COMPS':
    case 'THREE_STATEMENT':
      // Placeholder defaults for other model types
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      return {
        id,
        modelType,
        createdAt: now,
        ticker: ticker.toUpperCase(),
        headline: `${ticker.toUpperCase()} ${modelType} model analysis`,
        confidence: 'Low',
        sources: [
          { provider: 'CapitalBase', status: 'fallback', note: 'Using sector-typical assumptions' },
        ],
        assumptions: [
          { key: 'Sector', value: 'Technology (assumed)' },
        ],
        keyTakeaways: [
          'Model analysis based on sector-typical assumptions',
          'Review assumptions for accuracy',
          'Download Excel file for detailed calculations',
        ],
        risks: [],
        visuals: [],
      } as ModelPreviewUnion;
    default:
      throw new Error(`Unknown model type: ${modelType}`);
  }
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isMergerPreview(preview: ModelPreview): preview is MergerPreview {
  return preview.modelType === 'MERGER';
}

export function isOperatingPreview(preview: ModelPreview): preview is OperatingPreview {
  return preview.modelType === 'OPERATING';
}

export function isDcfPreview(preview: ModelPreview): preview is DcfPreview {
  return preview.modelType === 'DCF';
}

export function isLboPreview(preview: ModelPreview): preview is LboPreview {
  return preview.modelType === 'LBO';
}

export function isCompsPreview(preview: ModelPreview): preview is CompsPreview {
  return preview.modelType === 'COMPS';
}

export function isThreeStatementPreview(
  preview: ModelPreview
): preview is ThreeStatementPreview {
  return preview.modelType === 'THREE_STATEMENT';
}

