export type StrictFinancialMetric =
  | 'revenue'
  | 'ebitda'
  | 'net_income'
  | 'free_cash_flow'
  | 'debt'
  | 'cash';

export type StrictFinancialPeriodType = 'annual' | 'quarterly' | 'ltm';

export type StrictSourceProvider = 'sec_edgar' | 'fmp' | 'polygon';

export type StrictPipelineStep =
  | 'SOURCE_FETCHER'
  | 'EXTRACTOR'
  | 'VALIDATOR'
  | 'MODEL_BUILDER';

export type StrictExplicitAssumptions = {
  wacc: number | null;
  terminal_growth: number | null;
  tax_rate: number | null;
};

export type StrictPipelineRequest = {
  ticker: string;
  company_identifier: string | null;
  period_type: StrictFinancialPeriodType;
  target_model_type: string;
  explicit_assumptions: StrictExplicitAssumptions;
};

export type StrictSourceArtifact = {
  source_id: string;
  provider: StrictSourceProvider;
  artifact_type: 'filing' | 'api_response';
  source_url: string;
  fetched_at: string;
  as_of_date: string | null;
  period_type: StrictFinancialPeriodType | null;
};

export type StrictMetricObservation = {
  value: number | null;
  unit: 'usd';
  source_id: string;
  source_url: string;
  provider: StrictSourceProvider;
  as_of_date: string | null;
  period_type: StrictFinancialPeriodType;
  field_path: string;
};

export type StrictExtractedMetric = {
  observations: StrictMetricObservation[];
};

export type StrictExtractedMetrics = Record<StrictFinancialMetric, StrictExtractedMetric>;

export type StrictMetricConflict = {
  metric: string;
  period_type: string;
  sources: string[];
  values: string[];
};

export type StrictValidatedMetric = {
  value: number;
  unit: 'usd';
  observations: StrictMetricObservation[];
};

export type StrictValidatedMetrics = Partial<Record<StrictFinancialMetric, StrictValidatedMetric>>;

export type StrictModelInputValue = {
  value: number | string;
  source: string[];
};

export type StrictModelInputs = Record<string, StrictModelInputValue>;

export type StrictSourceAttribution = Record<
  string,
  {
    source_ids: string[];
    source_urls: string[];
  }
>;

export type StrictPipelineFailure = {
  status: 'FAILURE';
  step: StrictPipelineStep;
  reason: string;
  missing_fields: string[];
  conflicts: StrictMetricConflict[];
};

export type StrictPipelineSuccess = {
  status: 'SUCCESS';
  request: {
    ticker: string;
    period_type: StrictFinancialPeriodType;
    target_model_type: string;
  };
  steps: {
    SOURCE_FETCHER: {
      status: 'SUCCESS';
      artifacts: StrictSourceArtifact[];
    };
    EXTRACTOR: {
      status: 'SUCCESS';
      metrics: StrictExtractedMetrics;
    };
    VALIDATOR: {
      status: 'SUCCESS';
      validated_metrics: StrictValidatedMetrics;
      missing_fields: string[];
      conflicts: StrictMetricConflict[];
    };
    MODEL_BUILDER: {
      status: 'SUCCESS';
      model_inputs: StrictModelInputs;
      source_attribution: StrictSourceAttribution;
    };
  };
};

export type StrictPipelineResult = StrictPipelineFailure | StrictPipelineSuccess;

export type StrictPipelineArtifactBundle = {
  artifact: StrictSourceArtifact;
  raw: unknown;
};
