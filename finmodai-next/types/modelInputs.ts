import { z } from 'zod';

export type DataSourceMode = 'ticker' | 'manual';

export type PricingAnchor = {
  marketCap?: number;
  sharePrice?: number;
  sharesOutstanding?: number;
};

export interface ModelInputs {
  company: {
    name: string;
    currency: string;
    ticker?: string;
  };
  historicals: {
    revenue: number[];
    years?: number[];
  };
  assumptions: {
    growth: number;
    margin: number;
    taxRate: number;
    capexPctRevenue: number;
    nwcPctRevenue: number;
    daPctRevenue?: number;
    // Optional compatibility extensions for existing templates.
    growthSeries?: number[];
    forecastRevenue?: number[];
  };
  capitalStructure?: {
    netDebt?: number;
    sharesOutstanding?: number;
  };
  pricingAnchor?: PricingAnchor;
  metadata: {
    source: DataSourceMode;
    asOfDate: string;
    liveDataFallback?: boolean;
    liveDataStatus?: string;
  };
}

export const RevenueHistoryPointSchema = z.object({
  year: z.coerce.number().int().min(1900).max(2200),
  revenue: z.coerce.number().positive(),
});

export const ManualInputsSchema = z
  .object({
    companyName: z.string().trim().min(1, 'Company name is required'),
    currency: z.string().trim().min(1).default('USD'),
    ticker: z.string().trim().optional(),
    ltmRevenue: z.coerce.number().positive().optional(),
    historicalRevenue: z.array(RevenueHistoryPointSchema).min(1).max(3).optional(),
    growthAssumption: z.coerce.number().optional(),
    forecastRevenue: z.array(z.coerce.number().positive()).length(5).optional(),
    marginType: z.enum(['ebit', 'ebitda']).default('ebitda'),
    marginAssumption: z.coerce.number().optional(),
    taxRate: z.coerce.number(),
    capexPctRevenue: z.coerce.number(),
    nwcPctRevenue: z.coerce.number(),
    daPctRevenue: z.coerce.number().optional(),
    netDebt: z.coerce.number().optional(),
    sharesOutstanding: z.coerce.number().positive().optional(),
    sharePrice: z.coerce.number().positive().optional(),
    marketCap: z.coerce.number().positive().optional(),
    asOfDate: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.ltmRevenue && (!value.historicalRevenue || value.historicalRevenue.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ltmRevenue'],
        message: 'Provide LTM revenue or 1-3 years of historical revenue.',
      });
    }
    if (!value.growthAssumption && (!value.forecastRevenue || value.forecastRevenue.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['growthAssumption'],
        message: 'Provide growth assumption or explicit forecast revenue series.',
      });
    }
    if (value.marginAssumption === undefined || Number.isNaN(value.marginAssumption)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['marginAssumption'],
        message: 'Margin assumption is required.',
      });
    }
  });

export type ManualInputs = z.infer<typeof ManualInputsSchema>;
