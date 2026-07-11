import { generateTextWithProviderFallback } from '@/lib/llm/generateText';
import { playbookForResearcher } from '@/lib/pm/playbooks/swingTrading';
import { formatBookPassages, retrieveBookPassages } from '@/lib/pm/playbooks/bookRetrieval';

const AGENT_STEP_TIMEOUT_MS = 13_000;

export type ResearcherSide = 'bull' | 'bear';

export type ResearcherCase = {
  side:       ResearcherSide;
  argument:   string;
  keyPoints:  string[];
  // Named swing setup the bull case rests on (null for bear or when none identified).
  setup:      string | null;
  confidence: number;
  degraded:   boolean;
};

export type ResearcherRebuttal = {
  side:              ResearcherSide;
  rebuttal:          string;
  concessions:       string[];
  revisedConfidence: number;
  degraded:          boolean;
};

export type DebateTranscript = {
  bull:            ResearcherCase;
  bear:            ResearcherCase;
  bullRebuttal:    ResearcherRebuttal;
  bearRebuttal:    ResearcherRebuttal;
  degradedReasons: string[];
};

function agentModelCandidates(): string[] {
  return [
    process.env.ANTHROPIC_AGENT_MODEL,
    'claude-haiku-4-5-20251001',
    'claude-3-5-haiku-latest',
    process.env.ANTHROPIC_MODEL,
  ].filter((model): model is string => typeof model === 'string' && model.trim().length > 0);
}

export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  const slice = first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed;
  return JSON.parse(slice);
}

export async function agentCall(params: {
  system:      string;
  user:        string;
  maxTokens:   number;
  temperature: number;
}): Promise<string> {
  const result = await generateTextWithProviderFallback({
    preferredProvider: 'anthropic',
    clientType: 'user',
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    timeoutMs: AGENT_STEP_TIMEOUT_MS,
    anthropicModels: agentModelCandidates(),
    openAiModels: [],
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: params.user },
    ],
  });
  return result?.text ?? '';
}

function fallbackCase(side: ResearcherSide, ticker: string): ResearcherCase {
  return {
    side,
    argument: `The ${side} researcher call failed; no independent ${side} case was built for ${ticker} this run.`,
    keyPoints: [],
    setup: null,
    confidence: 35,
    degraded: true,
  };
}

async function runResearcher(
  side: ResearcherSide,
  ticker: string,
  notes: string,
  currentPrice: number | null,
  bookContext: string,
): Promise<ResearcherCase> {
  const stanceWord = side === 'bull' ? 'strongest case FOR owning' : 'strongest case AGAINST owning';
  try {
    const raw = await agentCall({
      system: `You are the TradingAgents ${side} researcher for ${ticker}. Build the ${stanceWord} ${ticker} strictly from the analyst notes you are given — name which analyst supports each point, and do not invent evidence that is not in the notes.\n\n${playbookForResearcher(side)}${bookContext ? `\n\n${bookContext}` : ''}`,
      user: `Analyst notes:\n\n${notes}\n\nCurrent price anchor: ${currentPrice ? `$${currentPrice.toFixed(2)}` : 'unavailable'}.\n\nReturn JSON: { "argument": "4-6 sentences", "keyPoints": ["short bullet", "..."], "setup": "${side === 'bull' ? 'named swing setup or "none"' : 'null'}", "confidence": 0-100 }`,
      maxTokens: 500,
      temperature: 0.6,
    });
    const parsed = extractJsonObject(raw) as { argument?: unknown; keyPoints?: unknown; setup?: unknown; confidence?: unknown };
    if (typeof parsed.argument !== 'string' || parsed.argument.trim().length === 0) return fallbackCase(side, ticker);
    const setup = typeof parsed.setup === 'string' && parsed.setup.trim().length > 0 && !/^(none|null)$/i.test(parsed.setup.trim())
      ? parsed.setup.trim()
      : null;
    const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.confidence))) : 50;
    return {
      side,
      argument: parsed.argument.trim(),
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.filter((point): point is string => typeof point === 'string').slice(0, 6) : [],
      setup,
      // A bull case with no recognizable setup is a code-enforced confidence cap,
      // not a prompt suggestion the model can ignore.
      confidence: side === 'bull' && setup === null ? Math.min(45, confidence) : confidence,
      degraded: false,
    };
  } catch {
    return fallbackCase(side, ticker);
  }
}

