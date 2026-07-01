/**
 * Trading agent personalities. A personality is not flavor text — it is the
 * concrete risk contract the agent trades under: how much conviction it
 * demands before investing, what agent agreement it needs before executing,
 * and how aggressively it sizes a position.
 */

export type PersonalityKey = 'steward' | 'operator' | 'hunter';

export type TradingPersonality = {
  key: PersonalityKey;
  name: string;
  /** One-line voice used in run stories so reads stay in character. */
  voice: string;
  /** Consensus confidence floor for a scan candidate to become a pick. */
  minPickConfidence: number;
  /** Weakest agent agreement that may auto-execute. */
  executionAgreement: 'unanimous' | 'majority';
  /** Consensus confidence floor for auto-execution. */
  minExecutionConfidence: number;
  /** % of portfolio equity allocated at baseline conviction. */
  basePositionPct: number;
  /** Hard cap on any single name as % of portfolio equity. */
  maxPositionPct: number;
  /** Default number of investments per autonomous scan. */
  defaultMaxPicks: number;
  /** Sizing multiplier applied when the valuation signal says overvalued. */
  overvaluedSizingMult: number;
};

const PERSONALITIES: Record<PersonalityKey, TradingPersonality> = {
  steward: {
    key: 'steward',
    name: 'The Steward',
    voice: 'Patient value discipline: pays for durable cash flows, never chases, sized to sleep at night.',
    minPickConfidence: 65,
    executionAgreement: 'unanimous',
    minExecutionConfidence: 75,
    basePositionPct: 3,
    maxPositionPct: 6,
    defaultMaxPicks: 1,
    overvaluedSizingMult: 0.25,
  },
  operator: {
    key: 'operator',
    name: 'The Operator',
    voice: 'Balanced and evidence-led: follows the agent consensus, respects valuation, sizes to conviction.',
    minPickConfidence: 55,
    executionAgreement: 'unanimous',
    minExecutionConfidence: 70,
    basePositionPct: 5,
    maxPositionPct: 10,
    defaultMaxPicks: 2,
    overvaluedSizingMult: 0.5,
  },
  hunter: {
    key: 'hunter',
    name: 'The Hunter',
    voice: 'Aggressive growth: acts on strong majority reads, accepts valuation heat for momentum, sizes up winners.',
    minPickConfidence: 50,
    executionAgreement: 'majority',
    minExecutionConfidence: 65,
    basePositionPct: 7,
    maxPositionPct: 15,
    defaultMaxPicks: 3,
    overvaluedSizingMult: 0.7,
  },
};

export const DEFAULT_PERSONALITY_KEY: PersonalityKey = 'operator';

export function isPersonalityKey(value: string | undefined | null): value is PersonalityKey {
  return value === 'steward' || value === 'operator' || value === 'hunter';
}

/** Request param wins, then TRADING_AGENT_PERSONALITY, then the operator default. */
export function resolvePersonality(requested?: string | null): TradingPersonality {
  if (isPersonalityKey(requested)) return PERSONALITIES[requested];
  const fromEnv = process.env.TRADING_AGENT_PERSONALITY;
  if (isPersonalityKey(fromEnv)) return PERSONALITIES[fromEnv];
  return PERSONALITIES[DEFAULT_PERSONALITY_KEY];
}

export function listPersonalities(): TradingPersonality[] {
  return Object.values(PERSONALITIES);
}
