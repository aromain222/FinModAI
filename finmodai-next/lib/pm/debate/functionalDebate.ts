import { z } from 'zod';
import { generateTextWithProviderFallback, type GenerateTextResult } from '@/lib/llm/generateText';
import type { QuantAnalystKey } from '@/lib/pm/monitoring/types';
import { formatMarketStateForPrompt } from '@/lib/pm/marketState/marketStateContract';
import { formatResearchPacketForPrompt, type ResearchPacket } from '@/lib/pm/research/researchPacketContract';
import type {
  ClaimChallenge,
  DebateAdjudication,
  DebateChannel,
  DebateClaim,
  DebateRebuttal,
  DebateStance,
  FunctionalDebateResult,
  FunctionalMemo,
} from '@/lib/pm/debate/types';
import { knownEvidenceRefs, scoreDebateClaims } from '@/lib/pm/debate/claimScoring';
import { playbookForDesk, RISK_PLAYBOOK } from '@/lib/pm/playbooks/swingTrading';
import { formatBookPassages, retrieveBookPassages } from '@/lib/pm/playbooks/bookRetrieval';
import { buildPMDecisionPolicy } from '@/lib/pm/debate/pmDecisionPolicy';

type Role = {
  key: QuantAnalystKey;
  name: string;
  mandate: string;
  requiredEvidence: string[];
};

const ROLES: readonly Role[] = [
  {
    key: 'fundamentals',
    name: 'Fundamentals & Estimates',
    mandate: 'Judge earnings power, margins, cash conversion, leverage, and what could force forward estimates higher or lower.',
    requiredEvidence: ['fundamentals', 'consensus', 'earnings'],
  },
  {
    key: 'growth',
    name: 'Earnings & Catalyst',
    mandate: 'Judge catalyst timing, guidance/revision mechanisms, forward KPIs, and whether events change numbers or only sentiment.',
    requiredEvidence: ['earnings', 'catalysts', 'consensus'],
  },
  {
    key: 'valuation',
    name: 'Valuation & Expectations',
    mandate: 'Judge what is priced, expectations risk, target asymmetry, and whether upside requires estimates or multiple expansion.',
    requiredEvidence: ['market.price', 'consensus.targetUpsidePct', 'fundamentals'],
  },
  {
    key: 'technicals',
    name: 'Technicals & Tape',
    mandate: 'Judge momentum, volatility, forecast confirmation, market regime, and entry/stop discipline inside the stated horizon.',
    requiredEvidence: ['pricePath', 'marketState'],
  },
  {
    key: 'news_sentiment',
    name: 'News & Positioning',
    mandate: 'Judge direct company news, narrative novelty, positioning evidence, crowding risk, and the next confirming datapoint.',
    requiredEvidence: ['catalysts', 'positioning_and_options'],
  },
  {
    key: 'sentiment',
    name: 'Macro Risk & Red Team',
    mandate: 'Attack the consensus. Identify macro transmission, tail risk, unsupported claims, and the fastest way the thesis breaks.',
    requiredEvidence: ['marketState', 'risk', 'missingEvidence'],
  },
] as const;

function boundedText(min: number, max: number) {
  return z.string()
    .transform(value => value.trim().slice(0, max))
    .pipe(z.string().min(min).max(max));
}

const memoSchema = z.object({
  stance: z.enum(['bullish', 'bearish', 'neutral']),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  thesis: boundedText(5, 400),
  reasoning: boundedText(10, 900),
  claims: z.array(z.object({
    id: boundedText(1, 80),
    statement: boundedText(5, 350),
    channel: z.enum(['estimates', 'multiple', 'positioning', 'risk', 'catalyst', 'technical']),
    evidenceRefs: z.array(z.string()).max(8),
    falsifier: boundedText(3, 250),
    horizon: boundedText(2, 100),
  })).min(1).transform(value => value.slice(0, 4)),
  risk: boundedText(3, 300),
  watch: boundedText(3, 250),
  missingEvidence: z.array(boundedText(1, 160)).transform(value => value.slice(0, 10)),
});

const rebuttalSchema = z.object({
  challenges: z.array(z.object({
    claimId: z.string(),
    verdict: z.enum(['supported', 'weak', 'unsupported']),
    critique: boundedText(3, 350),
    missingEvidence: z.array(boundedText(1, 160)).transform(value => value.slice(0, 8)),
    proposedRevision: boundedText(3, 350),
  })).min(1).transform(value => value.slice(0, 4)),
  revisedStance: z.enum(['bullish', 'bearish', 'neutral']),
  revisedConfidence: z.number().min(0).max(100),
  revisedThesis: boundedText(5, 400),
});

