import { getOpenAIKey } from '@/lib/openaiKey';
import { refineNetDebtWithAI } from '@/lib/ai/netDebtEstimator';
import { getDemoSnapshot } from '@/lib/data/providers/demoProvider';

type NetDebtResolutionSource = 'REPORTED' | 'AI_ESTIMATED' | 'UNAVAILABLE';

export type DcfNetDebtResolutionInput = {
  ticker: string;
  companyName?: string | null;
  sector?: string | null;
  revenueLtm: number | null;
  ebitdaLtm: number | null;
  netIncomeLtm: number | null;
  cash: number | null;
  totalDebt: number | null;
  sharesOutstanding: number | null;
};

export type DcfNetDebtResolution = {
  cash: number | null;
  totalDebt: number | null;
  sharesOutstanding: number | null;
  netDebt: number | null;
  source: NetDebtResolutionSource;
  note?: string;
};

function toFiniteOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickPreferredValue(primary: unknown, secondary: number | null): number | null {
  const primaryParsed = toFiniteOrNull(primary);
  return primaryParsed ?? secondary;
}

/**
 * Resolve net debt for DCF report/export path.
 * Values are USD millions.
 */
export async function resolveDcfReportNetDebt(input: DcfNetDebtResolutionInput): Promise<DcfNetDebtResolution> {
  let snapshotCash = input.cash;
  let snapshotTotalDebt = input.totalDebt;
  let snapshotSharesOutstanding = input.sharesOutstanding;

  try {
    const snapshot = await getDemoSnapshot(input.ticker);
    if (snapshot) {
      snapshotCash = pickPreferredValue(snapshot.cash, snapshotCash);
      snapshotTotalDebt = pickPreferredValue(snapshot.total_debt, snapshotTotalDebt);
      snapshotSharesOutstanding = pickPreferredValue(snapshot.shares_outstanding, snapshotSharesOutstanding);
    }
  } catch (error) {
    // Keep upstream values if snapshot query fails.
  }

  if (snapshotCash !== null && snapshotTotalDebt !== null) {
    return {
      cash: snapshotCash,
      totalDebt: snapshotTotalDebt,
      sharesOutstanding: snapshotSharesOutstanding,
      netDebt: snapshotTotalDebt - snapshotCash,
      source: 'REPORTED',
    };
  }

  const hasAiKey = Boolean(getOpenAIKey('service'));
  if (hasAiKey) {
    try {
      const ai = await refineNetDebtWithAI(
        {
          companyName: input.companyName || input.ticker,
          ticker: input.ticker,
          sector: input.sector || 'Unknown',
          revenueLtm: input.revenueLtm ?? 0,
          ebitdaLtm: input.ebitdaLtm ?? null,
          netIncomeLtm: input.netIncomeLtm ?? null,
          fallback: {
            netDebt: 0,
            ndToEbitda: null,
            confidence: 'low',
            notes: ['Cash and/or total debt missing in demo_company_snapshots.'],
          },
        },
        true
      );

      return {
        cash: snapshotCash,
        totalDebt: snapshotTotalDebt,
        sharesOutstanding: snapshotSharesOutstanding,
        netDebt: ai.netDebt,
        source: 'AI_ESTIMATED',
        note: 'Estimated via AI due to missing cash/debt fields.',
      };
    } catch {
      // Fall through to unavailable state.
    }
  }

  return {
    cash: snapshotCash,
    totalDebt: snapshotTotalDebt,
    sharesOutstanding: snapshotSharesOutstanding,
    netDebt: null,
    source: 'UNAVAILABLE',
    note: 'Net debt unavailable.',
  };
}
