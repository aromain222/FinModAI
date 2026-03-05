export type TriggerQueryId = 'geo' | 'macro' | 'earnings';

export type TriggerQuery = {
  id: TriggerQueryId;
  label: string;
  query: string;
};

// Exactly three high-signal trigger queries per refresh cycle.
export const GEO_QUERY =
  '("invade" OR "invasion" OR "airstrike" OR "missile" OR "retaliation" OR "mobilization" OR "sanctions" OR "export controls" OR "embargo" OR "coup" OR "assassination" OR "border closure" OR "pipeline" OR "strait" OR "shipping")';

export const MACRO_QUERY =
  '("Fed" OR "FOMC" OR "ECB" OR "BOJ" OR "PBoC" OR "rate decision" OR "emergency meeting" OR "liquidity facility" OR "CPI" OR "inflation" OR "jobs report" OR "payrolls" OR "GDP" OR "default" OR "restructuring" OR "bank failure" OR "capital controls" OR "OPEC" OR "production cut")';

export const EARNINGS_QUERY =
  '("NVIDIA" OR "NVDA" OR "Apple" OR "AAPL" OR "Microsoft" OR "MSFT" OR "Amazon" OR "AMZN" OR "Alphabet" OR "GOOGL" OR "Meta" OR "META" OR "Tesla" OR "TSLA") AND ("earnings" OR "guidance" OR "outlook" OR "results" OR "revenue" OR "margin" OR "capex")';

export const TRIGGER_QUERIES: TriggerQuery[] = [
  { id: 'geo', label: 'Geopolitics/Conflict/Sanctions', query: GEO_QUERY },
  { id: 'macro', label: 'Macro/CentralBank/SystemicRisk', query: MACRO_QUERY },
  { id: 'earnings', label: 'MegaCapEarnings', query: EARNINGS_QUERY },
];

export const PROVIDER_FETCH_LIMIT = 25;
export const MAX_FETCH_PER_QUERY_PROVIDER = 40;