const adjudicationSchema = z.object({
  action: z.enum(['buy', 'hold', 'sell', 'short', 'cover']),
  confidence: z.number().min(0).max(100),
  sizing: z.enum(['Track', 'Build', 'Trim', 'Exit watch', 'Avoid']),
  decision: z.enum(['pass', 'wait', 'work_up', 'pitch_candidate']),
  reasoning: boundedText(10, 800),
  whatIsPriced: boundedText(3, 500),
  whyNow: boundedText(3, 500),
  upsidePath: boundedText(3, 500),
  downsidePath: boundedText(3, 500),
  confirmation: boundedText(3, 350),
  invalidation: boundedText(3, 350),
  disagreements: z.array(boundedText(1, 300)).transform(value => value.slice(0, 8)),
});

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function llmTelemetry(result: GenerateTextResult, startedAt: number) {
  return {
    provider: result.provider,
    model: result.model,
    inputTokens: result.usage?.inputTokens ?? null,
    outputTokens: result.usage?.outputTokens ?? null,
    totalTokens: result.usage?.totalTokens ?? null,
    latencyMs: Date.now() - startedAt,
  };
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  return JSON.parse(first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed);
}

function fallbackScore(role: Role, packet: ResearchPacket): number {
  const value = (number: number | null, scale = 2) => number === null ? 0 : number * scale;
  if (role.key === 'fundamentals') {
    const netDebtToEbitda = packet.fundamentals.netDebtToEbitda.value;
    const base = 45 + value(packet.fundamentals.historicalRevenueGrowthPct.value, 0.8) + value(packet.fundamentals.ebitdaMarginPct.value, 0.5);
    // Null netDebtToEbitda means leverage is unmeasurable (including negative-EBITDA companies) —
    // skip the penalty rather than reward it like zero debt, and cap the read at neutral so
    // growth/margin terms alone can't produce a "strong balance sheet" score with leverage unknown.
    return netDebtToEbitda === null
      ? clamp(Math.min(55, base))
      : clamp(base - Math.max(0, netDebtToEbitda) * 8);
  }
  if (role.key === 'growth') return clamp(45 + Math.min(20, packet.catalysts.length * 4) + value(packet.consensus.targetUpsidePct.value, 0.5));
  if (role.key === 'valuation') return clamp(50 + value(packet.consensus.targetUpsidePct.value, 1.2));
  if (role.key === 'technicals') return clamp(50 + value(packet.pricePath.momentum20dPct.value, 1.5) + value(packet.pricePath.expectedReturnPct.value, 1.2));
  if (role.key === 'news_sentiment') return packet.catalysts.length > 0 ? 55 : 45;
  return clamp(55 - packet.quality.missing.length * 3 - (packet.marketState?.regime === 'risk_off' ? 15 : 0));
}

function stanceFromScore(score: number): DebateStance {
  return score >= 60 ? 'bullish' : score <= 40 ? 'bearish' : 'neutral';
}

function fallbackMemo(role: Role, packet: ResearchPacket, reason: string): FunctionalMemo {
  const score = fallbackScore(role, packet);
  const missing = role.requiredEvidence.filter(required => {
    if (required === 'positioning_and_options') return packet.quality.missing.includes('positioning_and_options');
    if (required === 'marketState') return !packet.marketState;
    if (required === 'catalysts') return packet.catalysts.length === 0;
    if (required === 'earnings') return !packet.earnings.fiscalPeriod;
    if (required === 'fundamentals') return packet.quality.missing.includes('company_fundamentals');
    if (required === 'consensus') return packet.quality.missing.includes('consensus_estimates');
    return false;
  });
  const stance = stanceFromScore(score);
  return {
    key: role.key,
    name: role.name,
    stance,
    score,
    confidence: Math.min(45, Math.max(20, packet.quality.coveragePct - missing.length * 10)),
    thesis: `${role.name} fallback is ${stance}; full independent memo was unavailable.`,
    reasoning: `${reason} Available packet coverage is ${packet.quality.coveragePct}%; unsupported domains remain unscored.`,
    claims: [{
      id: `${role.key}-fallback`,
      statement: `The ${role.name.toLowerCase()} read is provisional at ${score}/100.`,
      channel: role.key === 'technicals' ? 'technical' : role.key === 'valuation' ? 'multiple' : role.key === 'growth' ? 'catalyst' : 'risk',
      evidenceRefs: ['missingEvidence'],
      falsifier: 'A complete sourced packet or successful independent memo changes the read.',
      horizon: packet.horizon.label,
    }],
    risk: 'Do not size from a degraded memo.',
    watch: 'Rerun when missing evidence or the agent provider is available.',
    missingEvidence: Array.from(new Set([...missing, ...packet.quality.missing])),
    degraded: true,
  };
}

