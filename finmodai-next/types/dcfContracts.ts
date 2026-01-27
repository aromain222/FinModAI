export type QualityTier = 'preview' | 'institutional';

export interface UnitsSpec {
  currency: 'USD';
  scale: 'MILLIONS';
  shares: 'MILLIONS';
  rates: 'DECIMAL';
}

export const DEFAULT_UNITS_SPEC: UnitsSpec = {
  currency: 'USD',
  scale: 'MILLIONS',
  shares: 'MILLIONS',
  rates: 'DECIMAL',
};

export interface DcfAssumptions {
  ticker: string;
  companyName?: string;
  qualityTier: QualityTier;
  years: number[];
  revenueByYear: number[]; // USD millions
  ebitMargin: number;
  taxRate: number;
  daPercentOfRevenue: number;
  changeInWCPercentOfRevenue: number;
  capexPercentOfRevenue: number;
  wacc: number;
  terminalGrowth: number;
  netDebtMillions: number;
  sharesOutstandingMillions: number;
  unitNotes?: string[];
}

export interface DcfValidation {
  tier: QualityTier;
  isValid: boolean;
  blocking: boolean;
  reasons: string[];
  warnings: string[];
  timestamp: string;
}

export interface DcfResults {
  enterpriseValue: number;
  equityValue: number;
  pricePerShare: number | null;
  netDebtMillions?: number;
  notes?: string[];
  units: UnitsSpec;
  validation: DcfValidation;
  isValid: boolean;
}
