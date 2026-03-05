export type DataSourceId = 'ticker' | 'manual';

export type PricingAnchor = {
  marketCap?: number;
  sharePrice?: number;
  sharesOutstanding?: number;
};

export interface ModelInputs {
  company: {
    name: string;
    currency: string;
    ticker?: string;
  };
  historicals: {
    years?: number[];
    revenue?: number[];
    ebit?: number[];
    ebitMargin?: number[];
    fcf?: number[];
  };
  assumptions: {
    growth?: number | number[];
    margins?: number | number[];
    taxRate?: number;
    capexPct?: number;
    nwcPct?: number;
    daPct?: number;
    wacc?: number;
    terminalGrowth?: number;
    terminalMultiple?: number;
    projectionYears?: number;
  };
  capitalStructure?: {
    netDebt?: number;
    sharesOutstanding?: number;
  };
  pricingAnchor?: PricingAnchor;
  metadata: {
    source: DataSourceId;
    asOfDate: string;
    scenarioId?: string;
    liveDataFallback?: boolean;
    liveDataStatus?: string;
  };
}

export type TickerHydrateParams = {
  ticker: string;
  asOfDate?: string;
  scenarioId?: string;
};

export type ManualHydrateParams = {
  formData: Record<string, unknown>;
  asOfDate?: string;
  scenarioId?: string;
};

export type HydrateParamsMap = {
  ticker: TickerHydrateParams;
  manual: ManualHydrateParams;
};
