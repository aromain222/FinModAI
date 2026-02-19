import { getSupabaseServerClient } from '@/lib/supabaseClient';

export type ComparableSnapshot = {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  revenue_ltm: number;
  ebitda_ltm: number;
  net_income_ltm: number;
  cash: number;
  total_debt: number;
  shares_outstanding: number | null;
};

export type ComparableCompany = ComparableSnapshot & {
  logRevenue: number;
  ebitdaMargin: number;
  netMargin: number;
  netDebt: number;
  leverage: number | null;
  score: number;
};

export type ComparableUniverseResult = {
  target: ComparableCompany;
  universe: ComparableCompany[];
  method: 'SIMILARITY_SCREEN';
  explanation: string;
};

type SnapshotRow = {
  ticker: string;
  company_name?: string | null;
  sector?: string | null;
  revenue_ltm?: number | string | null;
  ebitda_ltm?: number | string | null;
  net_income_ltm?: number | string | null;
  cash?: number | string | null;
  total_debt?: number | string | null;
  shares_outstanding?: number | string | null;
};

type FeatureVector = {
  logRevenue: number;
  ebitdaMargin: number;
  netMargin: number;
  leverage: number | null;
};

function toNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function computeFeatures(row: SnapshotRow): FeatureVector | null {
  const revenue = toNumber(row.revenue_ltm);
  const ebitda = toNumber(row.ebitda_ltm);
  const netIncome = toNumber(row.net_income_ltm);
  const cash = toNumber(row.cash) ?? 0;
  const totalDebt = toNumber(row.total_debt) ?? 0;

  if (!revenue || !Number.isFinite(revenue) || revenue <= 0) return null;
  if (ebitda == null || netIncome == null) return null;

  const netDebt = totalDebt - cash;
  const leverage = ebitda > 0 ? netDebt / ebitda : null;

  return {
    logRevenue: Math.log(revenue),
    ebitdaMargin: ebitda / revenue,
    netMargin: netIncome / revenue,
    leverage,
  };
}

type ZStats = {
  mean: number;
  std: number;
};

function zStats(values: number[]): ZStats {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  return { mean, std: std > 0 ? std : 1 };
}

function zScore(value: number, stats: ZStats): number {
  return (value - stats.mean) / stats.std;
}

