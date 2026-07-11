import type { MarketStatePacket } from '@/lib/pm/marketState/marketStateContract';

export const DEFAULT_RESEARCH_HORIZON_DAYS = 45;

export type ResearchHorizon = {
  days: number;
  startDate: string;
  endDate: string;
  label: string;
};

export type ResearchMetric = {
  value: number | null;
  source: string | null;
  asOf: string | null;
  unit?: string;
};

export type ResearchCatalyst = {
  title: string;
  source: string | null;
  publishedAt: string | null;
  url: string | null;
};

export type ResearchPacket = {
  version: 1;
  ticker: string;
  companyName: string | null;
  builtAt: string;
  horizon: ResearchHorizon;
  company: { sector: string | null; industry: string | null; exchange: string | null; currency: string | null };
  market: { price: ResearchMetric; marketCap: ResearchMetric; sharesOutstanding: ResearchMetric };
  fundamentals: {
    revenueLtm: ResearchMetric;
    grossMarginPct: ResearchMetric;
    ebitdaLtm: ResearchMetric;
    ebitdaMarginPct: ResearchMetric;
    netIncomeLtm: ResearchMetric;
    netMarginPct: ResearchMetric;
    cash: ResearchMetric;
    totalDebt: ResearchMetric;
    netDebtToEbitda: ResearchMetric;
    historicalRevenueGrowthPct: ResearchMetric;
  };
  consensus: {
    revenueEstimateNtm: ResearchMetric;
    epsEstimateNtm: ResearchMetric;
    targetPrice: ResearchMetric;
    targetUpsidePct: ResearchMetric;
    analystCount: number | null;
    rating: string | null;
  };
  earnings: {
    fiscalPeriod: string | null;
    reportEndDate: string | null;
    filedAt: string | null;
    lastFetchedAt: string | null;
    highlights: string[];
    source: string | null;
  };
  pricePath: {
    expectedReturnPct: ResearchMetric;
    lowerReturnPct: ResearchMetric;
    upperReturnPct: ResearchMetric;
    momentum20dPct: ResearchMetric;
    annualizedVolatilityPct: ResearchMetric;
    methodology: string | null;
  };
  catalysts: ResearchCatalyst[];
  marketState: MarketStatePacket | null;
  quality: { coveragePct: number; available: string[]; missing: string[]; warnings: string[] };
};

export function isResearchPacket(value: unknown): value is ResearchPacket {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<ResearchPacket>;
  return row.version === 1
    && typeof row.ticker === 'string'
    && typeof row.builtAt === 'string'
    && Boolean(row.horizon && typeof row.horizon.days === 'number')
    && Boolean(row.quality && Array.isArray(row.quality.missing));
}

function formatMetric(label: string, item: ResearchMetric): string {
  if (item.value === null) return `${label}: unavailable`;
  const unit = item.unit ? ` ${item.unit}` : '';
  const provenance = [item.source, item.asOf].filter(Boolean).join(', ');
  return `${label}: ${item.value}${unit}${provenance ? ` [${provenance}]` : ''}`;
}

export function formatResearchPacketForPrompt(packet: ResearchPacket): string {
  const catalysts = packet.catalysts.length > 0
    ? packet.catalysts.slice(0, 8).map(item => {
        const provenance = [item.source, item.publishedAt].filter(Boolean).join(', ');
        return `- ${item.title}${provenance ? ` (${provenance})` : ''}`;
      }).join('\n')
    : '- No verified company catalysts were retrieved.';
  const earningsHighlights = packet.earnings.highlights.length > 0
    ? packet.earnings.highlights.slice(0, 8).map(item => `- ${item}`).join('\n')
    : '- No verified earnings detail was retrieved.';

  return [
    '=== VERIFIED RESEARCH PACKET ===',
    `Ticker: ${packet.ticker} | Company: ${packet.companyName ?? 'unavailable'}`,
    `Decision horizon: ${packet.horizon.startDate} to ${packet.horizon.endDate} (${packet.horizon.days} days)`,
    `Sector / industry: ${packet.company.sector ?? 'unavailable'} / ${packet.company.industry ?? 'unavailable'}`,
    `Evidence coverage: ${packet.quality.coveragePct}%`,
    '',
    formatMetric('Price', packet.market.price),
    formatMetric('Market cap', packet.market.marketCap),
    formatMetric('Revenue LTM', packet.fundamentals.revenueLtm),
    formatMetric('Historical revenue growth', packet.fundamentals.historicalRevenueGrowthPct),
    formatMetric('EBITDA margin', packet.fundamentals.ebitdaMarginPct),
    formatMetric('Net margin', packet.fundamentals.netMarginPct),
    formatMetric('Net debt / EBITDA', packet.fundamentals.netDebtToEbitda),
    formatMetric('Consensus NTM revenue', packet.consensus.revenueEstimateNtm),
    formatMetric('Consensus NTM EPS', packet.consensus.epsEstimateNtm),
    formatMetric('Consensus target upside', packet.consensus.targetUpsidePct),
    `Consensus rating: ${packet.consensus.rating ?? 'unavailable'} (${packet.consensus.analystCount ?? 0} analysts)`,
    formatMetric(`${packet.horizon.days}-day forecast return`, packet.pricePath.expectedReturnPct),
    formatMetric('Forecast downside bound', packet.pricePath.lowerReturnPct),
    formatMetric('Forecast upside bound', packet.pricePath.upperReturnPct),
    formatMetric('20-day momentum', packet.pricePath.momentum20dPct),
    formatMetric('Annualized volatility', packet.pricePath.annualizedVolatilityPct),
    '',
    `Latest earnings period: ${packet.earnings.fiscalPeriod ?? 'unavailable'}; report end ${packet.earnings.reportEndDate ?? 'unavailable'}`,
    earningsHighlights,
    '',
    'Verified recent catalysts/headlines:',
    catalysts,
    '',
    `Market regime: ${packet.marketState?.regime ?? 'unavailable'} (${packet.marketState?.regimeConfidence ?? 0}/100)`,
    '',
    `Missing evidence: ${packet.quality.missing.join(', ') || 'none'}`,
    'Rules: Treat missing evidence as unknown, not neutral. Do not invent dates, estimates, positioning, options, peer multiples, or management commentary.',
  ].join('\n');
}