async function runMemo(role: Role, packet: ResearchPacket): Promise<FunctionalMemo> {
  const startedAt = Date.now();
  const packetText = formatResearchPacketForPrompt(packet);
  const marketText = packet.marketState ? formatMarketStateForPrompt(packet.marketState) : 'MARKET STATE: unavailable';
  const playbook = playbookForDesk(role.key);
  // Only the technicals desk reads the tape-reading corpus (Wyckoff/Gann/Lefèvre) —
  // one retrieval call inside its parallel memo slot, best-effort by design.
  const bookContext = role.key === 'technicals'
    ? formatBookPassages(await retrieveBookPassages(
        `${packet.ticker} tape reading: momentum ${packet.pricePath.momentum20dPct.value ?? 'unknown'}%, expected return ${packet.pricePath.expectedReturnPct.value ?? 'unknown'}%, volatility ${packet.pricePath.annualizedVolatilityPct.value ?? 'unknown'}%, regime ${packet.marketState?.regime ?? 'unknown'}`,
        2,
      ))
    : '';
  try {
    const result = await generateTextWithProviderFallback({
      preferredProvider: 'anthropic',
      clientType: 'user',
      temperature: 0.15,
      // Three claim objects plus provenance routinely exceed 1k tokens; truncating
      // strict JSON turns an otherwise good memo into a deterministic fallback.
      maxTokens: 1600,
      timeoutMs: 18_000,
      messages: [
        {
          role: 'system',
          content: `You are CapitalBase's ${role.name} desk. Work independently. ${role.mandate} Use only supplied evidence, attach exact evidenceRefs to every claim, and treat missing evidence as unknown.${playbook ? `\n\n${playbook}` : ''}${bookContext ? `\n\n${bookContext}` : ''} Output strict JSON.`,
        },
        {
          role: 'user',
          content: `${packetText}\n\n${marketText}\n\nReturn JSON: {"stance":"bullish|bearish|neutral","score":0-100,"confidence":0-100,"thesis":"...","reasoning":"...","claims":[{"id":"${role.key}-1","statement":"...","channel":"estimates|multiple|positioning|risk|catalyst|technical","evidenceRefs":["exact.packet.path"],"falsifier":"...","horizon":"${packet.horizon.label}"}],"risk":"...","watch":"...","missingEvidence":["..."]}. Maximum 3 claims. Keep reasoning below 500 characters and each claim below 220 characters. Confidence must stay below 60 when required evidence is missing.`,
        },
      ],
    });
    const parsed = memoSchema.parse(extractJson(result?.text ?? '{}'));
    const knownRefs = knownEvidenceRefs(packet);
    const claims = parsed.claims.map((claim, index) => ({
      ...claim,
      // Role-owned IDs prevent collisions such as several desks emitting "risk-1".
      id: `${role.key}-${index + 1}`,
      evidenceRefs: claim.evidenceRefs.filter(ref => knownRefs.has(ref)),
    }));
    const unsupported = claims.filter(claim => claim.evidenceRefs.length === 0).length;
    return {
      key: role.key,
      name: role.name,
      ...parsed,
      claims,
      confidence: unsupported > 0 ? Math.min(55, parsed.confidence) : parsed.confidence,
      degraded: false,
      llm: result ? llmTelemetry(result, startedAt) : undefined,
    };
  } catch (error) {
    return fallbackMemo(role, packet, error instanceof Error ? error.message : 'memo_failed');
  }
}