export async function selectComparableUniverse(
  targetTicker: string,
  desiredCount: number = 10
): Promise<ComparableUniverseResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    throw new Error('Supabase server client is not configured.');
  }

  const cleanTicker = targetTicker.toUpperCase().trim();

  const { data: targetRow, error: targetError } = await supabase
    .from('demo_company_snapshots')
    .select('ticker, company_name, sector, revenue_ltm, ebitda_ltm, net_income_ltm, cash, total_debt, shares_outstanding')
    .eq('ticker', cleanTicker)
    .maybeSingle();

  if (targetError || !targetRow) {
    throw new Error(`Target ticker ${cleanTicker} not found in demo_company_snapshots.`);
  }

  const targetFeatures = computeFeatures(targetRow as SnapshotRow);
  if (!targetFeatures) {
    throw new Error('Target snapshot missing required financials for similarity screen.');
  }

  const { data: rows, error } = await supabase
    .from('demo_company_snapshots')
    .select('ticker, company_name, sector, revenue_ltm, ebitda_ltm, net_income_ltm, cash, total_debt, shares_outstanding')
    .not('ticker', 'is', null);

  if (error || !rows) {
    throw new Error('Failed to load demo_company_snapshots for comps selection.');
  }

  const candidates = (rows as SnapshotRow[])
    .filter((row) => String(row.ticker).toUpperCase() !== cleanTicker)
    .map((row) => {
      const features = computeFeatures(row);
      if (!features) return null;
      const revenue = toNumber(row.revenue_ltm) as number;
      const ebitda = toNumber(row.ebitda_ltm) as number;
      const netIncome = toNumber(row.net_income_ltm) as number;
      const cash = toNumber(row.cash) ?? 0;
      const totalDebt = toNumber(row.total_debt) ?? 0;
      return {
        snapshot: {
          ticker: String(row.ticker).toUpperCase(),
          company_name: row.company_name ?? null,
          sector: row.sector ?? null,
          revenue_ltm: revenue,
          ebitda_ltm: ebitda,
          net_income_ltm: netIncome,
          cash,
          total_debt: totalDebt,
          shares_outstanding: toNumber(row.shares_outstanding),
        },
        features,
      };
    })
    .filter((row): row is { snapshot: ComparableSnapshot; features: FeatureVector } => row !== null);

  if (candidates.length === 0) {
    throw new Error('No comparable companies with valid revenue found in demo universe.');
  }

  const logRevenueStats = zStats(candidates.map((c) => c.features.logRevenue));
  const ebitdaMarginStats = zStats(candidates.map((c) => c.features.ebitdaMargin));
  const netMarginStats = zStats(candidates.map((c) => c.features.netMargin));
  const leverageValues = candidates.map((c) => c.features.leverage).filter((v): v is number => v != null && Number.isFinite(v));
  const leverageStats = leverageValues.length > 0 ? zStats(leverageValues) : { mean: 0, std: 1 };

  const targetZ = {
    logRevenue: zScore(targetFeatures.logRevenue, logRevenueStats),
    ebitdaMargin: zScore(targetFeatures.ebitdaMargin, ebitdaMarginStats),
    netMargin: zScore(targetFeatures.netMargin, netMarginStats),
    leverage: targetFeatures.leverage != null ? zScore(targetFeatures.leverage, leverageStats) : null,
  };

  const scored = candidates.map((candidate) => {
    const z = {
      logRevenue: zScore(candidate.features.logRevenue, logRevenueStats),
      ebitdaMargin: zScore(candidate.features.ebitdaMargin, ebitdaMarginStats),
      netMargin: zScore(candidate.features.netMargin, netMarginStats),
      leverage: candidate.features.leverage != null ? zScore(candidate.features.leverage, leverageStats) : null,
    };

    const leverageDiff =
      targetZ.leverage != null && z.leverage != null ? Math.abs(z.leverage - targetZ.leverage) : 0;

    const score =
      0.45 * Math.abs(z.logRevenue - targetZ.logRevenue) +
      0.35 * Math.abs(z.ebitdaMargin - targetZ.ebitdaMargin) +
      0.15 * Math.abs(z.netMargin - targetZ.netMargin) +
      0.05 * leverageDiff;

    const netDebt = (candidate.snapshot.total_debt ?? 0) - (candidate.snapshot.cash ?? 0);
    return {
      ...candidate.snapshot,
      logRevenue: candidate.features.logRevenue,
      ebitdaMargin: candidate.features.ebitdaMargin,
      netMargin: candidate.features.netMargin,
      netDebt,
      leverage: candidate.features.leverage,
      score,
    } satisfies ComparableCompany;
  });

  const sector = targetRow.sector ?? null;
  const sameSector = sector
    ? scored.filter((item) => item.sector?.toLowerCase() === String(sector).toLowerCase())
    : [];

  sameSector.sort((a, b) => a.score - b.score);
  scored.sort((a, b) => a.score - b.score);

  const minDesired = 8;
  const maxDesired = 12;
  const count = Math.min(maxDesired, Math.max(minDesired, desiredCount));

  const selected: ComparableCompany[] = [];
  for (const item of sameSector.slice(0, 6)) {
    selected.push(item);
  }
  for (const item of scored) {
    if (selected.length >= count) break;
    if (!selected.find((existing) => existing.ticker === item.ticker)) {
      selected.push(item);
    }
  }

  const targetNetDebt = (targetRow.total_debt ? toNumber(targetRow.total_debt) ?? 0 : 0) - (targetRow.cash ? toNumber(targetRow.cash) ?? 0 : 0);
  const target: ComparableCompany = {
    ticker: cleanTicker,
    company_name: targetRow.company_name ?? null,
    sector: targetRow.sector ?? null,
    revenue_ltm: toNumber(targetRow.revenue_ltm) as number,
    ebitda_ltm: toNumber(targetRow.ebitda_ltm) as number,
    net_income_ltm: toNumber(targetRow.net_income_ltm) as number,
    cash: toNumber(targetRow.cash) ?? 0,
    total_debt: toNumber(targetRow.total_debt) ?? 0,
    shares_outstanding: toNumber(targetRow.shares_outstanding),
    logRevenue: targetFeatures.logRevenue,
    ebitdaMargin: targetFeatures.ebitdaMargin,
    netMargin: targetFeatures.netMargin,
    netDebt: targetNetDebt,
    leverage: targetFeatures.leverage,
    score: 0,
  };

  return {
    target,
    universe: selected,
    method: 'SIMILARITY_SCREEN',
    explanation:
      'Selected by similarity on scale, margins, and leverage due to limited sector coverage in demo dataset.',
  };
}
