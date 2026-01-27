/**
 * Model Output Schemas
 * 
 * Single source of truth for all model output validation.
 * Ensures computed results are validated before returning to the client.
 */

import { z } from 'zod';

// ============================================================================
// SHARED OUTPUT SCHEMAS
// ============================================================================

/**
 * Preview chart spec
 */
export const ChartSpecSchema = z.object({
  type: z.enum(['line', 'bar', 'area', 'scatter']),
  title: z.string(),
  data: z.array(z.record(z.union([z.string(), z.number()]))),
  xKey: z.string(),
  yKey: z.string().optional(),
  yKeys: z.array(z.string()).optional(),
});

export type ChartSpec = z.infer<typeof ChartSpecSchema>;

/**
 * Assumption display item
 */
export const AssumptionItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
  unit: z.string().optional(),
  category: z.enum(['Operating', 'Capital Structure', 'Valuation']).optional(),
  isDerived: z.boolean().default(false),
});

export type AssumptionItem = z.infer<typeof AssumptionItemSchema>;

/**
 * Model preview structure
 */
export const ModelPreviewSchema = z.object({
  assumptions: z.array(AssumptionItemSchema),
  charts: z.array(ChartSpecSchema).optional(),
  summary: z.string().optional(),
  keyMetrics: z.record(z.union([z.string(), z.number()])).optional(),
});

export type ModelPreview = z.infer<typeof ModelPreviewSchema>;

// ============================================================================
// LBO OUTPUT SCHEMA
// ============================================================================

const LboNumberFieldSchema = z.object({
  value: z.number().finite().optional(),
  reason: z.string().optional(),
  source: z.literal('workbook').optional(),
});

const LboTextFieldSchema = z.object({
  value: z.string().optional(),
  reason: z.string().optional(),
  source: z.literal('workbook').optional(),
});

const LboValuationOutputsSchema = z.object({
  enterpriseValue: LboNumberFieldSchema,
  equityValue: LboNumberFieldSchema,
  netDebt: LboNumberFieldSchema,
  sharesOutstanding: LboNumberFieldSchema,
  pricePerShare: LboNumberFieldSchema,
  irr: LboNumberFieldSchema,
  moic: LboNumberFieldSchema,
  units: LboTextFieldSchema,
});

const ModelChecksPreviewSchema = z.object({
  incomeTies: z.boolean().optional(),
  debtScheduleTies: z.boolean().optional(),
  sourcesUsesBalanced: z.boolean().optional(),
  outlierHandling: z.boolean().optional(),
  issues: z.array(z.string()).optional(),
  safeMode: z.boolean().optional(),
});

export const LBOOutputSchema = z.object({
  dealTerms: z.object({
    entryMultiple: z.number().finite(),
    entryPrice: z.number().finite(),
    leverageMultiple: z.number().finite(),
    holdPeriod: z.number().finite(),
    exitMultiple: z.number().finite(),
  }),
  sourcesAndUses: z.object({
    sources: z.array(z.object({
      item: z.string(),
      amount: z.number().finite(),
    })),
    uses: z.array(z.object({
      item: z.string(),
      amount: z.number().finite(),
    })),
    sourcesTotal: z.number().finite(),
    usesTotal: z.number().finite(),
    reconciles: z.boolean(),
    mismatch: z.number().finite().optional(),
  }),
  returns: z.object({
    irr: z.number().finite(),
    moic: z.number().finite(),
  }),
  debtPaydown: z.object({
    year0: z.number().finite(),
    year1: z.number().finite(),
    year2: z.number().finite(),
    exit: z.number().finite(),
    periods: z.array(z.string()),
  }),
  modelChecks: ModelChecksPreviewSchema.optional(),
  valuation: LboValuationOutputsSchema,
});

export type LBOOutput = z.infer<typeof LBOOutputSchema>;

// ============================================================================
// COMPS OUTPUT SCHEMA
// ============================================================================

export const CompsOutputSchema = z.object({
  // Target company
  target: z.object({
    ticker: z.string(),
    name: z.string().optional(),
    revenue: z.number().finite().positive().optional(),
    ebitda: z.number().finite().optional(),
    ebit: z.number().finite().optional(),
    netIncome: z.number().finite().optional(),
  }),
  
  // Peer companies
  peers: z.array(z.object({
    ticker: z.string(),
    name: z.string().optional(),
    evToRevenue: z.number().finite().optional(),
    evToEBITDA: z.number().finite().optional(),
    evToEBIT: z.number().finite().optional(),
    pe: z.number().finite().optional(),
  })).default([]),
  
  // Multiples distribution
  multiplesDistribution: z.object({
    evToRevenue: z.object({
      min: z.number().finite(),
      median: z.number().finite(),
      max: z.number().finite(),
      mean: z.number().finite(),
    }).optional(),
    evToEBITDA: z.object({
      min: z.number().finite(),
      median: z.number().finite(),
      max: z.number().finite(),
      mean: z.number().finite(),
    }).optional(),
    pe: z.object({
      min: z.number().finite(),
      median: z.number().finite(),
      max: z.number().finite(),
      mean: z.number().finite(),
    }).optional(),
  }).optional(),
  
  // Implied valuation
  impliedValuation: z.object({
    evToRevenue: z.number().finite().optional(),
    evToEBITDA: z.number().finite().optional(),
    evToEBIT: z.number().finite().optional(),
    pe: z.number().finite().optional(),
  }).optional(),
});

export type CompsOutput = z.infer<typeof CompsOutputSchema>;

// ============================================================================
// MERGER OUTPUT SCHEMA
// ============================================================================

