import type { ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';

export type SmartAssumptionDriverKey =
  | 'revenue_growth'
  | 'operating_margin'
  | 'wacc'
  | 'terminal_growth_rate';

export type SmartAssumptionConfidence = 'low' | 'medium' | 'high';

export type SmartAssumptionCompanyContext = {
  companyName?: string | null;
  ticker?: string | null;
  sector?: string | null;
  industry?: string | null;
};

export type SmartAssumptionCurrentAssumptions = Record<SmartAssumptionDriverKey, number | null>;

export type SmartAssumptionEvidenceSummary = {
  companyProfile: string;
  peerContext: string;
  macroContext: string;
  sources: string[];
};

export type SmartAssumptionChangedDriver = {
  driver: SmartAssumptionDriverKey;
  label: string;
  old: number | null;
  new: number | null;
  rationale: string;
  confidence: SmartAssumptionConfidence;
};

export type SmartAssumptionResult = {
  sourceType: 'smart_assumption_agent';
  subject: {
    companyName: string | null;
    ticker: string | null;
    sector: string | null;
    industry: string | null;
    regime: string;
  };
  modelType: ModelGeneratorType | string | null;
  suggestions: SmartAssumptionCurrentAssumptions;
  changedDrivers: SmartAssumptionChangedDriver[];
  driverRationales: Record<SmartAssumptionDriverKey, string>;
  driverConfidence: Record<SmartAssumptionDriverKey, SmartAssumptionConfidence>;
  provenanceSummary: SmartAssumptionEvidenceSummary;
  warnings: string[];
  normalizedOverrides: Record<string, unknown>;
};

export type SmartAssumptionInput = {
  company: SmartAssumptionCompanyContext;
  currentAssumptions?: Partial<SmartAssumptionCurrentAssumptions> | null;
  modelType?: ModelGeneratorType | string | null;
  origin?: string | null;
};
