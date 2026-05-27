import type { InvestmentDecision } from '@/lib/pm/types';

export type ExecutionMode = 'paper';
export type AlpacaOrderSide = 'buy' | 'sell';
export type AlpacaOrderType = 'market' | 'limit';
export type AlpacaTimeInForce = 'day' | 'gtc';

export type PaperOrderInput = {
  decisionId: string;
  dryRun?: boolean;
  qty?: number;
  notional?: number;
  orderType?: AlpacaOrderType;
  limitPrice?: number;
  timeInForce?: AlpacaTimeInForce;
  extendedHours?: boolean;
};

export type AlpacaPaperOrderRequest = {
  symbol: string;
  side: AlpacaOrderSide;
  type: AlpacaOrderType;
  time_in_force: AlpacaTimeInForce;
  qty?: string;
  notional?: string;
  limit_price?: string;
  extended_hours?: boolean;
  client_order_id?: string;
};

export type AlpacaPaperOrder = {
  id: string;
  client_order_id?: string;
  created_at?: string;
  updated_at?: string;
  submitted_at?: string;
  filled_at?: string | null;
  symbol: string;
  qty?: string;
  notional?: string;
  side: AlpacaOrderSide;
  type: AlpacaOrderType;
  time_in_force: AlpacaTimeInForce;
  limit_price?: string | null;
  status?: string;
};

export type AlpacaPaperAccount = {
  id?: string;
  status?: string;
  currency?: string;
  buying_power?: string;
  cash?: string;
  portfolio_value?: string;
  pattern_day_trader?: boolean;
  trading_blocked?: boolean;
  transfers_blocked?: boolean;
  account_blocked?: boolean;
};

export type ExecutionRiskResult = {
  ok: boolean;
  blocked: boolean;
  reasons: string[];
  warnings: string[];
  estimatedNotional: number | null;
  maxOrderNotional: number;
  maxOrderQty: number;
};

export type PaperExecutionPreview = {
  mode: ExecutionMode;
  decision: InvestmentDecision;
  order: AlpacaPaperOrderRequest;
  risk: ExecutionRiskResult;
};

export type PaperExecutionResult = PaperExecutionPreview & {
  submitted: boolean;
  alpacaOrder?: AlpacaPaperOrder;
};
