import { createHmac, timingSafeEqual } from 'node:crypto';
import type { InvestmentDecision } from '@/lib/pm/types';

export const PHASE2_ABSOLUTE_MAX_NOTIONAL = 50;
export const PHASE2_MAX_DAILY_ORDERS = 2;
export const PHASE2_MAX_DAILY_TURNOVER_PCT = 0.01;
export const PHASE2_MAX_POSITION_PCT = 0.15;
export const PHASE2_MAX_QUOTE_AGE_MS = 60_000;
export const PHASE2_MAX_SPREAD_PCT = 0.01;
export const PHASE2_AUTHORIZATION_TTL_MS = 5 * 60_000;

export type RobinhoodPhase2Snapshot = {
  portfolioValue: number;
  buyingPower: number;
  tradingBlocked: boolean;
  marketOpen: boolean;
  quote: {
    symbol: string;
    last: number;
    bid: number;
    ask: number;
    observedAt: string;
    tradable: boolean;
    assetType: 'stock' | 'etf';
  };
  positions: Array<{ ticker: string; marketValue: number }>;
  openOrderTickers: string[];
  /** Every Robinhood order submitted during the current New York trading day. */
  todayOrderTickers: string[];
  todayOrderCount: number;
  todayOrderNotional: number;
};

type RobinhoodPhase2AuthorizationTicket = {
  version: 1;
  decisionId: string;
  ticker: string;
  maxNotional: number;
  expiresAt: number;
};

type RobinhoodPhase2AuthorizationVerification =
  | { valid: true; ticket: RobinhoodPhase2AuthorizationTicket }
  | { valid: false; error: string };

export type RobinhoodPhase2Authorization = {
  authorized: boolean;
  reasons: string[];
  warnings: string[];
  maxAllowedNotional: number;
  order: null | {
    symbol: string;
    side: 'buy';
    type: 'market';
    dollarAmount: string;
    marketHours: 'regular_hours';
    refId: string;
  };
};

function newYorkTradingDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function today(iso: string, now: Date): boolean {
  const date = new Date(iso);
  return !Number.isNaN(date.getTime()) && newYorkTradingDate(date) === newYorkTradingDate(now);
}

function signTicket(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

/**
 * A short-lived, signed receipt that binds the write-back to the exact
 * decision and dollar amount CapitalBase approved. It is not a broker token.
 */
export function issueRobinhoodPhase2Authorization(params: {
  secret: string;
  decisionId: string;
  ticker: string;
  maxNotional: number;
  now?: Date;
}): string {
  const now = params.now ?? new Date();
  const ticket: RobinhoodPhase2AuthorizationTicket = {
    version: 1,
    decisionId: params.decisionId,
    ticker: params.ticker.toUpperCase(),
    maxNotional: params.maxNotional,
    expiresAt: now.getTime() + PHASE2_AUTHORIZATION_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(ticket)).toString('base64url');
  return `rh2.${encodedPayload}.${signTicket(encodedPayload, params.secret)}`;
}

export function verifyRobinhoodPhase2Authorization(params: {
  authorizationId: string;
  secret: string;
  decisionId: string;
  ticker: string;
  now?: Date;
}): RobinhoodPhase2AuthorizationVerification {
  const parts = params.authorizationId.split('.');
  if (parts.length !== 3 || parts[0] !== 'rh2') return { valid: false, error: 'Authorization receipt is malformed.' };
  const [, encodedPayload, signature] = parts;
  const expected = signTicket(encodedPayload, params.secret);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
    return { valid: false, error: 'Authorization receipt signature is invalid.' };
  }
  try {
    const ticket = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as RobinhoodPhase2AuthorizationTicket;
    const now = params.now ?? new Date();
    if (ticket.version !== 1 || ticket.decisionId !== params.decisionId || ticket.ticker !== params.ticker.toUpperCase()) {
      return { valid: false, error: 'Authorization receipt does not match this decision.' };
    }
    if (!Number.isFinite(ticket.maxNotional) || ticket.maxNotional <= 0 || ticket.maxNotional > PHASE2_ABSOLUTE_MAX_NOTIONAL) {
      return { valid: false, error: 'Authorization receipt has an invalid notional limit.' };
    }
    if (!Number.isFinite(ticket.expiresAt) || now.getTime() > ticket.expiresAt) {
      return { valid: false, error: 'Authorization receipt has expired.' };
    }
    return { valid: true, ticket };
  } catch {
    return { valid: false, error: 'Authorization receipt payload is invalid.' };
  }
}

