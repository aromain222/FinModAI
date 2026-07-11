import type { DebateRebuttal, FunctionalMemo } from '@/lib/pm/debate/types';
import type { ResearchPacket } from '@/lib/pm/research/researchPacketContract';

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function knownEvidenceRefs(packet: ResearchPacket): Set<string> {
  const refs = new Set<string>(['market.price', 'missingEvidence']);
  const addMetric = (ref: string, value: number | null): void => { if (value !== null) refs.add(ref); };
  addMetric('fundamentals.revenueLtm', packet.fundamentals.revenueLtm.value);
  addMetric('fundamentals.historicalRevenueGrowthPct', packet.fundamentals.historicalRevenueGrowthPct.value);
  addMetric('fundamentals.ebitdaMarginPct', packet.fundamentals.ebitdaMarginPct.value);
  addMetric('fundamentals.netMarginPct', packet.fundamentals.netMarginPct.value);
  addMetric('fundamentals.netDebtToEbitda', packet.fundamentals.netDebtToEbitda.value);
  addMetric('consensus.revenueEstimateNtm', packet.consensus.revenueEstimateNtm.value);
  addMetric('consensus.epsEstimateNtm', packet.consensus.epsEstimateNtm.value);
  addMetric('consensus.targetUpsidePct', packet.consensus.targetUpsidePct.value);
  addMetric('pricePath.expectedReturnPct', packet.pricePath.expectedReturnPct.value);
  addMetric('pricePath.lowerReturnPct', packet.pricePath.lowerReturnPct.value);
  addMetric('pricePath.upperReturnPct', packet.pricePath.upperReturnPct.value);
  addMetric('pricePath.momentum20dPct', packet.pricePath.momentum20dPct.value);
  addMetric('pricePath.annualizedVolatilityPct', packet.pricePath.annualizedVolatilityPct.value);
  if (packet.earnings.fiscalPeriod) refs.add('earnings');
  if (packet.catalysts.length > 0) refs.add('catalysts');
  if (packet.marketState) refs.add('marketState');
  if (packet.quality.available.includes('company_fundamentals')) refs.add('fundamentals');
  if (packet.quality.available.includes('consensus_estimates')) refs.add('consensus');
  if (packet.quality.available.includes('price_history_and_forecast')) refs.add('pricePath');
  return refs;
}

export function scoreDebateClaims(
  memos: FunctionalMemo[],
  rebuttals: DebateRebuttal[],
  packet: ResearchPacket,
) {
  const knownRefs = knownEvidenceRefs(packet);
  return memos.flatMap(memo => memo.claims.map(claim => {
    // 'missingEvidence' is always in knownRefs so a claim can legitimately cite "evidence is
    // missing" — but it must not count as real evidence coverage, or a fallback stub claim with
    // no other refs scores as fully evidenced. Only non-sentinel refs count toward coverage.
    const realEvidenceRefs = claim.evidenceRefs.filter(ref => ref !== 'missingEvidence');
    const evidenceCoverage = realEvidenceRefs.length === 0
      ? 0
      : realEvidenceRefs.filter(ref => knownRefs.has(ref)).length / realEvidenceRefs.length;
    // A claim can now draw challenges from multiple reviewers (round-robin + red team);
    // the harshest verdict governs — one reviewer waving a claim through must not launder
    // another reviewer's rejection.
    const severity = { unsupported: 0, weak: 1, supported: 2 } as const;
    const challenges = rebuttals
      .flatMap(item => item.challenges)
      .filter(item => item.claimId === claim.id)
      .sort((a, b) => severity[a.verdict] - severity[b.verdict]);
    const challenge = challenges[0];
    const reviewed = challenge !== undefined;
    // Unreviewed is neutral (0), not the same -10 penalty as an explicit 'weak' verdict — silence
    // from the round-robin reviewer isn't evidence the claim is weak.
    const rebuttalAdjustment = !reviewed
      ? 0
      : challenge.verdict === 'supported' ? 10 : challenge.verdict === 'unsupported' ? -30 : -10;
    const score = clamp(25 + evidenceCoverage * 55 + rebuttalAdjustment);
    return {
      claimId: claim.id,
      score,
      accepted: score >= 60,
      reviewed,
      reason: `${Math.round(evidenceCoverage * 100)}% evidence coverage; rebuttal ${challenge?.verdict ?? 'not run'}${challenges.length > 1 ? ` (harshest of ${challenges.length} reviewers)` : ''}.`,
    };
  }));
}
