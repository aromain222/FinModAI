import type { ModelInputs } from './modelInputs';

export type ModelSummary = {
  enterpriseValue: number;
  equityValue?: number;
  impliedSharePrice?: number;
  wacc: number;
  terminalValueShare: number;
  notes: string[];
};

export type ModelStatements = {
  projectionYears?: number[];
  revenue?: number[];
  ebit?: number[];
  fcf?: number[];
};

export type ModelChartSeries = {
  id: string;
  label: string;
  values: number[];
};

export type ModelCharts = {
  series: ModelChartSeries[];
};

export type ModelAudit = {
  inputsHash: string;
  timestamp: string;
  generatedAt?: string;
  scenarioId?: string;
  warnings: string[];
  engineVersion: string;
  assumptionsUsed: Record<string, number | string | null>;
};

export interface ModelOutputs {
  templateId: string;
  scenario?: {
    id: string;
    name: string;
  };
  summary: ModelSummary;
  statements?: ModelStatements;
  charts?: ModelCharts;
  audit: ModelAudit;
}

export type EngineIssue = {
  code: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
};

export type HydrationResult = {
  ok: boolean;
  value?: ModelInputs;
  warnings: string[];
  issues: EngineIssue[];
};

export type ValidationResult = {
  ok: boolean;
  value?: ModelInputs;
  warnings: string[];
  issues: EngineIssue[];
};

export type RunModelResult = {
  ok: boolean;
  outputs?: ModelOutputs;
  inputs?: ModelInputs;
  warnings: string[];
  issues: EngineIssue[];
};
