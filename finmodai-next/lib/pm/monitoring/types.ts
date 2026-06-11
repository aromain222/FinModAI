export const QUANT_ANALYST_KEYS = [
  'fundamentals',
  'growth',
  'news_sentiment',
  'sentiment',
  'technicals',
  'valuation',
] as const;

export type QuantAnalystKey = typeof QUANT_ANALYST_KEYS[number];

export type QuantScoreSnapshot = {
  id: string;
  ticker: string;
  analystKey: QuantAnalystKey;
  analystName: string;
  score: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
  watch: string;
  source: 'hedge_fund_monitoring';
  observedAt: string;
  createdAt: string;
};

export type QuantSignalKind =
  | 'score_change'
  | 'valuation_overextended'
  | 'technical_break'
  | 'signal_flip';

export type QuantSignalEventStatus = 'open' | 'escalated' | 'reviewed' | 'dismissed';

export type QuantSignalEvent = {
  id: string;
  ticker: string;
  analystKey: QuantAnalystKey;
  analystName: string;
  kind: QuantSignalKind;
  previousScore: number;
  currentScore: number;
  delta: number;
  threshold: number;
  escalationThreshold: number;
  severity: 'medium' | 'high' | 'critical';
  direction: 'bullish' | 'bearish' | 'neutral';
  summary: string;
  reasoning: string;
  status: QuantSignalEventStatus;
  shouldEscalate: boolean;
  committeeRunId: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type HedgeFundMonitoringSignal = {
  key: QuantAnalystKey;
  name: string;
  group: 'quant';
  score: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
  thesis: string;
  risk: string;
  watch: string;
};

export type HedgeFundMonitoringResult = {
  ticker: string;
  mode: 'monitoring';
  decision: null;
  signals: HedgeFundMonitoringSignal[];
  source?: string;
  degraded?: boolean;
  degradedReason?: string | null;
};

export type CommitteeTrigger = 'signal_event' | 'review_date' | 'user_request' | 'portfolio_rebalance';

export type QuantMonitoringRun = {
  ticker: string;
  snapshots: QuantScoreSnapshot[];
  events: QuantSignalEvent[];
  escalatedEvents: QuantSignalEvent[];
  committeeRunId: string | null;
};
