/**
 * Operating Model Input Schema
 * 
 * Strict validation with required input detection.
 * No silent defaults - fail loudly if required inputs are missing.
 */

import { z } from 'zod';

/**
 * Revenue Model Types
 */
export const RevenueModelTypeSchema = z.enum(['saas', 'priceVolume', 'manual']);

/**
 * COGS Model Types
 */
export const CogsModelTypeSchema = z.enum(['pctRevenue', 'unitCost', 'fixedPlusVariable']);

/**
 * Opex Driver Types
 */
export const OpexDriverTypeSchema = z.enum(['fixed', 'pctRevenue']);

/**
 * Schedule Helper (constant or array)
 */
const ScheduleSchema = z.union([
  z.number(), // Constant
  z.array(z.number()).min(1), // Array
]);

/**
 * Main Operating Model Input Schema
 */
export const OperatingModelInputSchema = z.object({
  // Global Settings (ALWAYS REQUIRED)
  startMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Start month must be YYYY-MM format'),
  months: z.number().int().min(12).max(36),
  currency: z.string().default('USD'),
  taxRate: z.number().min(0).max(1),
  startingCash: z.number(),
  
  // Revenue Model (REQUIRED - user must choose one)
  revenueModel: z.object({
    type: RevenueModelTypeSchema,
    // SaaS
    startingCustomers: z.number().min(0).optional(),
    newAdds: ScheduleSchema.optional(), // Constant or schedule
    churnPct: z.number().min(0).max(1).optional(),
    startingARPU: z.number().min(0).optional(),
    expansionPct: z.number().min(0).max(1).optional(),
    // Price×Volume
    startingUnits: z.number().min(0).optional(),
    unitGrowth: ScheduleSchema.optional(),
    startingPrice: z.number().min(0).optional(),
    priceChange: ScheduleSchema.optional(),
    // Manual
    revenueSchedule: z.array(z.number()).optional(),
  }),
  
  // COGS Model (REQUIRED if revenue exists)
  cogsModel: z.object({
    type: CogsModelTypeSchema,
    cogsPct: z.number().min(0).max(1).optional(),
    unitCost: z.number().min(0).optional(),
    fixedCOGS: z.number().min(0).optional(),
    variableCOGSPct: z.number().min(0).max(1).optional(),
  }),
  
  // Opex Model (REQUIRED - explicit categories)
  opexModel: z.object({
    // Headcount (REQUIRED)
    startingHeadcount: z.number().min(0),
    hiresSchedule: z.array(z.number()).min(1), // Array length = months
    fullyLoadedCostPerHead: z.number().min(0),
    rampPctSchedule: z.array(z.number()).min(0).max(1).optional(), // Optional, defaults to 1.0
    
    // Sales & Marketing
    salesMarketing: z.object({
      driverType: OpexDriverTypeSchema,
      monthlyAmount: z.number().min(0).optional(),
      pct: z.number().min(0).max(1).optional(),
    }),
    
    // General & Administrative
    generalAdmin: z.object({
      driverType: OpexDriverTypeSchema,
      monthlyAmount: z.number().min(0).optional(),
      pct: z.number().min(0).max(1).optional(),
    }),
    
    // R&D (optional toggle)
    rndEnabled: z.boolean().default(false),
    rnd: z.object({
      driverType: OpexDriverTypeSchema,
      monthlyAmount: z.number().min(0).optional(),
      pct: z.number().min(0).max(1).optional(),
    }).optional(),
  }),
  
  // Cash & Capital
  capexSchedule: z.array(z.number()).min(1), // Array length = months
  
  // Debt (optional)
  debt: z.object({
    startingDebt: z.number().min(0),
    interestRate: z.number().min(0).max(1),
    principalRepaymentSchedule: z.array(z.number()).min(0).min(1), // Array length = months
  }).optional(),
  
  // Actuals (optional)
  actuals: z.object({
    revenue: z.array(z.number()).optional(),
    cogs: z.array(z.number()).optional(),
    opex: z.array(z.number()).optional(),
    headcount: z.array(z.number()).optional(),
  }).optional(),
}).refine(
  (data) => {
    // Revenue model validation
    if (data.revenueModel.type === 'saas') {
      return data.revenueModel.startingCustomers !== undefined &&
             data.revenueModel.newAdds !== undefined &&
             data.revenueModel.churnPct !== undefined &&
             data.revenueModel.startingARPU !== undefined &&
             data.revenueModel.expansionPct !== undefined;
    }
    if (data.revenueModel.type === 'priceVolume') {
      return data.revenueModel.startingUnits !== undefined &&
             data.revenueModel.unitGrowth !== undefined &&
             data.revenueModel.startingPrice !== undefined &&
             data.revenueModel.priceChange !== undefined;
    }
    if (data.revenueModel.type === 'manual') {
      return data.revenueModel.revenueSchedule !== undefined &&
             data.revenueModel.revenueSchedule.length === data.months;
    }
    return false;
  },
  { message: 'Revenue model inputs incomplete', path: ['revenueModel'] }
).refine(
  (data) => {
    // COGS model validation
    if (data.cogsModel.type === 'pctRevenue') {
      return data.cogsModel.cogsPct !== undefined;
    }
    if (data.cogsModel.type === 'unitCost') {
      return data.cogsModel.unitCost !== undefined && data.revenueModel.type === 'priceVolume';
    }
    if (data.cogsModel.type === 'fixedPlusVariable') {
      return data.cogsModel.fixedCOGS !== undefined && data.cogsModel.variableCOGSPct !== undefined;
    }
    return false;
  },
  { message: 'COGS model inputs incomplete', path: ['cogsModel'] }
).refine(
  (data) => {
    // Opex validation
    if (data.opexModel.salesMarketing.driverType === 'fixed') {
      if (data.opexModel.salesMarketing.monthlyAmount === undefined) return false;
    } else {
      if (data.opexModel.salesMarketing.pct === undefined) return false;
    }
    
    if (data.opexModel.generalAdmin.driverType === 'fixed') {
      if (data.opexModel.generalAdmin.monthlyAmount === undefined) return false;
    } else {
      if (data.opexModel.generalAdmin.pct === undefined) return false;
    }
    
    if (data.opexModel.rndEnabled && data.opexModel.rnd) {
      if (data.opexModel.rnd.driverType === 'fixed') {
        if (data.opexModel.rnd.monthlyAmount === undefined) return false;
      } else {
        if (data.opexModel.rnd.pct === undefined) return false;
      }
    }
    
    return true;
  },
  { message: 'Opex model inputs incomplete', path: ['opexModel'] }
).refine(
  (data) => {
    // Schedule length validation
    if (data.opexModel.hiresSchedule.length !== data.months) return false;
    if (data.capexSchedule.length !== data.months) return false;
    if (data.opexModel.rampPctSchedule && data.opexModel.rampPctSchedule.length !== data.months) return false;
    if (data.debt && data.debt.principalRepaymentSchedule.length !== data.months) return false;
    return true;
  },
  { message: 'Schedule arrays must match months length', path: ['months'] }
);

