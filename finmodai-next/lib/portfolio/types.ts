export type PositionStatus =
  | 'building'   // < 3 days since entry
  | 'working'    // thesis holding, score stable/improving
  | 'extended'   // score very high, potentially stretched
  | 'weakening'  // score dropping, thesis drifting
  | 'broken'     // thesis failed, exit candidate
  | 'exited';    // closed

export type ThesisDrift = 'strengthening' | 'stable' | 'weakening';

export type PositionEvent = {
  id: string;
  date: string;
  description: string;
  kind: 'entry' | 'catalyst' | 'thesis_update' | 'risk' | 'exit';
};

export type PositionMonitorAction = 'Add' | 'Hold' | 'Trim' | 'Exit' | 'Watch';

export type PositionMonitorAgentRead = {
  source: 'hedge_fund' | 'tradingagents' | 'dexter';
  stance: string;
  read: string;
  confidence?: number | null;
};

export type PositionMonitorResult = {
  action: PositionMonitorAction;
  confidence: number;
  asOf: string;
  priceRead: string;
  scoreRead: string;
  newsRead: string;
  agentRead: string;
  exitTrigger: string;
  holdTrigger: string;
  riskFlags: string[];
  updatedScore: number;
  updatedSignal: 'green' | 'yellow' | 'red';
  thesisDrift: ThesisDrift;
  agentReads: PositionMonitorAgentRead[];
};

export type ActivePosition = {
  id: string;
  ticker: string;
  entryDate: string;
  entryPrice: number;
  currentPrice: number;
  notionalUsd?: number | null;
  entryScore: number;
  currentScore: number;
  entrySignal: 'green' | 'yellow' | 'red';
  currentSignal: 'green' | 'yellow' | 'red';
  status: PositionStatus;
  thesisDrift: ThesisDrift;
  thesisSummary: string;
  currentStance: string;
  nextCatalyst: string;
  keyRisks: string;
  watchItems: string[];
  timeline: PositionEvent[];
  latestMonitor?: PositionMonitorResult;
  addedAt: string;
  exitedAt?: string;
};