function fallbackRebuttal(reviewer: FunctionalMemo, target: FunctionalMemo, knownRefs: Set<string>): DebateRebuttal {
  const challenges: ClaimChallenge[] = target.claims.map(claim => {
    const supported = claim.evidenceRefs.length > 0 && claim.evidenceRefs.every(ref => knownRefs.has(ref));
    return {
      claimId: claim.id,
      verdict: supported ? 'weak' : 'unsupported',
      critique: supported ? 'Evidence exists, but the claimed transmission and magnitude still need confirmation.' : 'The claim has no verified evidence reference in the packet.',
      missingEvidence: supported ? ['transmission_confirmation'] : ['verified_source'],
      proposedRevision: supported ? `${claim.statement} Treat magnitude as unconfirmed.` : 'Remove the claim until verified evidence is available.',
    };
  });
  return {
    reviewerKey: reviewer.key,
    targetKey: target.key,
    challenges,
    invalidClaimIds: [],
    revisedStance: target.stance,
    revisedConfidence: Math.max(15, target.confidence - challenges.filter(item => item.verdict !== 'supported').length * 8),
    revisedThesis: target.thesis,
    degraded: true,
  };
}

async function runRebuttal(reviewer: FunctionalMemo, target: FunctionalMemo, packet: ResearchPacket): Promise<DebateRebuttal> {
  const knownRefs = knownEvidenceRefs(packet);
  const startedAt = Date.now();
  try {
    const result = await generateTextWithProviderFallback({
      preferredProvider: 'anthropic',
      clientType: 'user',
      temperature: 0.1,
      maxTokens: 1400,
      timeoutMs: 16_000,
      messages: [
        {
          role: 'system',
          content: `You are the ${reviewer.name} desk cross-examining ${target.name}. Challenge claim evidence and transmission, not personality.${target.degraded ? ' The target memo is a degraded deterministic fallback, not analyst output — its claims start unproven.' : ''} Output strict JSON.`,
        },
        {
          role: 'user',
          content: `Verified evidence refs: ${[...knownRefs].join(', ')}\nTarget memo: ${JSON.stringify(target)}\nReturn JSON: {"challenges":[{"claimId":"...","verdict":"supported|weak|unsupported","critique":"...","missingEvidence":["..."],"proposedRevision":"..."}],"revisedStance":"bullish|bearish|neutral","revisedConfidence":0-100,"revisedThesis":"..."}. Review every target claim. Keep each critique and revision below 220 characters. Unsupported evidence refs must be rejected.`,
        },
      ],
    });
    const parsed = rebuttalSchema.parse(extractJson(result?.text ?? '{}'));
    // Reject challenges referencing a claimId the target memo never made — an unvalidated
    // hallucinated claimId would otherwise sit unmatched in scoreDebateClaims with no signal
    // that the reviewer's output didn't actually correspond to real content.
    const validClaimIds = new Set(target.claims.map(claim => claim.id));
    const challenges = parsed.challenges.filter(challenge => validClaimIds.has(challenge.claimId));
    const invalidClaimIds = parsed.challenges
      .filter(challenge => !validClaimIds.has(challenge.claimId))
      .map(challenge => challenge.claimId);
    return {
      reviewerKey: reviewer.key,
      targetKey: target.key,
      ...parsed,
      challenges,
      invalidClaimIds,
      degraded: false,
      llm: result ? llmTelemetry(result, startedAt) : undefined,
    };
  } catch {
    return fallbackRebuttal(reviewer, target, knownRefs);
  }
}

function fallbackAdjudication(
  memos: FunctionalMemo[],
  rebuttals: DebateRebuttal[],
  packet: ResearchPacket,
): DebateAdjudication {
  const claims = scoreDebateClaims(memos, rebuttals, packet);
  const policy = buildPMDecisionPolicy({ memos, rebuttals, claims, packet });
  return {
    action: policy.action,
    confidence: policy.confidence,
    sizing: policy.sizing,
    decision: policy.decision,
    reasoning: `${policy.acceptedClaims}/${claims.length} claims survived. PM edge ${policy.edgeScore}/100, evidence ${policy.evidenceScore}/100, claim quality ${policy.claimScore}/100.`,
    whatIsPriced: packet.consensus.targetUpsidePct.value === null ? 'Consensus expectations were unavailable.' : `Consensus target implies ${packet.consensus.targetUpsidePct.value}% upside, which is not itself an edge.`,
    whyNow: packet.catalysts[0]?.title ?? 'No verified near-term catalyst was retrieved.',
    upsidePath: 'Verified estimate improvement plus technical confirmation inside the stated horizon.',
    downsidePath: 'Estimate disappointment, risk-premium expansion, or failure of the identified catalyst.',
    confirmation: 'Require an accepted catalyst/estimate claim and confirming price action before sizing up.',
    invalidation: 'Exit the work-up if the core estimate claim fails or the defined risk threshold is breached.',
    disagreements: rebuttals.filter(item => item.revisedStance !== memos.find(memo => memo.key === item.targetKey)?.stance).map(item => `${item.targetKey} stance revised by ${item.reviewerKey}`),
    claims,
    degraded: true,
    policy,
  };
}

