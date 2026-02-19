/**
 * Comparable Company Selection Engine (Similarity Screen)
 * Uses public.demo_company_snapshots and similarity scoring.
 */

import { selectComparableUniverse } from '@/lib/comps/selectComparableUniverse';

export interface PeerMetadata {
  ticker: string;
  inclusionReason: string;
  rationale?: string;
  sizeMultiple?: string; // e.g., "1.2× revenue"
  industryMatch?: string;
  profitabilityContext?: string;
  marketCap?: number | null;
  revenue?: number | null;
  sector?: string | null;
  industry?: string | null;
}

export interface SuggestedPeer {
  ticker: string;
  companyName: string;
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
  revenue?: number | null;
  ebitdaMargin?: number | null;
  revenueGrowth?: number | null;
  rationale: string;
}

export interface PeerSelectionResult {
  peers: string[];
  targetCompany?: {
    ticker: string;
    companyName?: string | null;
    sector?: string | null;
    industry?: string | null;
    marketCap?: number | null;
    revenue?: number | null;
    ebitdaMargin?: number | null;
    revenueGrowth?: number | null;
  };
  suggestedPeers?: SuggestedPeer[];
  notes?: string[];
  metadata?: Record<string, PeerMetadata>;
  diagnostics?: {
    targetSize?: number;
    targetSector?: string;
    targetIndustry?: string;
    candidateCount?: number;
    finalCount?: number;
    warnings?: string[];
  };
}

function generateMetadata(
  candidate: {
    ticker: string;
    sector?: string | null;
    revenue_ltm: number;
    ebitdaMargin?: number | null;
  },
  target: { revenue?: number; sector?: string | null }
): PeerMetadata {
  const reasons: string[] = [];
  let sizeMultiple: string | undefined;
  let profitabilityContext: string | undefined;

  if (target.revenue) {
    const multiple = candidate.revenue_ltm / target.revenue;
    sizeMultiple = `${multiple.toFixed(2)}× revenue`;
    reasons.push('Similarity screen');
  }

  if (candidate.ebitdaMargin != null) {
    profitabilityContext = candidate.ebitdaMargin >= 0 ? 'Positive EBITDA' : 'Negative EBITDA';
  }

  const rationale = reasons.length > 0 ? reasons.join(', ') : 'Similarity screen';
  return {
    ticker: candidate.ticker,
    inclusionReason: rationale,
    rationale,
    sizeMultiple,
    profitabilityContext,
    marketCap: null,
    revenue: candidate.revenue_ltm,
    sector: candidate.sector ?? null,
    industry: null,
  };
}

export async function identifyPeers(ticker: string, count: number = 10): Promise<PeerSelectionResult> {
  const warnings: string[] = [];
  const cleanTicker = ticker.toUpperCase().trim();

  try {
    const result = await selectComparableUniverse(cleanTicker, count);

    const metadata: Record<string, PeerMetadata> = {};
    result.universe.forEach((candidate) => {
      metadata[candidate.ticker] = generateMetadata(candidate, {
        revenue: result.target.revenue_ltm,
        sector: result.target.sector ?? null,
      });
    });

    const suggestedPeers: SuggestedPeer[] = result.universe.map((candidate) => ({
      ticker: candidate.ticker,
      companyName: candidate.company_name || candidate.ticker,
      marketCap: null,
      sector: candidate.sector ?? null,
      industry: null,
      revenue: candidate.revenue_ltm ?? null,
      ebitdaMargin: candidate.ebitdaMargin ?? null,
      revenueGrowth: null,
      rationale: metadata[candidate.ticker]?.inclusionReason || 'Similarity screen',
    }));

    return {
      peers: result.universe.map((candidate) => candidate.ticker),
      suggestedPeers,
      targetCompany: {
        ticker: cleanTicker,
        companyName: result.target.company_name ?? cleanTicker,
        sector: result.target.sector ?? null,
        industry: null,
        marketCap: null,
        revenue: result.target.revenue_ltm,
        ebitdaMargin: result.target.ebitdaMargin ?? null,
        revenueGrowth: null,
      },
      notes: ['Suggested Peer Group — User Editable'],
      metadata,
      diagnostics: {
        targetSize: result.target.revenue_ltm,
        targetSector: result.target.sector ?? undefined,
        candidateCount: result.universe.length,
        finalCount: result.universe.length,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : 'Peer selection failed.');
    return {
      peers: [],
      notes: ['Suggested Peer Group — User Editable'],
      diagnostics: { warnings },
    };
  }
}

export function mergePeerSets(autoPeers: string[], customComps: string[], useOnlyCustom: boolean): string[] {
  if (useOnlyCustom) {
    return customComps;
  }
  const merged = [...new Set([...autoPeers, ...customComps])];
  return merged;
}

export function cleanTickerArray(tickers: string | string[] | undefined): string[] {
  if (!tickers) return [];
  if (typeof tickers === 'string') {
    return tickers
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0);
  }
  if (Array.isArray(tickers)) {
    return tickers
      .map((t) => (typeof t === 'string' ? t.trim().toUpperCase() : String(t).trim().toUpperCase()))
      .filter((t) => t.length > 0);
  }
  return [];
}
