export type NetDebtEstimate = {
  netDebt: number;
  method: 'CALCULATED' | 'SECTOR_LEVERAGE_RULES';
  confidence: 'high' | 'medium' | 'low';
  assumptions: {
    ndToEbitda: number;
    notes: string[];
  };
};

export type NetDebtFallbackInput = {
  sector?: string | null;
  revenue_ltm?: number | null;
  ebitda_ltm?: number | null;
  net_income_ltm?: number | null;
  cash?: number | null;
  total_debt?: number | null;
};

type SectorRule = {
  min: number;
  max: number;
  defaultMultiple: number;
  label: string;
};

const SECTOR_RULES: Record<string, SectorRule> = {
  technology: { min: -0.5, max: 1.0, defaultMultiple: 0.0, label: 'Technology' },
  'financial services': { min: 0.5, max: 2.0, defaultMultiple: 1.0, label: 'Financial Services' },
  'consumer discretionary': { min: 0.5, max: 2.5, defaultMultiple: 1.5, label: 'Consumer Discretionary' },
  'consumer staples': { min: 1.0, max: 3.0, defaultMultiple: 2.0, label: 'Consumer Staples' },
  healthcare: { min: 0.0, max: 2.5, defaultMultiple: 1.0, label: 'Healthcare' },
  industrials: { min: 1.0, max: 3.5, defaultMultiple: 2.0, label: 'Industrials/Energy' },
  energy: { min: 1.0, max: 3.5, defaultMultiple: 2.0, label: 'Industrials/Energy' },
};

const toFinite = (value: unknown): number | null => {
  if (typeof value !== 'number') return null;
  return Number.isFinite(value) ? value : null;
};

const normalizeSector = (sector?: string | null): string => {
  if (!sector) return '';
  return sector.trim().toLowerCase();
};

export function estimateNetDebt(snapshot: NetDebtFallbackInput): NetDebtEstimate {
  const cash = toFinite(snapshot.cash);
  const totalDebt = toFinite(snapshot.total_debt);

  if (cash !== null && totalDebt !== null) {
    return {
      netDebt: totalDebt - cash,
      method: 'CALCULATED',
      confidence: 'high',
      assumptions: {
        ndToEbitda: NaN,
        notes: ['Net debt calculated from total_debt - cash.'],
      },
    };
  }

  const ebitda = toFinite(snapshot.ebitda_ltm);
  const revenue = toFinite(snapshot.revenue_ltm);
  const sectorKey = normalizeSector(snapshot.sector);
  const rule =
    SECTOR_RULES[sectorKey] ||
    (sectorKey.includes('industrial') ? SECTOR_RULES.industrials : undefined) ||
    (sectorKey.includes('energy') ? SECTOR_RULES.energy : undefined);

  if (ebitda !== null && ebitda > 0 && rule) {
    return {
      netDebt: rule.defaultMultiple * ebitda,
      method: 'SECTOR_LEVERAGE_RULES',
      confidence: 'medium',
      assumptions: {
        ndToEbitda: rule.defaultMultiple,
        notes: [
          `Sector leverage band ${rule.min}x–${rule.max}x for ${rule.label}.`,
          `Applied default ${rule.defaultMultiple}x to EBITDA.`,
        ],
      },
    };
  }

  if (ebitda !== null && ebitda > 0 && !rule) {
    return {
      netDebt: 0.0 * ebitda,
      method: 'SECTOR_LEVERAGE_RULES',
      confidence: 'low',
      assumptions: {
        ndToEbitda: 0.0,
        notes: [
          'Sector not classified; defaulted to 0.0x EBITDA.',
        ],
      },
    };
  }

  if (revenue !== null && revenue > 0) {
    return {
      netDebt: 0.15 * revenue,
      method: 'SECTOR_LEVERAGE_RULES',
      confidence: 'low',
      assumptions: {
        ndToEbitda: NaN,
        notes: ['EBITDA missing or non-positive; used 0.15x revenue proxy.'],
      },
    };
  }

  return {
    netDebt: 0,
    method: 'SECTOR_LEVERAGE_RULES',
    confidence: 'low',
    assumptions: {
      ndToEbitda: NaN,
      notes: ['Insufficient inputs to estimate net debt; defaulted to 0.'],
    },
  };
}
