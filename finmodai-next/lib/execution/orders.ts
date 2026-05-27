import { updateDecision, listDecisions } from '@/lib/pm/decisions/decisionStore';
import { recordOutcome } from '@/lib/pm/memory/recordOutcome';
import type { InvestmentDecision, TradeAction } from '@/lib/pm/types';
import { alpacaPaperBaseUrl, submitAlpacaPaperOrder } from '@/lib/execution/alpacaPaper';
import { riskCheckPaperOrder } from '@/lib/execution/riskChecks';
import type {
  AlpacaOrderSide,
  AlpacaPaperOrderRequest,
  PaperExecutionPreview,
  PaperExecutionResult,
  PaperOrderInput,
} from '@/lib/execution/types';

export async function getDecisionForExecution(id: string): Promise<InvestmentDecision | null> {
  const decisions = await listDecisions({ limit: 500 });
  return decisions.find(decision => decision.id === id) ?? null;
}

function sideFromAction(action: TradeAction): AlpacaOrderSide | null {
  if (action === 'buy' || action === 'add' || action === 'cover') return 'buy';
  if (action === 'sell' || action === 'trim' || action === 'exit') return 'sell';
  return null;
}

export function isExecutableTradeAction(action: TradeAction): boolean {
  return sideFromAction(action) != null;
}

function formatDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

export function buildPaperOrder(decision: InvestmentDecision, input: PaperOrderInput): AlpacaPaperOrderRequest {
  const side = sideFromAction(decision.action);
  if (!side) {
    throw new Error(`Decision action "${decision.action}" cannot be converted into a paper order.`);
  }

  const orderType = input.orderType ?? 'market';
  const order: AlpacaPaperOrderRequest = {
    symbol: decision.ticker.toUpperCase(),
    side,
    type: orderType,
    time_in_force: input.timeInForce ?? 'day',
    extended_hours: input.extendedHours,
    client_order_id: `capitalbase-${decision.id.slice(0, 24)}`,
  };

  if (input.qty != null) order.qty = formatDecimal(input.qty);
  if (input.notional != null) order.notional = formatDecimal(input.notional);
  if (orderType === 'limit' && input.limitPrice != null) order.limit_price = formatDecimal(input.limitPrice);

  return order;
}

export async function previewPaperExecution(input: PaperOrderInput): Promise<PaperExecutionPreview> {
  const decision = await getDecisionForExecution(input.decisionId);
  if (!decision) throw new Error('PM decision not found.');

  const order = buildPaperOrder(decision, input);
  const risk = riskCheckPaperOrder({
    decision,
    order,
    dryRun: input.dryRun ?? true,
    baseUrl: alpacaPaperBaseUrl(),
  });

  return { mode: 'paper', decision, order, risk };
}

export async function submitApprovedPaperExecution(input: PaperOrderInput): Promise<PaperExecutionResult> {
  const preview = await previewPaperExecution({ ...input, dryRun: false });
  if (preview.risk.blocked) {
    throw new Error(`Paper execution blocked: ${preview.risk.reasons.join(' ')}`);
  }

  const alpacaOrder = await submitAlpacaPaperOrder(preview.order);
  const executedAt = new Date().toISOString();
  const executionNote = `Alpaca paper order ${alpacaOrder.id} submitted: ${preview.order.side.toUpperCase()} ${preview.order.qty ?? `$${preview.order.notional}`} ${preview.order.symbol}.`;

  const updatedDecision = await updateDecision(preview.decision.id, {
    ...preview.decision,
    executedAt,
    executionNote,
    updatedAt: executedAt,
  });

  try {
    await recordOutcome({
      memoryType: 'process_lesson',
      lesson: `${preview.order.symbol} PM-approved ${preview.order.side.toUpperCase()} decision was submitted to Alpaca paper trading. ${executionNote}`,
      relatedTickers: [preview.order.symbol],
      relatedThemes: ['paper_execution'],
      importance: 75,
    });
  } catch {
    // Execution result should not fail because PM memory persistence is unavailable.
  }

  return {
    ...preview,
    decision: updatedDecision ?? preview.decision,
    submitted: true,
    alpacaOrder,
  };
}
