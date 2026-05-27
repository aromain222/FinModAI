import { listDecisions, updateDecision } from '@/lib/pm/decisions/decisionStore';
import { recordOutcome } from '@/lib/pm/memory/recordOutcome';
import type { InvestmentDecision } from '@/lib/pm/types';
import { isExecutableTradeAction } from '@/lib/execution/orders';

const DEFAULT_MIN_CONFIDENCE = 78;
const DEFAULT_MAX_APPROVALS = 3;

export type AutoApprovalInput = {
  dryRun: boolean;
  minConfidence?: number;
  maxApprovals?: number;
  approvedBy?: string;
};

export type AutoApprovalCandidate = {
  decision: InvestmentDecision;
  eligible: boolean;
  reasons: string[];
};

export type AutoApprovalResult = {
  mode: 'paper';
  enabled: boolean;
  dryRun: boolean;
  scanned: number;
  eligible: number;
  approved: InvestmentDecision[];
  skipped: AutoApprovalCandidate[];
};

function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function pmAgentAutoApprovalEnabled(): boolean {
  return process.env.PM_AGENT_AUTO_APPROVAL_ENABLED === 'true';
}

function decisionConfidence(decision: InvestmentDecision): number {
  return decision.confidenceScore ?? decision.confidence ?? 0;
}

function decisionReasons(decision: InvestmentDecision, minConfidence: number): string[] {
  const reasons: string[] = [];
  if (decision.approvalStatus !== 'pending') reasons.push(`approval status is ${decision.approvalStatus}`);
  if (decision.executedAt) reasons.push('already executed');
  if (!isExecutableTradeAction(decision.action)) reasons.push(`action ${decision.action} is not executable`);
  if (decision.action === 'short') reasons.push('short decisions are not auto-approved');
  if (decisionConfidence(decision) < minConfidence) {
    reasons.push(`confidence ${decisionConfidence(decision)} below PM agent threshold ${minConfidence}`);
  }
  if (!decision.rationale || decision.rationale.trim().length < 40) {
    reasons.push('rationale is too thin for PM agent approval');
  }
  if (!decision.evidence || decision.evidence.length === 0) {
    reasons.push('no evidence trail attached');
  }
  return reasons;
}

export async function autoApprovePaperDecisions(input: AutoApprovalInput): Promise<AutoApprovalResult> {
  const enabled = pmAgentAutoApprovalEnabled();
  const minConfidence = input.minConfidence ?? envNumber('PM_AGENT_AUTO_APPROVAL_MIN_CONFIDENCE', DEFAULT_MIN_CONFIDENCE);
  const maxApprovals = Math.max(1, Math.min(10, input.maxApprovals ?? envNumber('PM_AGENT_AUTO_APPROVAL_MAX_APPROVALS', DEFAULT_MAX_APPROVALS)));
  const decisions = await listDecisions({ limit: 500 });
  const skipped: AutoApprovalCandidate[] = [];
  const eligible: InvestmentDecision[] = [];

  for (const decision of decisions) {
    const reasons = decisionReasons(decision, minConfidence);
    if (reasons.length > 0) {
      skipped.push({ decision, eligible: false, reasons });
      continue;
    }
    eligible.push(decision);
  }

  const approved: InvestmentDecision[] = [];
  if (!input.dryRun && enabled) {
    for (const decision of eligible.slice(0, maxApprovals)) {
      const now = new Date().toISOString();
      const approvedDecision = await updateDecision(decision.id, {
        approvalStatus: 'approved',
        approvedBy: input.approvedBy ?? 'pm_agent',
        approvalNote: `PM Agent auto-approved for Alpaca paper trading: confidence ${decisionConfidence(decision)} >= ${minConfidence}; action ${decision.action}; evidence trail present.`,
        updatedAt: now,
      });
      if (approvedDecision) {
        approved.push(approvedDecision);
        try {
          await recordOutcome({
            memoryType: 'process_lesson',
            lesson: `${approvedDecision.ticker} ${approvedDecision.action.toUpperCase()} paper decision auto-approved by PM Agent. Confidence ${decisionConfidence(approvedDecision)}. Rationale: ${approvedDecision.rationale}`,
            relatedTickers: [approvedDecision.ticker],
            relatedThemes: ['pm_agent_auto_approval', 'paper_execution'],
            importance: 80,
          });
        } catch {
          // Auto-approval should not fail because PM memory persistence is unavailable.
        }
      }
    }
  }

  return {
    mode: 'paper',
    enabled,
    dryRun: input.dryRun || !enabled,
    scanned: decisions.length,
    eligible: eligible.length,
    approved,
    skipped,
  };
}
