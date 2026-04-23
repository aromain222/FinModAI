export type FinancialExtractionLane = 'public' | 'private';

export type FinancialExtractionPeriodType = 'annual' | 'quarterly' | 'ltm';

export type FinancialExtractionStage =
  | 'queued'
  | 'resolving_company'
  | 'discovering_sources'
  | 'extracting'
  | 'normalizing'
  | 'reconciling'
  | 'mapping'
  | 'completed'
  | 'failed';

export type FinancialValidationSeverity = 'warning' | 'blocking_error';

export type FinancialValidationState = 'ok' | 'warning' | 'blocking_error';

export type FinancialMetricKey =
  | 'revenue'
  | 'gross_profit'
  | 'ebitda'
  | 'ebit'
  | 'cash'
  | 'total_debt'
  | 'shares_outstanding'
  | 'share_price'
  | 'market_cap';

export type FinancialFactUnit = 'currency' | 'shares' | 'price';

export type FinancialFactScale = 'actual' | 'thousands' | 'millions' | 'billions';

export type SourceArtifactType =
  | 'stored_company_snapshot'
  | 'provider_snapshot'
  | 'sec_companyfacts'
  | 'uploaded_spreadsheet'
  | 'uploaded_pdf'
  | 'uploaded_cim'
  | 'uploaded_deck'
  | 'local_file'
  | 'unknown_private_file';

export type ResolvedCompanyIdentity = {
  companyId?: string | null;
  companyName: string;
  ticker?: string | null;
  cik?: string | null;
  compositeFigi?: string | null;
  lane: FinancialExtractionLane;
  source: string;
  companyType?: string | null;
  resolvedFrom: string[];
};

export type ExtractionSourceArtifact = {
  id: string;
  lane: FinancialExtractionLane;
  sourceType: SourceArtifactType;
  sourceLabel: string;
  sourceUrlOrFileId: string;
  asOfDate?: string | null;
  periodType?: FinancialExtractionPeriodType | null;
  fetchedAt: string;
  pageRefs?: number[];
  sheetNames?: string[];
  metadata?: Record<string, unknown>;
};

export type NormalizedFinancialFact = {
  metricKey: FinancialMetricKey;
  value: number;
  unit: FinancialFactUnit;
  scale: FinancialFactScale;
  periodType: FinancialExtractionPeriodType;
  fiscalYear?: number | null;
  fiscalPeriod?: string | null;
  asOfDate?: string | null;
  sourceType: SourceArtifactType;
  sourceLabel: string;
  sourceUrlOrFileId: string;
  confidence: number;
  notes?: string | null;
  page?: number | null;
  sheetName?: string | null;
};

export type FinancialValidationFinding = {
  severity: FinancialValidationSeverity;
  code: string;
  message: string;
  metricKey?: FinancialMetricKey;
  sourceRef?: string;
};

export type MappedModelInputs = {
  companyName: string;
  ticker?: string | null;
  asOfDate?: string | null;
  periodType: FinancialExtractionPeriodType;
  revenue?: number | null;
  grossProfit?: number | null;
  ebitda?: number | null;
  ebit?: number | null;
  cash?: number | null;
  totalDebt?: number | null;
  sharesOutstanding?: number | null;
  sharePrice?: number | null;
  marketCap?: number | null;
  netDebt?: number | null;
  source: string;
  sourceAttribution: string[];
};

export type ValidatedFinancialSnapshot = {
  companyName: string;
  ticker?: string | null;
  cik?: string | null;
  lane: FinancialExtractionLane;
  validationState: FinancialValidationState;
  warnings: string[];
  blockingErrors: string[];
  facts: NormalizedFinancialFact[];
  mappedModelInputs: MappedModelInputs | null;
  sourceArtifacts: ExtractionSourceArtifact[];
};

export type FinancialExtractionJobRequest = {
  lane: FinancialExtractionLane;
  ticker?: string | null;
  companyIdentifier?: string | null;
  companyName?: string | null;
  fileIds?: string[];
  targetPeriodType?: FinancialExtractionPeriodType | null;
  targetModelType?: string | null;
};

export type FinancialExtractionJob = {
  id: string;
  lane: FinancialExtractionLane;
  stage: FinancialExtractionStage;
  validationState: FinancialValidationState | null;
  request: FinancialExtractionJobRequest;
  resolvedIdentity: ResolvedCompanyIdentity | null;
  sourceArtifacts: ExtractionSourceArtifact[];
  facts: NormalizedFinancialFact[];
  validationFindings: FinancialValidationFinding[];
  mappedModelInputs: MappedModelInputs | null;
  snapshot: ValidatedFinancialSnapshot | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};
