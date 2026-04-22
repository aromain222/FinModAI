import { getMarketCompanyListingByTicker, getMarketCompanyUniverse, type MarketCompanyListing } from '@/lib/data/company/companyUniverse';
import { lookupStock } from '@/lib/data/company/lookupStock';
import { resolveCompanyProfile } from '@/lib/data/company/resolveCompanyProfile';
import { getMarketEvents } from '@/lib/news/marketEventsPipeline';
import type { MarketEvent } from '@/lib/news/marketEventsTypes';
import { buildNormalizedSmartAssumptionOverrides } from '@/lib/smart-assumptions/shared';
import type {
  SmartAssumptionChangedDriver,
  SmartAssumptionConfidence,
  SmartAssumptionCurrentAssumptions,
  SmartAssumptionDriverKey,
  SmartAssumptionInput,
  SmartAssumptionResult,
} from '@/lib/smart-assumptions/types';

const DRIVER_LABELS: Record<SmartAssumptionDriverKey, string> = {
  revenue_growth: 'Revenue growth',
  operating_margin: 'Operating margin',
  wacc: 'WACC',
  terminal_growth_rate: 'Terminal growth',
};

type ConcreteAssumptions = Record<SmartAssumptionDriverKey, number>;

const DEFAULT_ASSUMPTIONS: ConcreteAssumptions = {
  revenue_growth: 0.06,
  operating_margin: 0.17,
  wacc: 0.095,
  terminal_growth_rate: 0.0225,
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1];
  const right = sorted[middle];
  return typeof left === 'number' && typeof right === 'number' ? (left + right) / 2 : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundBasis(value: number): number {
  return Number(value.toFixed(4));
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferSectorFamily(sector: string | null | undefined, industry: string | null | undefined, companyType: string | null | undefined): string {
  const text = normalizeText([sector, industry, companyType].filter(Boolean).join(' '));
  if (!text) return 'general';
  if (/(software|saas|internet|cloud|semiconductor|technology|ai|it services)/.test(text)) return 'technology';
  if (/(consumer|retail|apparel|restaurant|travel|media|entertainment|communication)/.test(text)) return 'consumer';
  if (/(industrial|transport|logistics|aerospace|defense|machinery|manufacturing)/.test(text)) return 'industrial';
  if (/(energy|oil|gas|materials|mining|chemicals|commodit)/.test(text)) return 'resources';
  if (/(bank|insurance|asset management|financial|broker)/.test(text)) return 'financials';
  if (/(health|biotech|pharma|medical|life science)/.test(text)) return 'healthcare';
  if (/(utility|telecom|real estate|reit|infrastructure)/.test(text)) return 'defensive';
  return 'general';
}

function inferRegime(input: {
  sectorFamily: string;
  marketCap: number | null;
  revenueLtm: number | null;
  currentMargin: number | null;
}): string {
  if (input.sectorFamily === 'financials') return 'financial_compounder';
  if (input.currentMargin !== null && input.currentMargin < 0) return 'investment_phase';
  if (input.sectorFamily === 'resources' || input.sectorFamily === 'industrial') return 'cyclical';
  if (input.marketCap !== null && input.marketCap >= 100_000 && input.currentMargin !== null && input.currentMargin >= 0.2) {
    return 'mature_compounder';
  }
  if (input.revenueLtm !== null && input.revenueLtm <= 5_000) return 'emerging_growth';
  return 'mature';
}

function familyBaseAssumptions(sectorFamily: string, regime: string): ConcreteAssumptions {
  const baseByFamily: Record<string, ConcreteAssumptions> = {
    technology: { revenue_growth: 0.11, operating_margin: 0.24, wacc: 0.0925, terminal_growth_rate: 0.03 },
    consumer: { revenue_growth: 0.06, operating_margin: 0.16, wacc: 0.09, terminal_growth_rate: 0.0225 },
    industrial: { revenue_growth: 0.055, operating_margin: 0.15, wacc: 0.0975, terminal_growth_rate: 0.02 },
    resources: { revenue_growth: 0.04, operating_margin: 0.18, wacc: 0.105, terminal_growth_rate: 0.015 },
    financials: { revenue_growth: 0.05, operating_margin: 0.28, wacc: 0.10, terminal_growth_rate: 0.02 },
    healthcare: { revenue_growth: 0.07, operating_margin: 0.22, wacc: 0.09, terminal_growth_rate: 0.025 },
    defensive: { revenue_growth: 0.04, operating_margin: 0.19, wacc: 0.085, terminal_growth_rate: 0.02 },
    general: DEFAULT_ASSUMPTIONS,
  };
  const base: ConcreteAssumptions = { ...(baseByFamily[sectorFamily] ?? DEFAULT_ASSUMPTIONS) };
  if (regime === 'investment_phase') {
    base.revenue_growth += 0.02;
    base.operating_margin -= 0.06;
    base.wacc += 0.0075;
  } else if (regime === 'emerging_growth') {
    base.revenue_growth += 0.02;
    base.operating_margin -= 0.02;
    base.wacc += 0.005;
  } else if (regime === 'mature_compounder') {
    base.revenue_growth -= 0.015;
    base.operating_margin += 0.03;
    base.wacc -= 0.005;
    base.terminal_growth_rate += 0.0025;
  } else if (regime === 'cyclical') {
    base.revenue_growth -= 0.01;
    base.wacc += 0.005;
    base.terminal_growth_rate -= 0.0025;
  }
  return {
    revenue_growth: clamp(base.revenue_growth, -0.03, 0.22),
    operating_margin: clamp(base.operating_margin, -0.15, 0.45),
    wacc: clamp(base.wacc, 0.065, 0.16),
    terminal_growth_rate: clamp(base.terminal_growth_rate, 0.01, 0.04),
  };
}

function summarizeMacroOverlay(events: MarketEvent[], sectorFamily: string): {
  waccDelta: number;
  terminalGrowthDelta: number;
  revenueGrowthDelta: number;
  summary: string;
  sources: string[];
} {
  if (events.length === 0) {
    return { waccDelta: 0, terminalGrowthDelta: 0, revenueGrowthDelta: 0, summary: 'No active macro overlay applied.', sources: [] };
  }

  let waccDelta = 0;
  let terminalGrowthDelta = 0;
  let revenueGrowthDelta = 0;
  const activeSignals: string[] = [];
  const sources: string[] = [];

  for (const event of events.slice(0, 4)) {
    const marketImpactText = Object.values(event.marketImpact ?? {})
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ');
    const text = normalizeText([
      event.title,
      marketImpactText,
      ...(event.transmissionPath ?? []),
      ...(event.drivers ?? []),
    ].join(' '));
    const leadSource = Array.isArray(event.sources) ? event.sources[0] : null;
    const sourceLabel = typeof leadSource?.name === 'string' ? leadSource.name : null;
    if (sourceLabel) sources.push(sourceLabel);

    if (/(rate|yield|inflation|tariff|oil|energy|credit|funding|higher for longer|policy tight)/.test(text)) {
      waccDelta += 0.0025;
      activeSignals.push(event.title);
    }
    if (/(stagflation|global growth downgrade|slowdown|recession|trade policy uncertainty|hormuz|oil shock)/.test(text)) {
      revenueGrowthDelta -= sectorFamily === 'technology' ? 0.0025 : 0.005;
      terminalGrowthDelta -= 0.0015;
      activeSignals.push(event.title);
    }
    if (/(stimulus|policy support|reflation|stock release|disinflation|easing)/.test(text)) {
      waccDelta -= 0.001;
      terminalGrowthDelta += 0.0005;
    }
  }

  return {
    waccDelta: clamp(waccDelta, -0.0025, 0.01),
    terminalGrowthDelta: clamp(terminalGrowthDelta, -0.005, 0.0025),
    revenueGrowthDelta: clamp(revenueGrowthDelta, -0.015, 0.005),
    summary:
      activeSignals.length > 0
        ? `Current macro overlay reflects ${activeSignals.slice(0, 2).join(' and ')}.`
        : 'Current macro overlay is neutral.',
    sources: Array.from(new Set(sources)),
  };
}

function currentMarginFromEvidence(values: { revenueLtm: number | null; ebitLtm: number | null; ebitdaLtm: number | null }): number | null {
  if (values.revenueLtm === null || values.revenueLtm <= 0) return null;
  if (values.ebitLtm !== null) return values.ebitLtm / values.revenueLtm;
  if (values.ebitdaLtm !== null) return values.ebitdaLtm / values.revenueLtm;
  return null;
}

function buildPeerSet(listings: MarketCompanyListing[], target: {
  ticker: string | null;
  sector: string | null;
  industry: string | null;
}): MarketCompanyListing[] {
  const normalizedTicker = normalizeText(target.ticker);
  const normalizedIndustry = normalizeText(target.industry);
  const normalizedSector = normalizeText(target.sector);
  const filtered = listings.filter((row) => normalizeText(row.ticker) !== normalizedTicker);
  const industryMatches = normalizedIndustry
    ? filtered.filter((row) => normalizeText(row.industry) === normalizedIndustry)
    : [];
  if (industryMatches.length >= 4) return industryMatches.slice(0, 12);
  const sectorMatches = normalizedSector
    ? filtered.filter((row) => normalizeText(row.sector) === normalizedSector)
    : [];
  return sectorMatches.slice(0, 12);
}

function derivePeerMargin(peers: MarketCompanyListing[]): number | null {
  return median(
    peers
      .map((peer) => {
        if (peer.revenueLtm === null || peer.revenueLtm <= 0) return null;
        const ebitda = peer.ebitdaLtm;
        return ebitda !== null ? ebitda / peer.revenueLtm : null;
      })
      .filter((value): value is number => value !== null && Number.isFinite(value)),
  );
}

function confidenceFromEvidence(score: number): SmartAssumptionConfidence {
  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

function normalizeCurrentAssumptions(value?: Partial<SmartAssumptionCurrentAssumptions> | null): SmartAssumptionCurrentAssumptions {
  return {
    revenue_growth: toFiniteNumber(value?.revenue_growth),
    operating_margin: toFiniteNumber(value?.operating_margin),
    wacc: toFiniteNumber(value?.wacc),
    terminal_growth_rate: toFiniteNumber(value?.terminal_growth_rate),
  };
}

export async function deriveSmartAssumptions(input: SmartAssumptionInput): Promise<SmartAssumptionResult> {
  const currentAssumptions = normalizeCurrentAssumptions(input.currentAssumptions);
  const resolvedProfile = await resolveCompanyProfile({
    ticker: input.company.ticker ?? undefined,
    companyName: input.company.companyName ?? undefined,
  });
  const listing =
    input.company.ticker
      ? await getMarketCompanyListingByTicker(input.company.ticker).catch(() => null)
      : null;
  const stockLookup =
    !resolvedProfile && (input.company.ticker || input.company.companyName)
      ? await lookupStock({
          ticker: input.company.ticker ?? undefined,
          prompt: input.company.companyName || input.company.ticker || '',
        }).catch(() => null)
      : null;

  const sector = resolvedProfile?.company.sector ?? listing?.sector ?? stockLookup?.sector ?? input.company.sector ?? null;
  const industry = resolvedProfile?.company.industry ?? listing?.industry ?? stockLookup?.industry ?? input.company.industry ?? null;
  const companyName = resolvedProfile?.company.name ?? listing?.companyName ?? stockLookup?.companyName ?? input.company.companyName ?? null;
  const ticker = resolvedProfile?.company.ticker ?? listing?.ticker ?? stockLookup?.ticker ?? input.company.ticker ?? null;
  const revenueLtm = resolvedProfile?.snapshot?.revenueLtm ?? listing?.revenueLtm ?? stockLookup?.revenueLtm ?? null;
  const ebitdaLtm = resolvedProfile?.snapshot?.ebitdaLtm ?? listing?.ebitdaLtm ?? stockLookup?.ebitdaLtm ?? null;
  const ebitLtm = resolvedProfile?.snapshot?.ebitLtm ?? null;
  const marketCap = resolvedProfile?.snapshot?.marketCap ?? listing?.marketCap ?? stockLookup?.marketCap ?? null;
  const totalDebt = resolvedProfile?.snapshot?.totalDebt ?? listing?.totalDebt ?? stockLookup?.totalDebt ?? null;
  const sectorFamily = inferSectorFamily(sector, industry, resolvedProfile?.company.companyType ?? listing?.companyType ?? null);
  const currentMargin = currentMarginFromEvidence({ revenueLtm, ebitLtm, ebitdaLtm });
  const regime = inferRegime({ sectorFamily, marketCap, revenueLtm, currentMargin });
  const baseAssumptions = familyBaseAssumptions(sectorFamily, regime);

  const peerUniverse = await getMarketCompanyUniverse(400, { qualityOnly: true }).catch(() => []);
  const peers = buildPeerSet(peerUniverse, { ticker, sector, industry });
  const peerMargin = derivePeerMargin(peers);
  const peerSummary =
    peers.length > 0
      ? `${peers.length} peer anchors from ${industry ?? sector ?? 'the closest sector'} with median margin ${peerMargin !== null ? `${(peerMargin * 100).toFixed(1)}%` : 'n/a'}.`
      : 'No tight peer set was available, so sector template ranges were used.';

  const macroEvents = await getMarketEvents({
    origin: input.origin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    view: 'active',
    limit: 4,
    provider: 'live',
  })
    .then((response) => (Array.isArray(response.events) ? response.events : []))
    .catch(async () =>
      getMarketEvents({
        origin: input.origin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        view: 'active',
        limit: 4,
        provider: 'demo-seed',
      })
        .then((response) => (Array.isArray(response.events) ? response.events : []))
        .catch(() => []),
    );
  const macroOverlay = summarizeMacroOverlay(macroEvents, sectorFamily);

  const leverageRatio =
    totalDebt !== null && marketCap !== null && marketCap > 0 ? totalDebt / marketCap : null;
  const sizeWaccAdj =
    marketCap === null ? 0 : marketCap < 5_000 ? 0.01 : marketCap < 25_000 ? 0.005 : marketCap > 200_000 ? -0.005 : 0;
  const leverageWaccAdj =
    leverageRatio === null ? 0 : leverageRatio > 0.6 ? 0.01 : leverageRatio > 0.3 ? 0.005 : leverageRatio < 0.05 ? -0.0025 : 0;

  const revenueGrowth = clamp(
    baseAssumptions.revenue_growth + (marketCap !== null && marketCap > 200_000 ? -0.01 : 0) + macroOverlay.revenueGrowthDelta,
    -0.03,
    0.22,
  );
  const operatingMargin = clamp(
    peerMargin !== null && currentMargin !== null
      ? peerMargin * 0.45 + currentMargin * 0.35 + baseAssumptions.operating_margin * 0.2
      : peerMargin !== null
        ? peerMargin * 0.65 + baseAssumptions.operating_margin * 0.35
        : currentMargin !== null
          ? currentMargin * 0.7 + baseAssumptions.operating_margin * 0.3
          : baseAssumptions.operating_margin,
    -0.15,
    0.45,
  );
  const wacc = clamp(
    baseAssumptions.wacc + sizeWaccAdj + leverageWaccAdj + (currentMargin !== null && currentMargin < 0 ? 0.005 : 0) + macroOverlay.waccDelta,
    0.065,
    0.16,
  );
  const terminalGrowth = clamp(
    baseAssumptions.terminal_growth_rate +
      (regime === 'mature_compounder' ? 0.001 : 0) +
      (regime === 'cyclical' ? -0.001 : 0) +
      macroOverlay.terminalGrowthDelta,
    0.01,
    0.04,
  );

  const suggestions: SmartAssumptionCurrentAssumptions = {
    revenue_growth: roundBasis(revenueGrowth),
    operating_margin: roundBasis(operatingMargin),
    wacc: roundBasis(wacc),
    terminal_growth_rate: roundBasis(terminalGrowth),
  };

  const evidenceScore = {
    revenue_growth: Number(Boolean(companyName || ticker)) + Number(Boolean(sector || industry)) + Number(peers.length >= 4),
    operating_margin: Number(currentMargin !== null) + Number(peerMargin !== null) + Number(peers.length >= 4),
    wacc: Number(marketCap !== null) + Number(totalDebt !== null) + Number(macroEvents.length > 0),
    terminal_growth_rate: Number(Boolean(sector || industry)) + Number(macroEvents.length > 0),
  };

  const driverConfidence = {
    revenue_growth: confidenceFromEvidence(evidenceScore.revenue_growth),
    operating_margin: confidenceFromEvidence(evidenceScore.operating_margin),
    wacc: confidenceFromEvidence(evidenceScore.wacc),
    terminal_growth_rate: confidenceFromEvidence(evidenceScore.terminal_growth_rate),
  } satisfies Record<SmartAssumptionDriverKey, SmartAssumptionConfidence>;

  const driverRationales = {
    revenue_growth:
      peers.length >= 4
        ? `Growth is anchored to the ${sector ?? 'current'} sector regime and tempered by company scale rather than a generic default.`
        : `Growth falls back to a conservative ${sectorFamily} sector template because peer evidence is thin.`,
    operating_margin:
      currentMargin !== null && peerMargin !== null
        ? `Margin blends the company’s current operating profile with the peer median so the starting case is specific to this business.`
        : `Margin leans on ${peerMargin !== null ? 'peer' : 'company'} evidence with a sector guardrail because the full evidence set is incomplete.`,
    wacc:
      macroEvents.length > 0
        ? `WACC reflects company size, leverage, and the current macro backdrop instead of a static discount-rate default.`
        : `WACC reflects company size and leverage with only a light macro overlay because live event context is limited.`,
    terminal_growth_rate:
      macroEvents.length > 0
        ? `Terminal growth stays conservative and only moves modestly for the current macro regime.`
        : `Terminal growth stays close to the sector steady-state range because there is not enough macro evidence to be aggressive.`,
  } satisfies Record<SmartAssumptionDriverKey, string>;

  const changedDrivers = (Object.keys(suggestions) as SmartAssumptionDriverKey[])
    .map((driver): SmartAssumptionChangedDriver | null => {
      const oldValue = currentAssumptions[driver];
      const newValue = suggestions[driver];
      if (typeof newValue !== 'number') return null;
      const material =
        oldValue === null ||
        (driver === 'wacc' || driver === 'terminal_growth_rate'
          ? Math.abs(newValue - oldValue) >= 0.001
          : Math.abs(newValue - oldValue) >= 0.0025);
      if (!material) return null;
      return {
        driver,
        label: DRIVER_LABELS[driver],
        old: oldValue,
        new: newValue,
        rationale: driverRationales[driver],
        confidence: driverConfidence[driver],
      };
    })
    .filter((item): item is SmartAssumptionChangedDriver => item !== null);

  const warnings: string[] = [];
  if (!resolvedProfile?.snapshot && !listing && !stockLookup) {
    warnings.push('Stored company fundamentals were limited, so the suggestion leaned more heavily on sector templates.');
  }
  if (peers.length < 4) {
    warnings.push('Peer evidence was thin, so peer benchmarking stayed conservative.');
  }
  if (macroEvents.length === 0) {
    warnings.push('No active macro/event overlay was available, so WACC and terminal growth stayed close to sector ranges.');
  }

  const companyProfileSummary = companyName
    ? `${companyName}${ticker ? ` (${ticker})` : ''} screens as ${regime.replace(/_/g, ' ')}${sector ? ` in ${sector}` : ''}.`
    : 'Company identity was only partially resolved, so the result stayed conservative.';
  const sources = Array.from(
    new Set(
      [
        resolvedProfile?.snapshot?.source ? `CapitalBase company snapshot (${resolvedProfile.snapshot.source})` : null,
        listing?.source ? `CapitalBase company cache (${listing.source})` : null,
        stockLookup?.source ? `Trusted provider (${stockLookup.source})` : null,
        ...macroOverlay.sources.map((source) => `Macro context (${source})`),
      ].filter((item): item is string => Boolean(item)),
    ),
  );

  const provenanceSummary = {
    companyProfile: companyProfileSummary,
    peerContext: peerSummary,
    macroContext: macroOverlay.summary,
    sources,
  };

  const result: SmartAssumptionResult = {
    sourceType: 'smart_assumption_agent',
    subject: {
      companyName,
      ticker,
      sector,
      industry,
      regime,
    },
    modelType: input.modelType ?? null,
    suggestions,
    changedDrivers,
    driverRationales,
    driverConfidence,
    provenanceSummary,
    warnings,
    normalizedOverrides: {},
  };
  result.normalizedOverrides = buildNormalizedSmartAssumptionOverrides(result);

  return result;
}
