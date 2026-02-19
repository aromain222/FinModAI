/**
 * Centralized loading and status copy for CapitalBase.
 * Keyed by tab/section for consistent, finance-grade messaging.
 */

export type LoadingVariant = 'table' | 'cards' | 'chart' | 'model';

export interface TabLoadingConfig {
  title: string;
  subtitle?: string;
  steps: string[];
  variant: LoadingVariant;
}

export interface SectionLoadingConfig {
  label: string;
  steps: string[];
  skeleton: 'row' | 'card' | 'miniChart';
}

export interface EmptyErrorConfig {
  emptyTitle: string;
  emptyHint: string;
  errorTitle: (name: string) => string;
  retryLabel: string;
}

/** Tab-level loading configs */
export const LOADING_TABS: Record<string, TabLoadingConfig> = {
  marketBrief: {
    title: 'Market Brief',
    subtitle: 'Aggregating market-wide financials…',
    steps: [
      'Aggregating market-wide financials…',
      'Connecting to market data…',
      'Fetching latest headlines…',
      'Calculating rising and falling sectors…',
      "Finalizing today's brief…",
    ],
    variant: 'chart',
  },
  sectorMovers: {
    title: 'Sector rotation',
    subtitle: 'Analyzing sector-level performance…',
    steps: [
      'Analyzing sector-level performance…',
      'Pulling sector returns…',
      'Ranking movers…',
    ],
    variant: 'table',
  },
  comps: {
    title: 'Comps',
    subtitle: 'Building comparable company set…',
    steps: [
      'Building comparable company set…',
      'Loading peer financials…',
      'Computing multiples…',
    ],
    variant: 'table',
  },
  marketNews: {
    title: 'Market news',
    subtitle: 'Top stories and impact.',
    steps: [
      'Fetching top stories…',
      'Deduplicating sources…',
      'Summarizing key points…',
      'Mapping potential market impact…',
    ],
    variant: 'cards',
  },
  companyModel: {
    title: 'Building Model Preview',
    subtitle: 'DCF / 3-statement preview.',
    steps: [
      'Loading company financials…',
      'Normalizing line items…',
      'Projecting statements…',
      'Running consistency checks…',
      'Rendering preview…',
    ],
    variant: 'model',
  },
  excelExport: {
    title: 'Preparing Excel',
    subtitle: 'Workbook download.',
    steps: [
      'Formatting workbook…',
      'Styling statements…',
      'Applying checks and totals…',
      'Packaging download…',
    ],
    variant: 'table',
  },
  modelDetail: {
    title: 'Loading Model',
    subtitle: 'Fetching model details.',
    steps: [
      'Loading model metadata…',
      'Fetching results…',
      'Rendering view…',
    ],
    variant: 'model',
  },
  macroDashboard: {
    title: 'Macro Dashboard',
    subtitle: 'Real-time macro indicators and market analysis.',
    steps: [
      'Connecting to macro data…',
      'Loading time series…',
      'Computing metrics…',
      'Finalizing snapshot…',
    ],
    variant: 'chart',
  },
};

/** Section-level loading (inline) */
export const LOADING_SECTIONS: Record<string, SectionLoadingConfig> = {
  sectorRotation: {
    label: 'Sector rotation',
    steps: [
      'Pulling sector returns…',
      'Ranking movers…',
      'Computing relative strength…',
    ],
    skeleton: 'row',
  },
  newsFeed: {
    label: 'Market news',
    steps: [
      'Fetching top stories…',
      'Deduplicating sources…',
      'Summarizing key points…',
      'Mapping potential market impact…',
    ],
    skeleton: 'card',
  },
  performanceChart: {
    label: 'Performance',
    steps: ['Fetching series…', 'Computing range…', 'Rendering chart…'],
    skeleton: 'miniChart',
  },
};

/** Empty / error state copy */
export const EMPTY_ERROR: Record<string, EmptyErrorConfig> = {
  marketBrief: {
    emptyTitle: 'No results yet',
    emptyHint: 'Try widening the date range or refresh in a moment.',
    errorTitle: (name) => `Couldn't load ${name || 'market brief'}`,
    retryLabel: 'Retry',
  },
  marketNews: {
    emptyTitle: 'No news available',
    emptyHint: 'Try again later or refresh.',
    errorTitle: (name) => `Couldn't load ${name || 'market news'}`,
    retryLabel: 'Retry',
  },
  companyModel: {
    emptyTitle: 'No preview yet',
    emptyHint: 'Enter a ticker and generate a model.',
    errorTitle: (name) => `Couldn't load ${name || 'model preview'}`,
    retryLabel: 'Retry',
  },
  excelExport: {
    emptyTitle: 'Download not ready',
    emptyHint: 'Generate the model first, then download.',
    errorTitle: () => "Couldn't prepare Excel",
    retryLabel: 'Try again',
  },
  macroDashboard: {
    emptyTitle: 'No macro data yet',
    emptyHint: 'Try again or refresh.',
    errorTitle: (name) => `Couldn't load ${name || 'macro data'}`,
    retryLabel: 'Retry',
  },
  default: {
    emptyTitle: 'No results yet',
    emptyHint: 'Refresh or try again.',
    errorTitle: (name) => `Couldn't load ${name || 'content'}`,
    retryLabel: 'Retry',
  },
};

export function getTabLoading(key: keyof typeof LOADING_TABS): TabLoadingConfig {
  return LOADING_TABS[key] ?? LOADING_TABS.marketBrief;
}

export function getSectionLoading(key: keyof typeof LOADING_SECTIONS): SectionLoadingConfig {
  return LOADING_SECTIONS[key] ?? LOADING_SECTIONS.newsFeed;
}

export function getEmptyError(key: keyof typeof EMPTY_ERROR): EmptyErrorConfig {
  return EMPTY_ERROR[key] ?? EMPTY_ERROR.default;
}