async function adjudicate(
  memos: FunctionalMemo[],
  rebuttals: DebateRebuttal[],
  packet: ResearchPacket,
): Promise<DebateAdjudication> {
  const claims = scoreDebateClaims(memos, rebuttals, packet);
  const policy = buildPMDecisionPolicy({ memos, rebuttals, claims, packet });
  const startedAt = Date.now();
  try {
    const result = await generateTextWithProviderFallback({
      preferredProvider: 'anthropic',
      clientType: 'user',
      temperature: 0.1,
      maxTokens: 1500,
      timeoutMs: 18_000,
      messages: [
        {
          role: 'system',
          content: `You are the CapitalBase PM adjudicator. Decide from surviving evidence, preserve material disagreement, and never convert vote count into conviction. Weigh each rebuttal's verdicts and revised stance/confidence against the original memo — a memo whose claims were rejected on cross-exam must not drive the decision. Any memo or rebuttal marked degraded:true is a deterministic fallback, not analyst output — discount it.\n\n${RISK_PLAYBOOK}\n\nOutput strict JSON.`,
        },
        {
          role: 'user',
          content: `Horizon: ${packet.horizon.label}\nEvidence coverage: ${packet.quality.coveragePct}%\nBinding PM policy: ${JSON.stringify(policy)}\nMemos: ${JSON.stringify(memos)}\nRebuttals: ${JSON.stringify(rebuttals)}\nDeterministic claim scores: ${JSON.stringify(claims)}\nReturn JSON: {"action":"buy|hold|sell|short|cover","confidence":0-100,"sizing":"Track|Build|Trim|Exit watch|Avoid","decision":"pass|wait|work_up|pitch_candidate","reasoning":"...","whatIsPriced":"...","whyNow":"...","upsidePath":"...","downsidePath":"...","confirmation":"...","invalidation":"...","disagreements":["..."]}. Explain the binding policy decision; do not upgrade its action, decision, sizing, or confidence.`,
        },
      ],
    });
    const parsed = adjudicationSchema.parse(extractJson(result?.text ?? '{}'));
    // Rebuttal-driven stance revisions are material disagreement by definition — record them
    // deterministically rather than trusting the LLM to have surfaced them.
    const stanceRevisions = rebuttals
      .filter(item => item.revisedStance !== memos.find(memo => memo.key === item.targetKey)?.stance)
      .map(item => `${item.targetKey} stance revised by ${item.reviewerKey}`);
    const disagreements = [...new Set([...parsed.disagreements, ...stanceRevisions])].slice(0, 8);
    return {
      ...parsed,
      action: policy.action,
      decision: policy.decision,
      sizing: policy.sizing,
      disagreements,
      confidence: policy.confidence,
      claims,
      degraded: false,
      llm: result ? llmTelemetry(result, startedAt) : undefined,
      policy,
    };
  } catch {
    return fallbackAdjudication(memos, rebuttals, packet);
  }
}

