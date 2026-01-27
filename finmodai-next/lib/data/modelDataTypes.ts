import type { MacroNewsArticle } from '@/types/macro';
import type { CompanyFinancials } from '@/types/compsModel';
import type { EventItem } from '@/lib/market_data/providers/types';
import type { MarketRange, MarketSeries } from '@/lib/market/provider';
import type { SharesResult } from '@/lib/data/sharesOutstanding';
import type { PeerSelectionDiagnostics } from '@/lib/identifyPeers';
import type { ModelingModelType } from '@/lib/modeling/normalizeInputs';

export type ModelDataRange = {
  start: string;
  end: string;
  marketRange: MarketRange;
};

export type ModelDataPeerOptions = {
  customPeers?: string[];
  useOnlyCustom?: boolean;
  allowAuto?: boolean;
};

export type GetModelDataParams = {
  modelType: ModelingModelType;
  primaryTicker: string;
  dateRange?: Partial<ModelDataRange>;
  tickers?: string[];
  peerOptions?: ModelDataPeerOptions;
  traceId?: string;
};

export type ModelDataResult = {
  resolvedTickers: string[];
  range: ModelDataRange;
  prices: Record<string, MarketSeries>;
  financials: Record<string, CompanyFinancials>;
  shares: Record<string, SharesResult>;
  filings: Record<string, EventItem[]>;
  peers?: {
    list: string[];
    diagnostics?: PeerSelectionDiagnostics | null;
  };
  news: MacroNewsArticle[];
};
