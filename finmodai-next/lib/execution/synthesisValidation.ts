import type { UserIntent } from './userIntent';
import type { PersonaOutput } from './agentConsensus';

export type SynthesizedPosition = {
  ticker:              string;
  score:               number;
  action:              'Buy' | 'Overweight' | 'Hold' | 'Reduce' | 'Sell';
  sizing:              'Full position' | 'Build' | 'Starter';
  weight_pct:          number;
  shares:              number;
  dollar_amount:       number;
  thesis:              string;
  theme_justification: string;
  risk:                string;
  // Populated from debate stage — optional so pre-debate synthesis still type-checks
  bull_case?:     string;
  bear_case?:     string;
  agent_signals?: PersonaOutput[];
};

export type SynthesizedPortfolio = {
  narrative:         string;
  total_capital_usd: number | null;
  cash_reserve_pct:  number;
  requested_count:   number;
  delivered_count:   number;
  shortfall_reason:  string | null;
  positions:         SynthesizedPosition[];
};

export type ValidationError = {
  code:     string;
  message:  string;
  tickers?: string[];
};

export type ValidationResult = {
  portfolio:      SynthesizedPortfolio;
  errors:         ValidationError[];
  mustRegenerate: boolean;
};

const GENERIC_RISK_TERMS = [
  'competition', 'competitive pressure', 'regulatory risk', 'regulatory scrutiny',
  'macro headwinds', 'macro risk', 'market volatility', 'execution risk',
  'geopolitical risk', 'rate risk', 'supply chain disruption', 'valuation risk',
] as const;

function hasSpecificAnchor(text: string): boolean {
  if (/\d/.test(text)) return true;
  if (/%/.test(text)) return true;
  // Proper noun: capitalized word that is not the first word in the sentence
  const words = text.split(/\s+/);
  return words.slice(1).some(w => /^[A-Z][a-z]/.test(w));
}

function isGenericRisk(risk: string): boolean {
  const lower = risk.toLowerCase();
  const matchesDenyList = GENERIC_RISK_TERMS.some(term => lower.includes(term));
  if (!matchesDenyList) return false;
  return !hasSpecificAnchor(risk);
}

export function correctSizingLabel(weight_pct: number): 'Full position' | 'Build' | 'Starter' {
  if (weight_pct >= 10) return 'Full position';
  if (weight_pct >= 6)  return 'Build';
  return 'Starter';
}

/**
 * Pure validation pass — applies 8 deterministic checks on a synthesized portfolio.
 * Auto-fixes in-place where possible; sets mustRegenerate=true for checks that require
 * the LLM to produce a new output.
 */
export function validateSynthesis(
  portfolio: SynthesizedPortfolio,
  intent: UserIntent,
  rejectedTickers: Set<string>,
): ValidationResult {
  const positions: SynthesizedPosition[] = portfolio.positions.map(p => ({ ...p }));
  const errors: ValidationError[] = [];
  let mustRegenerate = false;

  const requested = portfolio.requested_count;

  // C8: No agent-rejected tickers in synthesis output
  const rejectedInOutput = positions.filter(p => rejectedTickers.has(p.ticker)).map(p => p.ticker);
  if (rejectedInOutput.length > 0) {
    errors.push({
      code:    'C8',
      message: `Agent-rejected tickers must not appear in synthesis: ${rejectedInOutput.join(', ')}`,
      tickers: rejectedInOutput,
    });
    mustRegenerate = true;
  }

  // C1: Position count — auto-trim if too many; regenerate if too few without shortfall_reason
  if (requested > 0) {
    if (positions.length > requested) {
      positions.splice(requested);
    } else if (positions.length < requested && !portfolio.shortfall_reason) {
      errors.push({
        code:    'C1',
        message: `Requested ${requested} positions, got ${positions.length} — provide shortfall_reason explaining why fewer were returned`,
      });
      mustRegenerate = true;
    }
  }

  // C4 (extreme): Weight >20% or <2% → regenerate (checked before normalization)
  const extremePos = positions.filter(p => p.weight_pct > 20 || p.weight_pct < 2);
  if (extremePos.length > 0) {
    errors.push({
      code:    'C4',
      message: `Weights must be 2–20%. Extreme values: ${extremePos.map(p => `${p.ticker}@${p.weight_pct}%`).join(', ')}`,
      tickers: extremePos.map(p => p.ticker),
    });
    mustRegenerate = true;
  }

  // C5: Weight sum — normalize if |delta| ≤ 15%; regenerate if > 15%
  if (positions.length > 0) {
    const total = positions.reduce((s, p) => s + p.weight_pct, 0);
    const delta = Math.abs(total - 100);
    if (delta > 2) {
      if (delta <= 15) {
        const scale = 100 / total;
        for (const p of positions) {
          p.weight_pct = Math.round(p.weight_pct * scale * 10) / 10;
        }
      } else {
        errors.push({
          code:    'C5',
          message: `Weights sum to ${total.toFixed(1)}% — deviation of ${delta.toFixed(1)}% exceeds the 15% auto-fix threshold; return correct weights`,
        });
        mustRegenerate = true;
      }
    }
  }

  // C4 (relabel): Correct sizing tier from weight_pct — always auto-fix (runs after normalization)
  for (const p of positions) {
    p.sizing = correctSizingLabel(p.weight_pct);
  }

  // C2: theme_justification must be non-empty when themes are specified
  if (intent.themes.length > 0) {
    const missing = positions.filter(p => !p.theme_justification?.trim());
    if (missing.length > 0) {
      errors.push({
        code:    'C2',
        message: `Every position needs a non-empty theme_justification (themes: ${intent.themes.join(', ')}). Missing on: ${missing.map(p => p.ticker).join(', ')}`,
        tickers: missing.map(p => p.ticker),
      });
      mustRegenerate = true;
    }
  }

  // C3: theme_justification should mention a theme keyword — warn only (no regenerate)
  if (intent.themes.length > 0) {
    const noMention = positions.filter(p => {
      const text = (p.theme_justification ?? '').toLowerCase();
      return !intent.themes.some(theme => text.includes(theme));
    });
    if (noMention.length > 0) {
      errors.push({
        code:    'C3_warn',
        message: `theme_justification should mention one of [${intent.themes.join(', ')}]: ${noMention.map(p => p.ticker).join(', ')}`,
        tickers: noMention.map(p => p.ticker),
      });
    }
  }

  // C7: Generic risk deny-list — must include a specific anchor
  const genericRisks = positions.filter(p => isGenericRisk(p.risk));
  if (genericRisks.length > 0) {
    errors.push({
      code:    'C7',
      message: `Risk must include a specific anchor (company, metric, product, or number). Generic risks: ${genericRisks.map(p => p.ticker).join(', ')}`,
      tickers: genericRisks.map(p => p.ticker),
    });
    mustRegenerate = true;
  }

  // C6: Recompute dollar_amount from weight_pct × capital — always authoritative
  const capital = portfolio.total_capital_usd;
  if (capital !== null && capital > 0) {
    for (const p of positions) {
      p.dollar_amount = Math.round((p.weight_pct / 100) * capital);
    }
  }

  return {
    portfolio: { ...portfolio, positions, delivered_count: positions.length },
    errors,
    mustRegenerate,
  };
}