export function authorizeRobinhoodPhase2Add(params: {
  enabled: boolean;
  decision: InvestmentDecision;
  requestedNotional: number;
  snapshot: RobinhoodPhase2Snapshot;
  recentDecisions: InvestmentDecision[];
  now?: Date;
}): RobinhoodPhase2Authorization {
  const now = params.now ?? new Date();
  const { decision, snapshot } = params;
  const ticker = decision.ticker.toUpperCase();
  const executedToday = params.recentDecisions.filter(item =>
    item.executionBroker === 'robinhood'
    && typeof item.executedAt === 'string'
    && today(item.executedAt, now),
  );
  // Use both CapitalBase receipts and the broker's own day-to-date order
  // summary. Summing can be conservative when the same trade appears in both
  // sources, but cannot understate daily order count or turnover.
  const dailyNotional = executedToday.reduce((sum, item) => sum + (item.executedNotional ?? 0), 0)
    + snapshot.todayOrderNotional;
  const maxByPortfolio = snapshot.portfolioValue * 0.005;
  const maxByDailyTurnover = Math.max(0, snapshot.portfolioValue * PHASE2_MAX_DAILY_TURNOVER_PCT - dailyNotional);
  const maxAllowedNotional = Math.max(0, Math.floor(Math.min(
    PHASE2_ABSOLUTE_MAX_NOTIONAL,
    maxByPortfolio,
    maxByDailyTurnover,
    snapshot.buyingPower,
  ) * 100) / 100);
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!params.enabled) reasons.push('ROBINHOOD_PHASE2_ENABLED is not true.');
  if (!decision.liveExecutionGate?.eligible || decision.liveExecutionGate.phase !== 'robinhood_phase2') {
    reasons.push(...(decision.liveExecutionGate?.blockers ?? ['Decision has no passing Robinhood Phase 2 gate.']));
  }
  if (decision.action !== 'buy' && decision.action !== 'add') reasons.push('Phase 2 permits buy/add decisions only.');
  if (decision.executedAt) reasons.push('Decision has already been executed.');
  const decisionAge = now.getTime() - Date.parse(decision.createdAt);
  if (!Number.isFinite(decisionAge) || decisionAge < 0 || decisionAge > 86_400_000) reasons.push('Decision timestamp is invalid or older than 24 hours.');
  if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(ticker)) reasons.push('Ticker is not a simple US equity symbol.');
  if (snapshot.tradingBlocked) reasons.push('Broker account reports trading blocked.');
  if (!snapshot.marketOpen) reasons.push('Phase 2 trades only during regular market hours.');
  if (!snapshot.quote.tradable || !['stock', 'etf'].includes(snapshot.quote.assetType)) reasons.push('Asset is not a tradable stock or ETF.');
  if (snapshot.quote.symbol.toUpperCase() !== ticker) reasons.push('Quote ticker does not match the decision.');
  const quoteAge = now.getTime() - Date.parse(snapshot.quote.observedAt);
  if (!Number.isFinite(quoteAge) || quoteAge < 0 || quoteAge > PHASE2_MAX_QUOTE_AGE_MS) reasons.push('Quote is stale or has an invalid timestamp.');
  const mid = (snapshot.quote.bid + snapshot.quote.ask) / 2;
  const spreadPct = mid > 0 ? (snapshot.quote.ask - snapshot.quote.bid) / mid : Infinity;
  if (snapshot.quote.ask < snapshot.quote.bid) reasons.push('Quote ask is below bid.');
  if (spreadPct > PHASE2_MAX_SPREAD_PCT) reasons.push(`Bid/ask spread ${(spreadPct * 100).toFixed(2)}% exceeds the 1.00% limit.`);
  if (snapshot.openOrderTickers.map(item => item.toUpperCase()).includes(ticker)) reasons.push('An open broker order already exists for this ticker.');
  if (executedToday.some(item => item.ticker.toUpperCase() === ticker) || snapshot.todayOrderTickers.map(item => item.toUpperCase()).includes(ticker)) {
    reasons.push('Phase 2 permits only one Robinhood action per ticker per day.');
  }
  if (executedToday.length + snapshot.todayOrderCount >= PHASE2_MAX_DAILY_ORDERS) {
    reasons.push(`Daily Robinhood order limit of ${PHASE2_MAX_DAILY_ORDERS} reached.`);
  }
  if (params.requestedNotional <= 0 || params.requestedNotional > maxAllowedNotional) {
    reasons.push(`Requested $${params.requestedNotional.toFixed(2)} exceeds the current Phase 2 allowance of $${maxAllowedNotional.toFixed(2)}.`);
  }
  const currentPosition = snapshot.positions.find(item => item.ticker.toUpperCase() === ticker)?.marketValue ?? 0;
  if (snapshot.portfolioValue <= 0 || (currentPosition + params.requestedNotional) / snapshot.portfolioValue > PHASE2_MAX_POSITION_PCT) {
    reasons.push(`Post-trade ${ticker} exposure would exceed 15% of portfolio value.`);
  }
  if (snapshot.buyingPower - params.requestedNotional < 0) reasons.push('Insufficient buying power.');
  if (spreadPct > 0.005) warnings.push('Spread is above 0.50%; broker review should be inspected before placement.');

  return {
    authorized: reasons.length === 0,
    reasons: [...new Set(reasons)],
    warnings,
    maxAllowedNotional,
    order: reasons.length === 0 ? {
      symbol: ticker,
      side: 'buy',
      type: 'market',
      dollarAmount: params.requestedNotional.toFixed(2),
      marketHours: 'regular_hours',
      refId: decision.id,
    } : null,
  };
}
