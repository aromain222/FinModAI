/**
 * CapitalBase Settings Schema
 * 
 * Canonical settings data model with Zod validation.
 * Settings provide defaults and guardrails, never override explicit user inputs.
 */

import { z } from 'zod';

/**
 * Guardrail Action
 */
export const GuardrailActionSchema = z.enum(['warn', 'block']);
export type GuardrailAction = z.infer<typeof GuardrailActionSchema>;

/**
 * Currency Options
 */
export const CurrencySchema = z.enum(['USD', 'EUR', 'GBP']);
export type Currency = z.infer<typeof CurrencySchema>;

/**
 * Revenue Model Types
 */
export const RevenueModelTypeSchema = z.enum(['saas', 'priceVolume', 'manual']);
export type RevenueModelType = z.infer<typeof RevenueModelTypeSchema>;

/**
 * Data Source Options
 */
export const DataSourceSchema = z.enum(['polygon', 'fmp', 'alphavantage']);
export type DataSource = z.infer<typeof DataSourceSchema>;

/**
 * Fallback Strategy
 */
export const FallbackStrategySchema = z.enum(['prompt', 'fail']);
export type FallbackStrategy = z.infer<typeof FallbackStrategySchema>;

/**
 * Reporting Verbosity
 */
export const VerbositySchema = z.enum(['summary', 'full']);
export type Verbosity = z.infer<typeof VerbositySchema>;

/**
 * Excel Style
 */
export const ExcelStyleSchema = z.enum(['compact', 'presentation']);
export type ExcelStyle = z.infer<typeof ExcelStyleSchema>;

/**
 * Main App Settings Schema
 */
export const AppSettingsSchema = z.object({
  profile: z.object({
    displayName: z.string().optional(),
    orgName: z.string().optional(),
  }),
  
  defaults: z.object({
    global: z.object({
      currency: CurrencySchema.default('USD'),
      decimals: z.enum(['0', '1', '2']).default('2').transform(val => parseInt(val) as 0 | 1 | 2),
    }),
    
    valuation: z.object({
      taxRate: z.number().min(0).max(1).optional(),
      terminalGrowth: z.number().min(0).max(1).optional(),
      forecastYears: z.number().int().min(1).max(10).optional(),
      wacc: z.number().min(0).max(1).optional(),
    }),
    
    lbo: z.object({
      holdPeriodYears: z.number().int().min(1).max(10).optional(),
      entryMultiple: z.number().min(0).optional(),
      exitMultiple: z.number().min(0).optional(),
      interestRate: z.number().min(0).max(1).optional(),
      minCash: z.number().min(0).optional(),
      feesPct: z.number().min(0).max(1).optional(),
    }),
    
    merger: z.object({
      taxRate: z.number().min(0).max(1).optional(),
      synergyRampDefault: z.array(z.number().min(0).max(1)).optional(),
      intangiblesPct: z.number().min(0).max(1).optional(),
      intangiblesLifeYears: z.number().int().min(1).max(20).optional(),
      newDebtRate: z.number().min(0).max(1).optional(),
    }),
    
    operating: z.object({
      forecastMonths: z.number().int().min(12).max(36).optional(),
      revenueModelDefault: RevenueModelTypeSchema.optional(),
      hiringRampPct: z.number().min(0).max(1).optional(),
      runwayWarningMonths: z.number().int().min(1).max(36).optional(),
    }),
  }),
  
  guardrails: z.object({
    global: z.object({
      action: GuardrailActionSchema.default('warn'),
    }),
    
    valuation: z.object({
      maxWacc: z.number().min(0).max(1).optional(),
      maxTerminalGrowth: z.number().min(0).max(1).optional(),
    }),
    
    lbo: z.object({
      maxIRR: z.number().min(0).optional(),
      maxLeverage: z.number().min(0).optional(),
      sourcesUsesMustTie: z.object({
        enabled: z.literal(true),
        action: GuardrailActionSchema.default('block'),
      }).optional(),
    }),
    
    merger: z.object({
      maxDilutionPct: z.number().min(0).max(1).optional(),
      sourcesUsesMustTie: z.object({
        enabled: z.literal(true),
        action: GuardrailActionSchema.default('block'),
      }).optional(),
      epsBridgeMustTie: z.object({
        enabled: z.literal(true),
        action: GuardrailActionSchema.default('block'),
      }).optional(),
      requireSynergyCOGS: z.object({
        enabled: z.literal(true),
        action: z.literal('block'),
      }).optional(),
    }),
    
    operating: z.object({
      runwayBelowMonths: z.object({
        months: z.number().int().min(1).max(36),
        action: GuardrailActionSchema.default('warn'),
      }).optional(),
      maxRevenueMoMGrowth: z.number().min(0).optional(),
      maxHeadcountMoMGrowth: z.number().min(0).optional(),
    }),
  }),
  
  data: z.object({
    primarySource: DataSourceSchema.default('polygon'),
    fallbackStrategy: FallbackStrategySchema.default('fail'),
  }),
  
  reporting: z.object({
    verbosity: VerbositySchema.default('summary'),
    excelStyle: ExcelStyleSchema.default('presentation'),
  }),
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;

/**
 * Applied Default Metadata
 */
export interface AppliedDefault {
  path: string; // e.g., "taxRate", "lbo.holdPeriodYears"
  value: any;
  source: 'settings' | 'system';
}
