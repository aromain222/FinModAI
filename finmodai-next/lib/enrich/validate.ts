export type FactCandidate = {
  value: number;
  source: string;
  confidence: number;
  asOf?: string | null;
  url?: string | null;
  unit?: 'shares' | 'millions' | 'billions' | 'usd' | null;
  notes?: string[];
};

export type ChosenFact = {
  value: number | null;
  source: string;
  confidence: number;
  asOf?: string | null;
  url?: string | null;
  notes?: string[];
};

const SOURCE_RANK: Record<string, number> = {
  results: 0,
  sheet: 1,
  fmp: 2,
  polygon: 3,
  finnhub: 4,
  alphavantage: 5,
  sec: 6,
  openai: 7,
  derived: 8,
  unknown: 99,
};

const rankFor = (source: string) => SOURCE_RANK[source] ?? SOURCE_RANK.unknown;

export const normalizeSharesMm = (candidate: FactCandidate): FactCandidate => {
  if (!candidate || !Number.isFinite(candidate.value)) return candidate;
  const unit = candidate.unit;
  if (unit === 'shares') {
    return { ...candidate, value: candidate.value / 1_000_000, unit: 'millions' };
  }
  if (unit === 'billions') {
    return { ...candidate, value: candidate.value * 1_000, unit: 'millions' };
  }
  return { ...candidate, unit: candidate.unit ?? 'millions' };
};

export const validateSharesMm = (value: number): boolean => {
  if (!Number.isFinite(value)) return false;
  if (value <= 0) return false;
  // Default sanity bounds: allow very large caps but prevent obvious unit errors.
  if (value > 500_000) return false;
  return true;
};

export const validatePrice = (value: number): boolean => {
  if (!Number.isFinite(value)) return false;
  if (value <= 0) return false;
  if (value > 1_000_000) return false;
  return true;
};

export const validateNetDebt = (value: number, enterpriseValue?: number | null): boolean => {
  if (!Number.isFinite(value)) return false;
  if (enterpriseValue && Number.isFinite(enterpriseValue)) {
    if (Math.abs(value) > Math.abs(enterpriseValue) * 5) return false;
  }
  return true;
};

export function chooseBestCandidate(
  candidates: FactCandidate[],
  opts?: { kind?: 'shares' | 'price' | 'netDebt'; enterpriseValue?: number | null }
): ChosenFact {
  if (!candidates.length) {
    return { value: null, source: 'unavailable', confidence: 0 };
  }

  const validated = candidates
    .map((cand) => {
      if (opts?.kind === 'shares') {
        const normalized = normalizeSharesMm(cand);
        return { ...normalized, valid: validateSharesMm(normalized.value) };
      }
      if (opts?.kind === 'price') {
        return { ...cand, valid: validatePrice(cand.value) };
      }
      if (opts?.kind === 'netDebt') {
        return { ...cand, valid: validateNetDebt(cand.value, opts.enterpriseValue) };
      }
      return { ...cand, valid: Number.isFinite(cand.value) };
    })
    .filter((cand) => cand.valid);

  if (!validated.length) {
    return { value: null, source: 'unavailable', confidence: 0 };
  }

  validated.sort((a, b) => {
    const rankDiff = rankFor(a.source) - rankFor(b.source);
    if (rankDiff !== 0) return rankDiff;
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  });

  const best = validated[0];
  return {
    value: best.value,
    source: best.source,
    confidence: best.confidence ?? 0.5,
    asOf: best.asOf ?? null,
    url: best.url ?? null,
    notes: best.notes ?? [],
  };
}