export const MergerOutputSchema = z.object({
  maInputs: z.object({
    acquirer: z.object({
      name: z.string(),
      ticker: z.string(),
      sharePrice: z.number().finite(),
      sharesOutstanding: z.number().finite(),
      netIncome: z.number().finite(),
    }),
    target: z.object({
      name: z.string(),
      ticker: z.string(),
      sharePrice: z.number().finite(),
      sharesOutstanding: z.number().finite(),
      netIncome: z.number().finite(),
    }),
    pricing: z.object({
      offerPremiumPct: z.number().finite(),
    }),
    consideration: z.object({
      cashPct: z.number().finite(),
      stockPct: z.number().finite(),
    }),
    synergies: z
      .object({
        revenueSynergiesMm: z.number().finite().optional(),
        costSynergiesMm: z.number().finite().optional(),
      })
      .optional(),
    transaction: z.object({
      feesMm: z.number().finite(),
    }),
  }).optional(),
  maV1: z.object({
    targetEquityValue: z.object({
      value: z.number().finite().optional(),
      reason: z.string().optional(),
    }),
    newSharesIssued: z.object({
      value: z.number().finite().optional(),
      reason: z.string().optional(),
    }),
    proFormaNetIncome: z.object({
      value: z.number().finite().optional(),
      reason: z.string().optional(),
    }),
    proFormaShares: z.object({
      value: z.number().finite().optional(),
      reason: z.string().optional(),
    }),
    standaloneEps: z.object({
      value: z.number().finite().optional(),
      reason: z.string().optional(),
    }),
    proFormaEps: z.object({
      value: z.number().finite().optional(),
      reason: z.string().optional(),
    }),
    accretionPct: z.object({
      value: z.number().finite().optional(),
      reason: z.string().optional(),
    }),
  }).optional(),
  // Deal consideration
  dealConsideration: z.object({
    totalValue: z.number().finite().positive(),
    cashComponent: z.number().finite().nonnegative(),
    stockComponent: z.number().finite().nonnegative(),
  }).optional(),
  
  // Sources & Uses
  sourcesUses: z.object({
    sources: z.record(z.number().finite()),
    uses: z.record(z.number().finite()),
    total: z.number().finite(),
  }).optional(),
  
  // Combined income statement
  combinedIS: z.array(z.object({
    year: z.number().int(),
    revenue: z.object({
      total: z.number().finite(),
      buyer: z.number().finite().optional(),
      target: z.number().finite().optional(),
    }),
    ebitda: z.object({
      total: z.number().finite(),
      buyer: z.number().finite().optional(),
      target: z.number().finite().optional(),
    }),
    netIncome: z.number().finite().optional(),
    eps: z.number().finite().optional(),
  })).optional(),
  
  // EPS analysis
  epsAnalysis: z.object({
    year1: z.object({
      standalone: z.number().finite().optional(),
      proForma: z.number().finite().optional(),
      accretion: z.number().finite().optional(), // %
    }).optional(),
  }).optional(),
  
  // Purchase accounting
  purchaseAccounting: z.object({
    goodwill: z.number().finite().optional(),
    intangibles: z.number().finite().optional(),
    totalAssets: z.number().finite().optional(),
  }).optional(),
  
  // Checks
  checks: z.object({
    balances: z.boolean().optional(),
    sourcesEqualsUses: z.boolean().optional(),
  }).optional(),
  
  // EV bridge
  evBridge: z.array(z.object({
    year: z.number().int(),
    buyerEV: z.number().finite().optional(),
    targetEV: z.number().finite().optional(),
    combinedEV: z.number().finite().optional(),
  })).optional(),
  
  // Revenue/EBITDA trend
  revenueTrend: z.array(z.object({
    year: z.number().int(),
    revenue: z.number().finite(),
  })).optional(),
  ebitdaTrend: z.array(z.object({
    year: z.number().int(),
    ebitda: z.number().finite(),
  })).optional(),
});

export type MergerOutput = z.infer<typeof MergerOutputSchema>;

// ============================================================================
// UNIFIED MODEL OUTPUT
// ============================================================================

export const ModelOutputSchema = z.object({
  modelType: z.enum(['lbo', 'comps', 'merger']),
  modelId: z.string().uuid(),
  ticker: z.string().optional(),
  tickers: z.array(z.string()).optional(),
  
  // Model-specific outputs
  lboOutput: LBOOutputSchema.optional(),
  compsOutput: CompsOutputSchema.optional(),
  mergerOutput: MergerOutputSchema.optional(),
  
  // Preview
  preview: ModelPreviewSchema.optional(),
  
  // Metadata
  warnings: z.array(z.string()).default([]),
  appliedDefaults: z.array(z.object({
    field: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]),
    reason: z.string(),
  })).default([]),
  
  // Timing
  generatedAt: z.string().datetime(),
  elapsedMs: z.number().int().nonnegative().optional(),
});

export type ModelOutput = z.infer<typeof ModelOutputSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate model output before returning to client
 */
export function validateModelOutput(
  modelType: 'lbo' | 'comps' | 'merger',
  output: unknown
): ModelOutput {
  const parsed = ModelOutputSchema.parse(output);
  
  // Ensure model-specific output matches model type
  if (modelType === 'lbo' && !parsed.lboOutput) {
    throw new Error('LBO output missing lboOutput field');
  }
  if (modelType === 'comps' && !parsed.compsOutput) {
    throw new Error('Comps output missing compsOutput field');
  }
  if (modelType === 'merger' && !parsed.mergerOutput) {
    throw new Error('Merger output missing mergerOutput field');
  }
  
  return parsed;
}
