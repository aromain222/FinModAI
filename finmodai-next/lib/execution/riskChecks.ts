import type { InvestmentDecision } from '@/lib/pm/types';
import type { AlpacaPaperOrderRequest, ExecutionRiskResult } from '@/lib/execution/types';

const DEFAULT_MAX_NOTIONAL = 1_000;
const DEFAULT_MAX_QTY = 1_000;
const APPROVAL_TTL_DAYS = 3;

function readPositiveEnvNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getExecutionLimits(): { maxOrderNotional: number; maxOrderQty: number } {
  return {
    maxOrderNotional: readPositiveEnvNumber('EXECUTION_MAX_ORDER_NOTIONAL', DEFAULT_MAX_NOTIONAL),
    maxOrderQty: readPositiveEnvNumber('EXECUTION_MAX_ORDER_QTY', DEFAULT_MAX_QTY),
  };
}

export function isPaperAlpacaBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.hostname === 'paper-api.alpaca.markets';
  } catch {
    return false;
  }
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  return (Date.now() - ts) / (1000 * 60 * 60 * 24);
}

function numberFromString(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function estimateOrderNotional(order: AlpacaPaperOrderRequest): number | null {
  const notional = numberFromString(order.notional);
  if (notional != null) return notional;
  const qty = numberFromString(order.qty);
  const limit = numberFromString(order.limit_price ?? undefined);
  if (qty != null && limit != null) return qty * limit;
  return null;
}

export function riskCheckPaperOrder(params: {
  decision: InvestmentDecision;
  order: AlpacaPaperOrderRequest;
  dryRun: boolean;
  baseUrl: string;
}): ExecutionRiskResult {
  const { decision, order, dryRun, baseUrl } = params;
  const { maxOrderNotional, maxOrderQty } = getExecutionLimits();
  const reasons: string[] = [];
  const warnings: string[] = [];
  const estimatedNotional = estimateOrderNotional(order);
  const qty = numberFromString(order.qty);

  if (!isPaperAlpacaBaseUrl(baseUrl)) {
    reasons.push('Execution is blocked because the Alpaca base URL is not the paper trading endpoint.');
  }

  if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(order.symbol)) {
    reasons.push('Execution is blocked because the ticker is not a simple US equity symbol.');
  }

  if (!dryRun && decision.approvalStatus !== 'approved') {
    reasons.push('Execution requires a PM-approved decision first.');
  }

  if (decision.executedAt) {
    reasons.push('This PM decision already has an execution timestamp.');
  }

  const approvedAge = daysSince(decision.approvedAt);
  if (!dryRun && approvedAge != null && approvedAge > APPROVAL_TTL_DAYS) {
    reasons.push(`Execution is blocked because the approval is older than ${APPROVAL_TTL_DAYS} days.`);
  }

  if (order.type === 'limit' && !order.limit_price) {
    reasons.push('Limit orders require a limit price.');
  }

  if (!order.qty && !order.notional) {
    reasons.push('Order preview requires either quantity or notional exposure.');
  }

  if (estimatedNotional != null && estimatedNotional > maxOrderNotional) {
    reasons.push(`Order notional $${estimatedNotional.toFixed(2)} exceeds max paper limit $${maxOrderNotional.toFixed(2)}.`);
  }

  if (qty != null && qty > maxOrderQty) {
    reasons.push(`Order quantity ${qty} exceeds max paper share limit ${maxOrderQty}.`);
  }

  if (estimatedNotional == null && order.qty && order.type === 'market') {
    warnings.push('Market quantity order has no notional estimate until Alpaca receives live execution pricing.');
  }

  if (order.extended_hours) {
    warnings.push('Extended-hours orders can behave differently from regular-session orders.');
  }

  return {
    ok: reasons.length === 0,
    blocked: reasons.length > 0,
    reasons,
    warnings,
    estimatedNotional,
    maxOrderNotional,
    maxOrderQty,
  };
}