export async function runFunctionalDebate(params: {
  packet: ResearchPacket;
  depth: 'scan' | 'committee';
}): Promise<FunctionalDebateResult> {
  const startedAt = Date.now();
  const memoResults = await Promise.all(ROLES.map(role => runMemo(role, params.packet)));
  const degradedReasons = memoResults.filter(item => item.degraded).map(item => `${item.key}_memo_degraded`);
  if (params.depth === 'scan') {
    const telemetry = memoResults.flatMap(item => item.llm ? [item.llm] : []);
    return {
      version: 1,
      ticker: params.packet.ticker,
      horizonDays: params.packet.horizon.days,
      depth: 'scan',
      ranAt: new Date().toISOString(),
      memos: memoResults,
      rebuttals: [],
      adjudication: null,
      degraded: degradedReasons.length > 0,
      degradedReasons,
      metrics: {
        elapsedMs: Date.now() - startedAt,
        modelCalls: memoResults.length,
        successfulCalls: telemetry.length,
        degradedCalls: memoResults.filter(item => item.degraded).length,
        reportedInputTokens: telemetry.reduce((sum, item) => sum + (item.inputTokens ?? 0), 0),
        reportedOutputTokens: telemetry.reduce((sum, item) => sum + (item.outputTokens ?? 0), 0),
        reportedTotalTokens: telemetry.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0),
        models: [...new Set(telemetry.map(item => `${item.provider}:${item.model}`))],
      },
    };
  }

  // Round-robin gives every desk one peer reviewer; the red-team desk additionally
  // cross-examines every other desk — its mandate is to attack the whole panel's
  // consensus, not one neighbor. All rebuttals run in a single parallel stage.
  const redTeam = memoResults.find(memo => memo.key === 'sentiment');
  const rebuttalJobs = memoResults.flatMap((target, index) => {
    const reviewers = [memoResults[(index + 1) % memoResults.length]];
    if (redTeam && target.key !== redTeam.key && reviewers[0].key !== redTeam.key) {
      reviewers.push(redTeam);
    }
    return reviewers.map(reviewer => ({ reviewer, target }));
  });
  const rebuttals = await Promise.all(rebuttalJobs.map(job => runRebuttal(job.reviewer, job.target, params.packet)));
  degradedReasons.push(...rebuttals.filter(item => item.degraded).map(item => `${item.reviewerKey}_rebuttal_degraded`));
  degradedReasons.push(...rebuttals.filter(item => item.invalidClaimIds.length > 0).map(item => `${item.reviewerKey}_invalid_claim_refs`));
  const adjudication = await adjudicate(memoResults, rebuttals, params.packet);
  if (adjudication.degraded) degradedReasons.push('adjudication_degraded');
  const telemetry = [
    ...memoResults.flatMap(item => item.llm ? [item.llm] : []),
    ...rebuttals.flatMap(item => item.llm ? [item.llm] : []),
    ...(adjudication.llm ? [adjudication.llm] : []),
  ];
  const modelCalls = memoResults.length + rebuttals.length + 1;
  return {
    version: 1,
    ticker: params.packet.ticker,
    horizonDays: params.packet.horizon.days,
    depth: 'committee',
    ranAt: new Date().toISOString(),
    memos: memoResults,
    rebuttals,
    adjudication,
    degraded: degradedReasons.length > 0,
    degradedReasons,
    metrics: {
      elapsedMs: Date.now() - startedAt,
      modelCalls,
      successfulCalls: telemetry.length,
      degradedCalls: modelCalls - telemetry.length,
      reportedInputTokens: telemetry.reduce((sum, item) => sum + (item.inputTokens ?? 0), 0),
      reportedOutputTokens: telemetry.reduce((sum, item) => sum + (item.outputTokens ?? 0), 0),
      reportedTotalTokens: telemetry.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0),
      models: [...new Set(telemetry.map(item => `${item.provider}:${item.model}`))],
    },
  };
}

// A memo can now have multiple reviewers (round-robin + red team). Consumers that need a
// single rebuttal per memo take the most conservative one — lowest revised confidence.
export function primaryRebuttalFor(
  rebuttals: DebateRebuttal[],
  targetKey: QuantAnalystKey,
): DebateRebuttal | undefined {
  return rebuttals
    .filter(item => item.targetKey === targetKey)
    .sort((a, b) => a.revisedConfidence - b.revisedConfidence)[0];
}

export function memoToSignal(memo: FunctionalMemo, rebuttal?: DebateRebuttal) {
  const confidence = rebuttal?.revisedConfidence ?? memo.confidence;
  const signal = rebuttal?.revisedStance ?? memo.stance;
  return {
    key: memo.key,
    name: memo.name,
    score: memo.score,
    signal,
    confidence,
    reasoning: `${memo.reasoning}${rebuttal ? ` Cross-exam: ${rebuttal.challenges.map(item => `${item.claimId} ${item.verdict}`).join('; ')}.` : ''}`,
    thesis: rebuttal?.revisedThesis ?? memo.thesis,
    risk: memo.risk,
    watch: memo.watch,
    theme_fit_score: null,
    theme_fit_reason: '',
    business_consistency: true,
  } satisfies {
    key: QuantAnalystKey;
    name: string;
    score: number;
    signal: DebateStance;
    confidence: number;
    reasoning: string;
    thesis: string;
    risk: string;
    watch: string;
    theme_fit_score: null;
    theme_fit_reason: string;
    business_consistency: boolean;
  };
}
