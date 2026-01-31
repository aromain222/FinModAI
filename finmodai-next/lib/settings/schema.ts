/**
 * Settings Schema
 * Type definitions and validation for app settings
 */

import { z } from 'zod';

export const AppSettingsSchema = z.object({
  defaultRevenueGrowth: z.number().min(-0.5).max(1.0).default(0.08),
  defaultEbitdaMargin: z.number().min(0).max(1.0).default(0.25),
  defaultWACC: z.number().min(0.01).max(0.30).default(0.10),
  defaultTerminalGrowth: z.number().min(0).max(0.05).default(0.025),
  defaultTaxRate: z.number().min(0).max(0.50).default(0.25),
  defaultCapexPctRevenue: z.number().min(0).max(0.30).default(0.04),
  defaultNwcPctRevenue: z.number().min(-0.20).max(0.30).default(0.10),
  defaultProjectionYears: z.number().min(1).max(10).default(5),
  useAIEnrichment: z.boolean().default(true),
  autoSaveModels: z.boolean().default(true),
  theme: z.enum(['light', 'dark', 'system']).default('system')
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;

export interface AppliedDefault {
  field: string;
  value: any;
  reason: string;
  source: 'user' | 'system' | 'ai' | 'sector';
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultRevenueGrowth: 0.08,
  defaultEbitdaMargin: 0.25,
  defaultWACC: 0.10,
  defaultTerminalGrowth: 0.025,
  defaultTaxRate: 0.25,
  defaultCapexPctRevenue: 0.04,
  defaultNwcPctRevenue: 0.10,
  defaultProjectionYears: 5,
  useAIEnrichment: true,
  autoSaveModels: true,
  theme: 'system'
};
