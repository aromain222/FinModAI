export interface ModelReport {
  id: string;
  modelId: string;
  modelType: string;
  ticker: string;
  title: string;
  // Legacy reports are stored as markdown in `content`. Newer report UIs may
  // provide structured fields in addition to (or instead of) markdown.
  content: string;
  format: 'markdown' | 'html' | 'pdf';
  createdAt: string;

  // Optional structured report fields (used by CapitalBaseReportView).
  generatedAt?: string;
  subtitle?: string;
  oneLineSummary?: string;
  keyTakeaways?: string[];
  companySnapshot?: {
    businessModel?: string;
    revenueDrivers?: string[];
    marginProfile?: string;
    capitalStructure?: string;
  };
  valuationSummary?: {
    headline?: string;
    baseCase?: string;
    bullCase?: string;
    bearCase?: string;
    upsideDownsideCommentary?: string;
  };
  macroContext?: {
    regimeLabel?: string;
    themes?: string[];
  };
  riskAndMitigants?: {
    risks?: string[];
    mitigants?: string[];
  };
  processNotes?: string;
}
