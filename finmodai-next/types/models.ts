/**
 * Shared types for financial model generation and preview
 */

import type { DataDiagnostics } from './diagnostics';
import type { LboEngineOutput } from '@/lib/lboEngine';

export type ModelType = 'dcf' | 'lbo' | 'three-statement' | 'comps';

export type Scenario = 'BULLISH' | 'BEARISH' | 'BASE';

export type GenerateModelRequest = {
  ticker: string;
  modelType: ModelType;
  
  // DCF Valuation Engine v7.0 Parameters
  scenario?: Scenario;              // BULLISH, BEARISH, or BASE (default: BASE)
  wacc?: number;                    // User-defined WACC (overrides calculated WACC)
  terminalGrowth?: number;          // User-defined terminal growth rate
  
  // Optional model-specific parameters
  [key: string]: any;
};

export type ModelPreview = {
  sheetName: string;
  columns: string[];
  rows: (string | number | null)[][];
};

export type DcfScenarioSummary = {
  scenario: Scenario;
  valuationResults: {
    enterpriseValue: number;
    equityValue: number;
    pricePerShare: number | null;
  };
  keyAssumptions: {
    wacc: number;
    waccSource: 'user-defined' | 'calculated' | 'inferred';
    terminalGrowth: number;
    year1RevenueGrowth?: number;
    ebitdaMargin?: number;
  };
  scenarioAdjustments?: string[];
  formattedOutput: string;
};

export type GenerateModelResponse = {
  modelId: string;
  ticker: string;
  modelType: ModelType;
  createdAt: string;
  downloadUrl: string;
  preview: ModelPreview;
  diagnostics?: DataDiagnostics[];  // Data quality diagnostics
  
  // DCF Valuation Engine v7.0 Output
  dcfSummary?: DcfScenarioSummary;
  scenarioSummaries?: Partial<Record<'base' | 'bull' | 'bear', DcfScenarioSummary>>;

  lboSummary?: LboEngineOutput;
};

export type ModelRecord = {
  id: string;
  ticker: string;
  model_type: ModelType;
  path: string;
  created_at: string;
  updated_at: string;
};
