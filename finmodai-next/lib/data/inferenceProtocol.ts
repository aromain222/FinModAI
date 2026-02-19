/**
 * Inference Protocol
 * Protocol for inferring missing data points
 * 
 * NOTE: This file now delegates to enhancedInference.ts for comprehensive data filling
 */

import { inferMissingDataEnhanced, type InferenceResult, applyInferences } from './enhancedInference';

export type { InferenceResult };

/**
 * Legacy function - now uses enhanced inference
 */
export async function inferMissingData(
  data: Record<string, any>,
  missingFields: string[],
  sector?: string,
  historicalData?: Record<string, number[]>
): Promise<InferenceResult[]> {
  return inferMissingDataEnhanced(data, missingFields, sector, historicalData);
}

// Stub inference functions for compatibility
export function inferCapexPercentage(historical: number[], sector?: string): number {
  if (historical && historical.length > 0) {
    return historical.reduce((a, b) => a + b, 0) / historical.length;
  }
  return 0.04; // Default 4%
}

export function inferDAPercentage(historical: number[], revenue: number[], capexPct: number, sector?: string): number {
  if (historical && historical.length > 0) {
    return historical.reduce((a, b) => a + b, 0) / historical.length;
  }
  return capexPct * 0.8; // Rough estimate: DA is usually ~80% of capex
}

export function inferWorkingCapitalPercentage(historical: number[], revenue: number[], sector?: string): number {
  if (historical && historical.length > 0) {
    return historical.reduce((a, b) => a + b, 0) / historical.length;
  }
  return 0.10; // Default 10%
}

export function inferWACC(sector?: string, riskFreeRate?: number, marketRiskPremium?: number): { value: number; method: string; confidence: 'high' | 'medium' | 'low' } {
  return {
    value: 0.10, // Default 10% WACC
    method: 'sector-default',
    confidence: 'medium'
  };
}

export function inferTerminalGrowth(sector?: string, gdpGrowth?: number): { value: number; method: string; confidence: 'high' | 'medium' | 'low' } {
  return {
    value: 0.025, // Default 2.5% terminal growth
    method: 'gdp-growth-estimate',
    confidence: 'medium'
  };
}

export function logInferredValue(field: string, value: any, method?: string, confidence?: 'high' | 'medium' | 'low'): void {
  // Handle both object and primitive value formats
  if (typeof value === 'object' && value !== null) {
    const val = value.value ?? value;
    const meth = value.method || method || 'unknown';
    const conf = value.confidence || confidence || 'low';
    console.log(`[Inference] ${field}: ${val} (${meth}, ${conf} confidence)`);
  } else {
    const val = value ?? 'N/A';
    const meth = method || 'unknown';
    const conf = confidence || 'low';
    console.log(`[Inference] ${field}: ${val} (${meth}, ${conf} confidence)`);
  }
}

export function createInferenceSummary(inferences: Record<string, any>): string {
  const entries = Object.entries(inferences);
  if (entries.length === 0) return 'No inferences made';
  return entries.map(([k, v]) => `${k}: ${v}`).join(', ');
}
