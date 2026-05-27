import { listDecisions } from '@/lib/pm/decisions/decisionStore';
import type { InvestmentDecision } from '@/lib/pm/types';
import { isExecutableTradeAction, previewPaperExecution, submitApprovedPaperExecution } from '@/lib/execution/orders';
import type { PaperExecutionResult, PaperOrderInput } from '@/lib/execution/types';
import { autoApprovePaperDecisions, type AutoApprovalResult } from '@/lib/pm/decisions/autoApprove';

const DEFAULT_AUTO_NOTIONAL = 100;
const DEFAULT_MIN_CONFIDENCE = 65;
const DEFAULT_MAX_ORDERS = 3;

export type AutoPaperTraderInput = {
  dryRun: boolean;
  notional?: number;
  minConfidence?: number;
  maxOrders?: number;
  autoApprove?: boolean;
  approvalMinConfidence?: number;
};

export type AutoPaperCandidate = {
  decision: InvestmentDecision;
  eligible: boolean;
  reasons: string[];
  preview?: Awaited<ReturnType<typeof previewPaperExecution>>;
};

export type AutoPaperTraderResult = {
  mode: 'paper';
  enabled: boolean;
  dryRun: boolean;
  scanned: number;
  eligible: number;
  submitted: number;
  skipped: AutoPaperCandidate[];
  results: PaperExecutionResult[];
  autoApproval?: AutoApprovalResult;
};

function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function autoEnabled(): boolean {
  return process.env.ALPACA_AUTO_PAPER_ENABLED === 'true';
}

function decisionConfidence(decision: InvestmentDecision): number {
  return decision.confidenceScore ?? decision.confidence ?? 0;
}

function candidateReasons(decision: InvestmentDecision, minConfidence: number): string[] {
  const reasons: string[] = [];
  if (decision.approvalStatus !== 'approved') reasons.push('not approved');
  if (decision.executedAt) reasons.push('already executed');
  if (!isExecutableTradeAction(decision.action)) reasons.push(`action ${decision.action} is not executable`);
  if (decisionConfidence(decision) < minConfidence) {
    reasons.push(`confidence ${decisionConfidence(decision)} below ${minConfidence}`);
  }
  return reasons;
}

export async function runAutoPaperTrader(input: AutoPaperTraderInput): Promise<AutoPaperTraderResult> {
  const notional = input.notional ?? envNumber('ALPACA_AUTO_PAPER_NOTIONAL', DEFAULT_AUTO_NOTIONAL);
  const minConfidence = input.minConfidence ?? envNumber('ALPACA_AUTO_PAPER_MIN_CONFIDENCE', DEFAULT_MIN_CONFIDENCE);
  const maxOrders = Math.max(1, Math.min(10, input.maxOrders ?? envNumber('ALPACA_AUTO_PAPER_MAX_ORDERS', DEFAULT_MAX_ORDERS)));
  const enabled = autoEnabled();
  const autoApproval = input.autoApprove
    ? await autoApprovePaperDecisions({
      dryRun: input.dryRun,
      minConfidence: input.approvalMinConfidence,
      maxApprovals: maxOrders,
      approvedBy: 'pm_agent',
    })
    : undefined;
  const decisions = await listDecisions({ limit: 500 });
  const skipped: AutoPaperCandidate[] = [];
  const eligible: AutoPaperCandidate[] = [];

  for (const decision of decisions) {
    const reasons = candidateReasons(decision, minConfidence);
    if (reasons.length > 0) {
      skipped.push({ decision, eligible: false, reasons });
      continue;
    }

    const orderInput: PaperOrderInput = {
      decisionId: decision.id,
      dryRun: true,
      notional,
      orderType: 'market',
      timeInForce: 'day',
    };
    const preview = await previewPaperExecution(orderInput);
    if (preview.risk.blocked) {
      skipped.push({ decision, eligible: false, reasons: preview.risk.reasons, preview });
      continue;
    }
    eligible.push({ decision, eligible: true, reasons: [], preview });
  }

  const toExecute = eligible.slice(0, maxOrders);
  const results: PaperExecutionResult[] = [];

  if (!input.dryRun && enabled) {
    for (const candidate of toExecute) {
      results.push(await submitApprovedPaperExecution({
        decisionId: candidate.decision.id,
        dryRun: false,
        notional,
        orderType: 'market',
        timeInForce: 'day',
      }));
    }
  }

  return {
    mode: 'paper',
    enabled,
    dryRun: input.dryRun || !enabled,
    scanned: decisions.length,
    eligible: eligible.length,
    submitted: results.length,
    skipped,
    results,
    autoApproval,
  };
}
