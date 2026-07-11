import type {
  AdjudicatedClaim,
  DebateRebuttal,
  FunctionalMemo,
  PMDecisionPolicy,
} from '@/lib/pm/debate/types';
import type { ResearchPacket } from '@/lib/pm/research/researchPacketContract';

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function conservativeRebuttal(rebuttals: DebateRebuttal[], targetKey: FunctionalMemo['key']) {
  return rebuttals
    .filter(item => item.targetKey === targetKey)
    .sort((a, b) => a.revisedConfidence - b.revisedConfidence)[0];
}

export function buildPMDecisionPolicy(params: {
  memos: FunctionalMemo[];
  rebuttals: DebateRebuttal[];
  claims: AdjudicatedClaim[];
  packet: ResearchPacket;
}): PMDecisionPolicy {
  const { memos, rebuttals, claims, packet } = params;
  const scoreByClaim = new Map(claims.map(claim => [claim.claimId, claim]));
  // Capital-allocation gates require a claim to survive an actual cross-exam;
  // merely citing an available field is not enough to become investable edge.
  const accepted = claims.filter(claim => claim.accepted && claim.reviewed);
  const acceptedChannels = new Set(memos.flatMap(memo => memo.claims
    .filter(claim => {
      const score = scoreByClaim.get(claim.id);
      return score?.accepted && score.reviewed;
    })
    .map(claim => claim.channel)));

  const directionalReads = memos.map(memo => {
    const rebuttal = conservativeRebuttal(rebuttals, memo.key);
    const stance = rebuttal?.revisedStance ?? memo.stance;
    const confidence = rebuttal?.revisedConfidence ?? memo.confidence;
    const memoClaims = memo.claims
      .map(claim => scoreByClaim.get(claim.id))
      .filter((claim): claim is AdjudicatedClaim => Boolean(claim?.accepted && claim.reviewed));
    const claimStrength = memoClaims.length
      ? memoClaims.reduce((sum, claim) => sum + claim.score, 0) / memoClaims.length / 100
      : 0;
    const reliability = memo.degraded ? 0.25 : rebuttal?.degraded ? 0.6 : 1;
    const direction = stance === 'bullish' ? 1 : stance === 'bearish' ? -1 : 0;
    return direction * confidence * claimStrength * reliability;
  });
  const directionalEdge = directionalReads.reduce((sum, value) => sum + value, 0) / Math.max(1, memos.length);
  const expectedReturn = packet.pricePath.expectedReturnPct.value ?? 0;
  const volatility = packet.pricePath.annualizedVolatilityPct.value;
  const volatilityPenalty = volatility === null ? 5 : Math.max(0, volatility - 35) * 0.15;
  const regimePenalty = packet.marketState?.regime === 'risk_off' ? 8 : 0;
  const edgeScore = clamp(50 + directionalEdge * 0.7 + expectedReturn * 0.8 - volatilityPenalty - regimePenalty);
  const evidenceScore = clamp(packet.quality.coveragePct);
  const claimScore = clamp(claims.length
    ? claims.reduce((sum, claim) => sum + claim.score, 0) / claims.length
    : 0);
  const validDeskPct = memos.length
    ? memos.filter(memo => !memo.degraded).length / memos.length * 100
    : 0;
  const confidence = clamp(
    evidenceScore * 0.35
    + claimScore * 0.35
    + validDeskPct * 0.2
    + Math.min(100, Math.abs(edgeScore - 50) * 2) * 0.1,
  );

  const lower = packet.pricePath.lowerReturnPct.value;
  const upper = packet.pricePath.upperReturnPct.value;
  const asymmetryRatio = lower !== null && upper !== null && lower < 0
    ? Math.round((upper / Math.abs(lower)) * 100) / 100
    : null;
  const gates = {
    sufficientEvidence: evidenceScore >= 65,
    sufficientClaims: accepted.length >= 2,
    estimateOrMultipleMechanism: acceptedChannels.has('estimates') || acceptedChannels.has('multiple'),
    verifiedCatalyst: acceptedChannels.has('catalyst') && packet.catalysts.length > 0,
    favorableAsymmetry: expectedReturn > 0 && asymmetryRatio !== null && asymmetryRatio >= 1.35,
    riskAcceptable: packet.marketState?.regime !== 'risk_off'
      && (lower === null || lower > -25)
      && (volatility === null || volatility < 80),
  };
  const blockers = Object.entries(gates)
    .filter(([, passed]) => !passed)
    .map(([name]) => name.replace(/([A-Z])/g, ' $1').toLowerCase());

  const bullish = edgeScore >= 60;
  const bearish = edgeScore <= 40;
  const pitch = bullish && confidence >= 60 && Object.values(gates).every(Boolean);
  const workUp = bullish
    && confidence >= 45
    && gates.sufficientClaims
    && gates.estimateOrMultipleMechanism
    && evidenceScore >= 50
    && gates.riskAcceptable;
  const short = bearish
    && confidence >= 60
    && gates.sufficientClaims
    && acceptedChannels.has('risk')
    && gates.riskAcceptable;

  return {
    action: pitch || workUp ? 'buy' : short ? 'short' : 'hold',
    decision: pitch ? 'pitch_candidate' : workUp ? 'work_up' : bearish ? 'pass' : 'wait',
    sizing: pitch ? 'Build' : workUp ? 'Track' : short ? 'Track' : bearish ? 'Avoid' : 'Track',
    confidence,
    edgeScore,
    evidenceScore,
    claimScore,
    asymmetryRatio,
    acceptedClaims: accepted.length,
    gates,
    blockers,
  };
}