export type OperatingModelInput = z.infer<typeof OperatingModelInputSchema>;

/**
 * Get missing required inputs (grouped by section)
 */
export function getMissingOperatingInputs(inputs: Partial<OperatingModelInput>): string[] {
  const missing: string[] = [];
  const months = inputs.months || 12;
  
  // Global Settings
  if (!inputs.startMonth) missing.push('Global → Start month (YYYY-MM)');
  if (!inputs.months || inputs.months < 12 || inputs.months > 36) {
    missing.push('Global → Months (12-36)');
  }
  if (inputs.taxRate === undefined) missing.push('Global → Tax rate');
  if (inputs.startingCash === undefined) missing.push('Cash → Starting cash');
  
  // Revenue Model
  if (!inputs.revenueModel || !inputs.revenueModel.type) {
    missing.push('Revenue → Revenue model type');
  } else {
    if (inputs.revenueModel.type === 'saas') {
      if (inputs.revenueModel.startingCustomers === undefined) missing.push('Revenue → Starting customers');
      if (inputs.revenueModel.newAdds === undefined) missing.push('Revenue → New adds (constant or schedule)');
      if (inputs.revenueModel.churnPct === undefined) missing.push('Revenue → Churn %');
      if (inputs.revenueModel.startingARPU === undefined) missing.push('Revenue → Starting ARPU');
      if (inputs.revenueModel.expansionPct === undefined) missing.push('Revenue → Expansion %');
    } else if (inputs.revenueModel.type === 'priceVolume') {
      if (inputs.revenueModel.startingUnits === undefined) missing.push('Revenue → Starting units');
      if (inputs.revenueModel.unitGrowth === undefined) missing.push('Revenue → Unit growth');
      if (inputs.revenueModel.startingPrice === undefined) missing.push('Revenue → Starting price');
      if (inputs.revenueModel.priceChange === undefined) missing.push('Revenue → Price change');
    } else if (inputs.revenueModel.type === 'manual') {
      if (!inputs.revenueModel.revenueSchedule || inputs.revenueModel.revenueSchedule.length !== months) {
        missing.push(`Revenue → Revenue schedule (${months} months)`);
      }
    }
  }
  
  // COGS Model
  if (!inputs.cogsModel || !inputs.cogsModel.type) {
    missing.push('COGS → COGS model type');
  } else {
    if (inputs.cogsModel.type === 'pctRevenue') {
      if (inputs.cogsModel.cogsPct === undefined) missing.push('COGS → COGS %');
    } else if (inputs.cogsModel.type === 'unitCost') {
      if (inputs.cogsModel.unitCost === undefined) missing.push('COGS → Unit cost');
      if (inputs.revenueModel?.type !== 'priceVolume') {
        missing.push('COGS → Unit cost requires Price×Volume revenue model');
      }
    } else if (inputs.cogsModel.type === 'fixedPlusVariable') {
      if (inputs.cogsModel.fixedCOGS === undefined) missing.push('COGS → Fixed COGS');
      if (inputs.cogsModel.variableCOGSPct === undefined) missing.push('COGS → Variable COGS %');
    }
  }
  
  // Opex Model
  if (!inputs.opexModel) {
    missing.push('Opex → Opex model');
  } else {
    if (inputs.opexModel.startingHeadcount === undefined) missing.push('Opex → Starting headcount');
    if (!inputs.opexModel.hiresSchedule || inputs.opexModel.hiresSchedule.length !== months) {
      missing.push(`Opex → Headcount hires schedule (${months} months)`);
    }
    if (inputs.opexModel.fullyLoadedCostPerHead === undefined) {
      missing.push('Opex → Fully loaded cost per head');
    }
    
    // Sales & Marketing
    if (!inputs.opexModel.salesMarketing || !inputs.opexModel.salesMarketing.driverType) {
      missing.push('Opex → Sales & Marketing driver type');
    } else {
      if (inputs.opexModel.salesMarketing.driverType === 'fixed') {
        if (inputs.opexModel.salesMarketing.monthlyAmount === undefined) {
          missing.push('Opex → Sales & Marketing monthly amount');
        }
      } else {
        if (inputs.opexModel.salesMarketing.pct === undefined) {
          missing.push('Opex → Sales & Marketing % of revenue');
        }
      }
    }
    
    // General & Administrative
    if (!inputs.opexModel.generalAdmin || !inputs.opexModel.generalAdmin.driverType) {
      missing.push('Opex → General & Admin driver type');
    } else {
      if (inputs.opexModel.generalAdmin.driverType === 'fixed') {
        if (inputs.opexModel.generalAdmin.monthlyAmount === undefined) {
          missing.push('Opex → General & Admin monthly amount');
        }
      } else {
        if (inputs.opexModel.generalAdmin.pct === undefined) {
          missing.push('Opex → General & Admin % of revenue');
        }
      }
    }
    
    // R&D (if enabled)
    if (inputs.opexModel.rndEnabled) {
      if (!inputs.opexModel.rnd || !inputs.opexModel.rnd.driverType) {
        missing.push('Opex → R&D driver type');
      } else {
        if (inputs.opexModel.rnd.driverType === 'fixed') {
          if (inputs.opexModel.rnd.monthlyAmount === undefined) {
            missing.push('Opex → R&D monthly amount');
          }
        } else {
          if (inputs.opexModel.rnd.pct === undefined) {
            missing.push('Opex → R&D % of revenue');
          }
        }
      }
    }
  }
  
  // Cash & Capital
  if (!inputs.capexSchedule || inputs.capexSchedule.length !== months) {
    missing.push(`Cash → Capex schedule (${months} months)`);
  }
  
  // Debt (if present, validate)
  if (inputs.debt) {
    if (inputs.debt.startingDebt === undefined) missing.push('Debt → Starting debt');
    if (inputs.debt.interestRate === undefined) missing.push('Debt → Interest rate');
    if (!inputs.debt.principalRepaymentSchedule || inputs.debt.principalRepaymentSchedule.length !== months) {
      missing.push(`Debt → Principal repayment schedule (${months} months)`);
    }
  }
  
  return missing;
}

/**
 * Validate inputs and return missing required fields
 */
export function validateOperatingInputs(input: Partial<OperatingModelInput>): {
  isValid: boolean;
  missingRequired: string[];
} {
  const missing = getMissingOperatingInputs(input);
  
  return {
    isValid: missing.length === 0,
    missingRequired: missing,
  };
}
