/**
 * Report Engine Types
 * 
 * Defines the structure for analytical reports generated for each model type.
 */

export type ModelType = 'dcf' | 'lbo' | 'three-statement' | 'comps';

export interface ReportSection {
  title: string;
  content: string[];
}

export interface ModelReport {
  // Header
  companyName: string;
  ticker: string;
  modelType: ModelType;
  generatedAt: string;
  asOfDate: string;
  
  // Executive Summary
  summary: string;
  
  // Key Sections
  sections: ReportSection[];
  
  // What Would Change the Conclusion
  triggers: string[];
  
  // Data Quality Notes
  dataQuality: string[];
}

export interface ReportContext {
  // Company Info
  companyName: string;
  ticker: string;
  sector?: string;
  industry?: string;
  
  // Market Data
  currentPrice?: number;
  marketCap?: number;
  
  // Model Outputs
  keyOutputs: {
    baseValuePerShare?: number;
    bullValuePerShare?: number;
    bearValuePerShare?: number;
    impliedUpsidePct?: number;
    
    // LBO specific
    entryMultiple?: number;
    exitMultiple?: number;
    irr?: number;
    moic?: number;
    
    // Comps specific
    medianMultiple?: number;
    impliedValuationRange?: [number, number];
    
    // 3-Statement specific
    revenueGrowth?: number;
    ebitdaMargin?: number;
    fcfConversion?: number;
  };
  
  // Assumptions
  assumptions?: Record<string, any>;
  
  // Diagnostics
  diagnostics?: Array<{
    title: string;
    message: string;
    severity: 'info' | 'warning' | 'error';
  }>;
  
  // Macro Context (optional)
  macroContext?: {
    riskOnOff?: 'risk-on' | 'risk-off' | 'neutral';
    sectorMomentum?: 'positive' | 'negative' | 'neutral';
  };
}

