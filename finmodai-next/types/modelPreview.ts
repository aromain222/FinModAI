export type ModelPreviewDriver = {
  label: string;
  value: number;
  direction: 'positive' | 'negative';
};

export type ModelPreviewSparkline = {
  label: string;
  values: number[];
  cagr?: number;
  terminal?: number;
};

export type ModelPreviewSnapshot = {
  ticker: string;
  modelType: string;
  confidence: 'low' | 'medium' | 'high';
  headline: {
    enterpriseValue?: number;
    equityValue?: number;
    pricePerShare?: number;
    upsidePct?: number | null;
    downsidePct?: number | null;
  };
  drivers: ModelPreviewDriver[];
  sparklines: ModelPreviewSparkline[];
  assumptions: {
    revenueCagr?: number;
    ebitdaMargin?: number;
    wacc?: number;
    terminalGrowth?: number;
  };
  aiInsight: string;
  qualityWarnings: string[];
};
