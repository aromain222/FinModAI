/**
 * UserIntent — structured representation of the user's portfolio request.
 *
 * parseUserIntent() is the single place where free-text enters the system
 * and becomes a typed contract. Every downstream stage (screener, synthesis,
 * agents, validation) reads from this object instead of re-parsing the prompt.
 */

export interface UserIntent {
  themes:         string[];                                      // canonical tags, e.g. ["ai", "space"]
  risk_profile:   'aggressive' | 'balanced' | 'conservative';
  position_count: number | null;                                 // null = not specified → use default
  capital_usd:    number | null;                                 // null = not specified
  asset_class:    'common_stock' | 'any';
  raw_prompt:     string;
}

// ── Theme keyword map ─────────────────────────────────────────────────────────

const THEME_MAP: Record<string, string[]> = {
  ai:          ['ai', 'artificial intelligence', 'machine learning', 'ml ', 'llm', 'gpt', 'neural', 'deep learning', 'generative'],
  tech:        ['tech', 'technology', 'software', 'saas', 'cloud computing', 'enterprise software'],
  space:       ['space', 'aerospace', 'rocket', 'satellite', 'defense', 'hypersonic'],
  biotech:     ['biotech', 'biopharma', 'pharma', 'drug', 'clinical', 'genomics', 'oncology', 'therapeutics'],
  semis:       ['semi', 'semiconductor', 'chip', 'chipmaker', 'fab', 'wafer'],
  energy:      ['energy', 'oil', 'gas', 'lng', 'solar', 'renewable', 'clean energy', 'ev battery', 'nuclear'],
  fintech:     ['fintech', 'payments', 'neobank', 'insurtech', 'lending'],
  crypto:      ['crypto', 'bitcoin', 'blockchain', 'defi', 'web3', 'digital asset'],
  consumer:    ['consumer', 'retail', 'ecommerce', 'e-commerce', 'apparel', 'luxury'],
  healthcare:  ['healthcare', 'health', 'medical device', 'hospital', 'diagnostics'],
  industrials: ['industrial', 'manufacturing', 'automation', 'robotics', 'infrastructure'],
  realestate:  ['reit', 'real estate', 'property'],
};

const AGGRESSIVE_KEYWORDS = [
  'aggressive', 'high growth', 'high-growth', 'speculative', 'high beta',
  'momentum', 'volatile', 'high risk', 'high-risk', 'maximum growth',
];

const CONSERVATIVE_KEYWORDS = [
  'conservative', 'safe', 'dividend', 'stable', 'low risk', 'low-risk',
  'defensive', 'value', 'income', 'blue chip', 'blue-chip',
];

// ── Parsers ───────────────────────────────────────────────────────────────────

function extractThemes(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const found: string[] = [];
  for (const [theme, keywords] of Object.entries(THEME_MAP)) {
    if (keywords.some(kw => lower.includes(kw))) found.push(theme);
  }
  return found;
}

function extractRiskProfile(
  prompt: string,
): 'aggressive' | 'balanced' | 'conservative' {
  const lower = prompt.toLowerCase();
  if (AGGRESSIVE_KEYWORDS.some(kw => lower.includes(kw))) return 'aggressive';
  if (CONSERVATIVE_KEYWORDS.some(kw => lower.includes(kw))) return 'conservative';
  return 'balanced';
}

function extractPositionCount(prompt: string): number | null {
  // Adjacent: "10 stocks", "5-pick", "15 positions"
  const adjacent = /\b(\d+)\s*[-\s]?(?:stock|position|name|pick|idea|compan)(?:y|ies|s)?\b/i.exec(prompt);
  if (adjacent) {
    const n = parseInt(adjacent[1], 10);
    if (n >= 1 && n <= 30) return n;
  }
  // Bare number when a portfolio keyword appears anywhere in the prompt
  // e.g. "give me 5 aggressive AI and space picks"
  const hasSizeContext = /\b(?:stock|position|name|pick|idea|compan)(?:y|ies|s)?\b/i.test(prompt);
  if (hasSizeContext) {
    const bare = /\b([1-9]\d?)\b/.exec(prompt); // 1–99
    if (bare) {
      const n = parseInt(bare[1], 10);
      if (n >= 1 && n <= 30) return n;
    }
  }
  return null;
}

function extractCapital(prompt: string): number | null {
  // "$10k", "$10,000", "$1.5m", "$500"
  const m = /\$\s*([\d,]+\.?\d*)\s*([km]?)\b/i.exec(prompt);
  if (!m) return null;
  const num = parseFloat(m[1].replace(/,/g, ''));
  const suffix = m[2].toLowerCase();
  if (suffix === 'k') return num * 1_000;
  if (suffix === 'm') return num * 1_000_000;
  return num > 0 ? num : null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function parseUserIntent(prompt: string): UserIntent {
  const lower = prompt.toLowerCase();
  const wantsETF = /\betfs?\b|\bfunds?\b|\bindex\b/i.test(prompt);

  return {
    themes:         extractThemes(prompt),
    risk_profile:   extractRiskProfile(prompt),
    position_count: extractPositionCount(prompt),
    capital_usd:    extractCapital(prompt),
    asset_class:    wantsETF ? 'any' : 'common_stock',
    raw_prompt:     prompt,
  };
}