// The actual communication step: each researcher receives the opposing researcher's real
// argument and key points and must answer them directly, conceding what it cannot rebut.
async function runResearcherRebuttal(
  own: ResearcherCase,
  opponent: ResearcherCase,
  ticker: string,
): Promise<ResearcherRebuttal> {
  const fallback: ResearcherRebuttal = {
    side: own.side,
    rebuttal: `No rebuttal was produced; treat the ${opponent.side} case as unanswered this round.`,
    concessions: [],
    revisedConfidence: Math.max(0, own.confidence - 10),
    degraded: true,
  };
  if (own.degraded) return fallback;
  try {
    const raw = await agentCall({
      system: `You are the TradingAgents ${own.side} researcher for ${ticker} in the rebuttal round. Answer the opposing researcher's argument point by point. Concede any point you cannot answer from the analyst notes — conceding honestly and lowering your confidence beats hand-waving.${opponent.degraded ? ' Note: the opposing case is a degraded fallback, not researcher output.' : ''}`,
      user: `Your original case: ${JSON.stringify({ argument: own.argument, keyPoints: own.keyPoints, confidence: own.confidence })}\n\nOpposing case: ${JSON.stringify({ argument: opponent.argument, keyPoints: opponent.keyPoints, confidence: opponent.confidence })}\n\nReturn JSON: { "rebuttal": "3-5 sentences directly addressing the opposing key points", "concessions": ["opposing points you concede"], "revisedConfidence": 0-100 }`,
      maxTokens: 450,
      temperature: 0.5,
    });
    const parsed = extractJsonObject(raw) as { rebuttal?: unknown; concessions?: unknown; revisedConfidence?: unknown };
    if (typeof parsed.rebuttal !== 'string' || parsed.rebuttal.trim().length === 0) return fallback;
    return {
      side: own.side,
      rebuttal: parsed.rebuttal.trim(),
      concessions: Array.isArray(parsed.concessions) ? parsed.concessions.filter((point): point is string => typeof point === 'string').slice(0, 6) : [],
      revisedConfidence: typeof parsed.revisedConfidence === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.revisedConfidence))) : own.confidence,
      degraded: false,
    };
  } catch {
    return fallback;
  }
}

export async function runDebate(
  ticker: string,
  notes: string,
  currentPrice: number | null,
): Promise<DebateTranscript> {
  // One retrieval over the public-domain trading corpus, shared by both researchers.
  const bookContext = formatBookPassages(
    await retrieveBookPassages(`${ticker} swing trade setup: ${notes.slice(0, 1_500)}`, 3),
  );
  const [bull, bear] = await Promise.all([
    runResearcher('bull', ticker, notes, currentPrice, bookContext),
    runResearcher('bear', ticker, notes, currentPrice, bookContext),
  ]);
  const [bullRebuttal, bearRebuttal] = await Promise.all([
    runResearcherRebuttal(bull, bear, ticker),
    runResearcherRebuttal(bear, bull, ticker),
  ]);
  const degradedReasons = [
    ...(bull.degraded ? ['bull_case_degraded'] : []),
    ...(bear.degraded ? ['bear_case_degraded'] : []),
    ...(bullRebuttal.degraded ? ['bull_rebuttal_degraded'] : []),
    ...(bearRebuttal.degraded ? ['bear_rebuttal_degraded'] : []),
  ];
  return { bull, bear, bullRebuttal, bearRebuttal, degradedReasons };
}
