import type { UserIntent } from './userIntent';
import type { SynthesizedPortfolio } from './synthesisValidation';

export interface Violation {
  rule_id:  string;
  severity: 'BLOCKER' | 'MAJOR' | 'MINOR';
  message:  string;
  details:  Record<string, unknown>;
}

export interface ValidationResult {
  ok:       boolean;
  blockers: Violation[];
  warnings: Violation[];
}

const ALLOWED_ACTIONS = new Set(['Buy', 'Overweight', 'Hold', 'Reduce', 'Sell']);
const ALLOWED_SIZING  = new Set(['Full position', 'Build', 'Starter']);

// Inclusive weight ranges per sizing tier
const SIZING_RANGES: Record<string, readonly [number, number]> = {
  'Full position': [10, 20],
  'Build':         [6, 9.99],
  'Starter':       [2, 5.99],
};

export interface ValidatePortfolioOptions {
  // Populated from AssetMetadata after Stage 2; gates A2 check if provided
  knownAssetClasses?: Map<string, 'common_stock' | 'etf' | 'unknown'>;
}

/**
 * Final gate: runs every Layer 1 hard check once more on the portfolio about to
 * be serialized. Identical rules to Stage 3 validateSynthesis — redundancy is
 * the point. Stage 3 is the model's safety net; this is ours.
 */
export function validatePortfolio(
  portfolio: SynthesizedPortfolio,
  intent: UserIntent,
  options: ValidatePortfolioOptions = {},
): ValidationResult {
  const blockers: Violation[] = [];
  const warnings: Violation[] = [];
  const p = portfolio.positions;

  const blocker = (rule_id: string, message: string, details: Record<string, unknown> = {}) =>
    blockers.push({ rule_id, severity: 'BLOCKER', message, details });

  const warning = (rule_id: string, message: string, details: Record<string, unknown> = {}) =>
    warnings.push({ rule_id, severity: 'MAJOR', message, details });

  // A1: every position has non-empty theme_justification when themes were requested
  if (intent.themes.length > 0) {
    const missing = p.filter(pos => !pos.theme_justification?.trim());
    if (missing.length > 0) {
      blocker('A1', `${missing.length} position(s) missing theme_justification`, {
        tickers: missing.map(pos => pos.ticker),
      });
    }
  }

  // A2: asset must be common_stock unless intent allows any asset class
  // Only enforced when knownAssetClasses is provided (populated from AssetMetadata)
  if (intent.asset_class !== 'any' && options.knownAssetClasses) {
    const nonEquity = p.filter(pos => {
      const cls = options.knownAssetClasses!.get(pos.ticker);
      return cls !== undefined && cls !== 'common_stock';
    });
    if (nonEquity.length > 0) {
      blocker('A2', `Non-equity tickers in portfolio: ${nonEquity.map(pos => pos.ticker).join(', ')}`, {
        tickers: nonEquity.map(pos => pos.ticker),
      });
    }
  }

  // A3: delivered_count === requested_count OR shortfall_reason is non-empty
  if (
    portfolio.requested_count > 0 &&
    p.length < portfolio.requested_count &&
    !portfolio.shortfall_reason
  ) {
    blocker('A3', `Delivered ${p.length} of ${portfolio.requested_count} requested positions with no shortfall_reason`, {
      requested: portfolio.requested_count,
      delivered: p.length,
    });
  }

  // A4: sum(dollar_amounts) within ±2% of capital_usd
  if (portfolio.total_capital_usd !== null && portfolio.total_capital_usd > 0) {
    const dollarTotal = p.reduce((s, pos) => s + (pos.dollar_amount ?? 0), 0);
    if (dollarTotal > 0) {
      const deviationPct = Math.abs(dollarTotal - portfolio.total_capital_usd) / portfolio.total_capital_usd * 100;
      if (deviationPct > 2) {
        blocker('A4', `Dollar amounts sum to $${dollarTotal.toLocaleString()}, deviating ${deviationPct.toFixed(1)}% from capital $${portfolio.total_capital_usd.toLocaleString()}`, {
          dollarTotal, capital: portfolio.total_capital_usd, deviationPct,
        });
      }
    }
  }

  // C1: weights sum to 100 - cash_reserve_pct ±2%
  if (p.length > 0) {
    const targetSum = 100 - (portfolio.cash_reserve_pct ?? 0);
    const weightSum = p.reduce((s, pos) => s + pos.weight_pct, 0);
    if (Math.abs(weightSum - targetSum) > 2) {
      blocker('C1', `Weights sum to ${weightSum.toFixed(1)}%, expected ${targetSum.toFixed(1)}% ±2%`, {
        weightSum, targetSum, delta: Math.abs(weightSum - targetSum),
      });
    }
  }

  // C2: each weight is within its sizing tier's expected range (warning, not blocker)
  for (const pos of p) {
    const range = SIZING_RANGES[pos.sizing as string];
    if (range && (pos.weight_pct < range[0] || pos.weight_pct > range[1])) {
      warning('C2', `${pos.ticker}: "${pos.sizing}" expects ${range[0]}–${range[1]}% but weight is ${pos.weight_pct}%`, {
        ticker: pos.ticker, sizing: pos.sizing, weight_pct: pos.weight_pct,
      });
    }
  }

  // D1: action and sizing labels must be from allowed vocabularies
  for (const pos of p) {
    if (!ALLOWED_ACTIONS.has(pos.action as string)) {
      blocker('D1', `${pos.ticker}: invalid action "${pos.action}"`, {
        ticker: pos.ticker, action: pos.action, allowed: [...ALLOWED_ACTIONS],
      });
    }
    if (!ALLOWED_SIZING.has(pos.sizing as string)) {
      blocker('D1', `${pos.ticker}: invalid sizing "${pos.sizing}"`, {
        ticker: pos.ticker, sizing: pos.sizing, allowed: [...ALLOWED_SIZING],
      });
    }
  }

  return { ok: blockers.length === 0, blockers, warnings };
}
