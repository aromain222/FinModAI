import {
  pmBrainAgentOutputSchema,
  type PMBrainAgentInput,
  type PMBrainAgentOutput,
} from '@/lib/pm/agent/schemas';

function fallbackText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function fallbackPMBrainDecision(input: Pick<PMBrainAgentInput, 'ticker'>, reason: string): PMBrainAgentOutput {
  return {
    ticker: input.ticker,
    decision: 'HOLD',
    position_size_pct: 0,
    confidence: 35,
    time_horizon: '2-6 weeks',
    thesis: `Fallback HOLD: ${reason}`,
    top_drivers: ['Insufficient validated signal alignment for a new allocation.'],
    top_risks: ['Model output or input quality did not clear PM Brain validation.'],
    expected_catalysts: ['Wait for a cleaner analyst consensus, debate outcome, or catalyst confirmation.'],
    invalidation_conditions: ['No trade should execute until a valid PM Brain decision passes risk checks.'],
    risk_notes: ['Paper trading only; deterministic execution risk engine must approve any later order.'],
    execution_notes: ['No order intent generated from fallback decision.'],
  };
}

export function parsePMBrainAgentJson(text: string, ticker: string): PMBrainAgentOutput {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`PM Brain Agent returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  return normalizePMBrainDecision(raw, ticker);
}

export function normalizePMBrainDecision(raw: unknown, ticker: string): PMBrainAgentOutput {
  const parsed = pmBrainAgentOutputSchema.parse(raw);
  const normalized: PMBrainAgentOutput = {
    ...parsed,
    ticker,
    decision: parsed.decision,
    confidence: Math.round(parsed.confidence),
    position_size_pct: Math.round(parsed.position_size_pct * 10) / 10,
    thesis: fallbackText(parsed.thesis, 'No thesis provided.'),
    top_drivers: parsed.top_drivers.slice(0, 5),
    top_risks: parsed.top_risks.slice(0, 5),
    expected_catalysts: parsed.expected_catalysts.slice(0, 5),
    invalidation_conditions: parsed.invalidation_conditions.slice(0, 5),
    risk_notes: parsed.risk_notes.slice(0, 5),
    execution_notes: parsed.execution_notes.slice(0, 5),
  };

  if (normalized.decision === 'HOLD' || normalized.decision === 'EXIT' || normalized.decision === 'REJECT') {
    normalized.position_size_pct = 0;
  }

  if (normalized.confidence < 60 && (normalized.decision === 'BUY' || normalized.decision === 'SELL' || normalized.decision === 'REDUCE')) {
    return {
      ...normalized,
      decision: 'HOLD',
      position_size_pct: 0,
      thesis: `Downgraded to HOLD because confidence ${normalized.confidence}% is below PM Brain action threshold. ${normalized.thesis}`,
      execution_notes: [
        'No paper order intent because confidence is below action threshold.',
        ...normalized.execution_notes,
      ].slice(0, 5),
    };
  }

  if (normalized.decision === 'BUY' && normalized.position_size_pct <= 0) {
    normalized.position_size_pct = normalized.confidence >= 88 ? 9 : normalized.confidence >= 75 ? 4 : 1;
  }

  if (normalized.decision === 'BUY' && normalized.position_size_pct > 8 && normalized.confidence < 88) {
    normalized.position_size_pct = 8;
    normalized.risk_notes = [
      'Position capped at 8% because conviction is not exceptional.',
      ...normalized.risk_notes,
    ].slice(0, 5);
  }

  return normalized;
}
