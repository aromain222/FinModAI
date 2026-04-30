import { DcfSpecSchema, type DcfSpec } from '@/lib/modeling/dcfSpec';
import { evaluateDcfSpec } from '@/lib/modeling/buildDcfWorkbook';
import { loadDemoSnapshots, type DemoCompanySnapshot } from '@/lib/demo/demoSnapshotStore';
import { buildSeededFallbackLtm } from '@/lib/demo/seededTickerFallback';
import { getOpenAIKeyCandidates, getOpenAIModelCandidates } from '@/lib/openaiKey';
import { inferTickerFromPrompt } from '@/lib/analyst/retrieval';
import { resolveCompanyProfile } from '@/lib/data/company/resolveCompanyProfile';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';
import { formatCompactCurrency } from '@/lib/analyst/dcfFormatting';
import type { AttachmentStatementSnapshot } from '@/lib/analyst/pdfFinancialStatements';

export type AnalystDcfScenarioKey = 'base' | 'bull' | 'bear';

export type AnalystDcfScenarioResult = {
  name: 'Base' | 'Bull' | 'Bear';
  enterpriseValue: number;
  equityValue: number;
  pricePerShare: number | null;
  marketPrice: number | null;
  upsidePct: number | null;
  netDebt: number;
  stagePv: number;
  terminalValue: number;
  pvTerminalValue: number;
  terminalValueWeight: number | null;
};

export type AnalystDcfBaseMetrics = {
  revenueLtm: number;
  ebitdaLtm: number;
  netIncomeLtm: number;
  cash: number;
  totalDebt: number;
  netDebt: number;
  sharesOutstanding: number | null;
  sharePrice: number | null;
  marketCap: number | null;
};

export type AnalystDcfAssumptions = {
  revenueGrowth: number[];
  ebitMargin: number[];
  taxRate: number;
  daPctRevenue: number;
  capexPctRevenue: number;
  nwcPctRevenue: number;
  wacc: number;
  terminalGrowth: number;
};

export type AnalystDcfComparisonPayload = {
  ticker: string;
  companyName: string;
  sector: string | null;
  source: string;
  asOfDate: string | null;
  notes: string[];
  baseMetrics: AnalystDcfBaseMetrics;
  assumptions: AnalystDcfAssumptions;
  scenarios: Record<AnalystDcfScenarioKey, AnalystDcfScenarioResult>;
};

export type AnalystDcfDemoPayload = {
  prompt: string;
  ticker: string;
  companyName: string;
  sector: string | null;
  currency: string;
  years: number;
  source: string;
  asOfDate: string | null;
  memo: string;
  warnings: string[];
  notes: string[];
  baseMetrics: AnalystDcfBaseMetrics;
  assumptions: AnalystDcfAssumptions;
  forecast: Array<{
    year: number;
    revenue: number;
    ebit: number;
    fcff: number;
  }>;
  scenarios: Record<AnalystDcfScenarioKey, AnalystDcfScenarioResult>;
  comparison?: AnalystDcfComparisonPayload | null;
};

export type AnalystDcfAdjustment = {
  revenueGrowth?: number[];
  ebitMargin?: number[];
  wacc?: number;
  terminalGrowth?: number;
};

type AnalystDcfEventShock = {
  label: string;
  assumptions: Partial<DeterministicAssumptions>;
  notes: string[];
};

type PromptParseResult = {
  years: number;
  impliedTicker?: string;
  overrides: Partial<{
    wacc: number;
    terminalGrowth: number;
  }>;
  tone: 'base' | 'bull' | 'bear';
};

type DeterministicAssumptions = {
  revenueGrowth: number[];
  ebitMargin: number[];
  taxRate: number;
  daPctRevenue: number;
  capexPctRevenue: number;
  nwcPctRevenue: number;
  wacc: number;
  terminalGrowth: number;
  notes: string[];
};

type AiAssumptionPatch = Partial<DeterministicAssumptions>;

type ResolvedCompany = {
  ticker: string;
  snapshot: DemoCompanySnapshot;
  source: string;
  asOfDate: string | null;
};

type MentionedResolvedCompany = ResolvedCompany & {
  position: number;
  score: number;
};

const DEFAULT_YEARS = 5;
const COMPANY_SUFFIX_RE =
  /\b(incorporated|inc|corp|corporation|holdings|holding|group|plc|limited|ltd|co|company)\b/gi;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizePromptText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeCompanyName(value: string): string {
  return normalizePromptText(value).replace(COMPANY_SUFFIX_RE, '').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePercentLike(match: RegExpMatchArray | null): number | undefined {
  if (!match?.[1]) return undefined;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed > 1 ? parsed / 100 : parsed;
}

export function isDcfEventShockPrompt(prompt: string): boolean {
  const text = normalizePromptText(prompt);
  return /\b(ceo|management|executive|retire|retires|resign|succession|rates stay higher|higher for longer|rate shock|oil spike|crude spike|tariff|trade war|trade shock)\b/.test(text);
}

function applySeriesDelta(values: number[], delta: number, min: number, max: number): number[] {
  return values.map((value) => Number(clamp(value + delta, min, max).toFixed(4)));
}

function inferEventShock(prompt: string, payload: AnalystDcfDemoPayload): AnalystDcfEventShock | null {
  const text = normalizePromptText(prompt);
  const sector = normalizePromptText(payload.sector || '');

  if (/\b(ceo|management|executive|succession)\b/.test(text) && /\b(retire|retires|retirement|resign|steps down|departure)\b/.test(text)) {
    return {
      label: 'management transition shock',
      assumptions: {
        revenueGrowth: payload.assumptions.revenueGrowth.map((value, index) =>
          Number(clamp(value - (index < 2 ? 0.015 : 0.005), -0.05, 0.25).toFixed(4)),
        ),
        ebitMargin: payload.assumptions.ebitMargin.map((value, index) =>
          Number(clamp(value - (index < 2 ? 0.01 : 0.003), 0.05, 0.5).toFixed(4)),
        ),
        wacc: Number(clamp(payload.assumptions.wacc + 0.0075, 0.06, 0.16).toFixed(4)),
      },
      notes: [
        'Applied management-transition shock: lower near-term growth, modest margin pressure, and higher discount rate.',
      ],
    };
  }

  if (/\b(rates stay higher|higher for longer|rate shock|yields rise|rates rise|higher rates)\b/.test(text)) {
    const durationSensitive = /(software|technology|internet|communication|real estate|consumer)/.test(sector);
    return {
      label: 'higher-for-longer rates shock',
      assumptions: {
        revenueGrowth: applySeriesDelta(payload.assumptions.revenueGrowth, durationSensitive ? -0.005 : -0.0025, -0.05, 0.25),
        wacc: Number(clamp(payload.assumptions.wacc + (durationSensitive ? 0.015 : 0.01), 0.06, 0.16).toFixed(4)),
        terminalGrowth: Number(clamp(payload.assumptions.terminalGrowth - 0.0025, 0.01, 0.04).toFixed(4)),
      },
      notes: [
        'Applied higher-rates shock: discount rate rises and long-duration growth assumptions compress.',
      ],
    };
  }

  if (/\b(oil spike|crude spike|oil shock|oil prices|brent|wti|crude)\b/.test(text)) {
    const energyBeneficiary = /(energy|materials)/.test(sector);
    return {
      label: 'oil shock',
      assumptions: energyBeneficiary
        ? {
            revenueGrowth: applySeriesDelta(payload.assumptions.revenueGrowth, 0.01, -0.05, 0.25),
            ebitMargin: applySeriesDelta(payload.assumptions.ebitMargin, 0.01, 0.05, 0.5),
          }
        : {
            revenueGrowth: applySeriesDelta(payload.assumptions.revenueGrowth, -0.005, -0.05, 0.25),
            ebitMargin: applySeriesDelta(payload.assumptions.ebitMargin, -0.01, 0.05, 0.5),
            wacc: Number(clamp(payload.assumptions.wacc + 0.005, 0.06, 0.16).toFixed(4)),
          },
      notes: [
        energyBeneficiary
          ? 'Applied oil shock upside: energy-linked pricing and margin assumptions move higher.'
          : 'Applied oil shock downside: input-cost pressure reduces margin and lifts risk premium.',
      ],
    };
  }

  if (/\b(tariff|tariffs|trade war|trade shock|duties|levies)\b/.test(text)) {
    return {
      label: 'tariff shock',
      assumptions: {
        revenueGrowth: applySeriesDelta(payload.assumptions.revenueGrowth, -0.0075, -0.05, 0.25),
        ebitMargin: applySeriesDelta(payload.assumptions.ebitMargin, -0.01, 0.05, 0.5),
        wacc: Number(clamp(payload.assumptions.wacc + 0.005, 0.06, 0.16).toFixed(4)),
      },
      notes: [
        'Applied tariff shock: lower growth, weaker margin mix, and a modest valuation risk-premium increase.',
      ],
    };
  }

  return null;
}

export function parseDcfPrompt(prompt: string, explicitTicker?: string): PromptParseResult {
  const cleanPrompt = prompt.trim();
  const yearsMatch =
    cleanPrompt.match(/\b(\d{1,2})\s*[- ]?year\b/i) ||
    cleanPrompt.match(/\b(\d{1,2})Y\b/i);
  const years = clamp(Number(yearsMatch?.[1] || DEFAULT_YEARS), 3, 10);

  const wacc =
    parsePercentLike(cleanPrompt.match(/\b(?:at|with)?\s*(\d{1,2}(?:\.\d+)?)\s*%?\s*wacc\b/i)) ??
    parsePercentLike(cleanPrompt.match(/\bwacc\s*(?:of|at|=)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i));
  const terminalGrowth =
    parsePercentLike(cleanPrompt.match(/\b(?:at|with)?\s*(\d(?:\.\d+)?)\s*%?\s*(?:terminal growth|terminal g)\b/i)) ??
    parsePercentLike(cleanPrompt.match(/\b(?:terminal growth|terminal g)\s*(?:of|at|=)?\s*(\d(?:\.\d+)?)\s*%/i));

  const normalizedPrompt = normalizePromptText(cleanPrompt);
  let tone: 'base' | 'bull' | 'bear' = 'base';
  if (/\b(aggressive|bull|upside|optimistic)\b/.test(normalizedPrompt)) tone = 'bull';
  if (/\b(conservative|bear|downside|stress)\b/.test(normalizedPrompt)) tone = 'bear';

  return {
    years,
    impliedTicker: explicitTicker?.trim().toUpperCase() || inferTickerFromPrompt(cleanPrompt),
    overrides: {
      ...(typeof wacc === 'number' ? { wacc: clamp(wacc, 0.05, 0.18) } : {}),
      ...(typeof terminalGrowth === 'number' ? { terminalGrowth: clamp(terminalGrowth, 0.01, 0.04) } : {}),
    },
    tone,
  };
}

function hasComparisonIntent(prompt: string): boolean {
  return /\b(compare|comparison|versus|vs\.?|against|relative to|stack(?:ed)? against|compoare)\b/i.test(prompt);
}

function resolveCompanyFromPrompt(
  prompt: string,
  explicitTicker: string | undefined,
  snapshots: Record<string, DemoCompanySnapshot>
): ResolvedCompany | null {
  const parsed = parseDcfPrompt(prompt, explicitTicker);

  const tickerCandidates = [explicitTicker, parsed.impliedTicker]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim().toUpperCase());

  for (const ticker of tickerCandidates) {
    if (snapshots[ticker]) {
      return {
        ticker,
        snapshot: snapshots[ticker],
        source: 'demo_company_snapshots',
        asOfDate: snapshots[ticker]?.updatedAt ?? null,
      };
    }
  }

  const normalizedPrompt = normalizePromptText(prompt);
  let best: ResolvedCompany | null = null;
  let bestScore = 0;

  for (const [ticker, snapshot] of Object.entries(snapshots)) {
    const fullName = normalizePromptText(snapshot.companyName || '');
    const strippedName = normalizeCompanyName(snapshot.companyName || '');
    if (!fullName && !strippedName) continue;

    let score = 0;
    if (strippedName && normalizedPrompt.includes(strippedName)) score = Math.max(score, strippedName.length);
    if (fullName && normalizedPrompt.includes(fullName)) score = Math.max(score, fullName.length + 10);

    if (score > bestScore) {
      bestScore = score;
      best = {
        ticker,
        snapshot,
        source: 'demo_company_snapshots',
        asOfDate: snapshot.updatedAt ?? null,
      };
    }
  }

  return best;
}

function findMentionedCompanies(
  prompt: string,
  explicitTicker: string | undefined,
  snapshots: Record<string, DemoCompanySnapshot>
): MentionedResolvedCompany[] {
  const normalizedPrompt = normalizePromptText(prompt);
  const explicit = explicitTicker?.trim().toUpperCase();
  const matches: MentionedResolvedCompany[] = [];

  for (const [ticker, snapshot] of Object.entries(snapshots)) {
    const companyName = snapshot.companyName || '';
    const fullName = normalizePromptText(companyName);
    const strippedName = normalizeCompanyName(companyName);
    let position = Number.POSITIVE_INFINITY;
    let score = 0;

    if (explicit && explicit === ticker) {
      position = 0;
      score = Math.max(score, 10_000);
    }

    const tickerPattern = new RegExp(`\\b${escapeRegExp(ticker)}\\b`, 'i');
    const tickerMatch = prompt.match(tickerPattern);
    if (tickerMatch?.index !== undefined) {
      position = Math.min(position, tickerMatch.index);
      score = Math.max(score, 9_000);
    }

    if (strippedName) {
      const idx = normalizedPrompt.indexOf(strippedName);
      if (idx >= 0) {
        position = Math.min(position, idx);
        score = Math.max(score, 2_000 + strippedName.length);
      }
    }

    if (fullName) {
      const idx = normalizedPrompt.indexOf(fullName);
      if (idx >= 0) {
        position = Math.min(position, idx);
        score = Math.max(score, 3_000 + fullName.length);
      }
    }

    if (score > 0 && Number.isFinite(position)) {
      matches.push({
        ticker,
        snapshot,
        source: 'demo_company_snapshots',
        asOfDate: snapshot.updatedAt ?? null,
        position,
        score,
      });
    }
  }

  return matches.sort((left, right) => {
    if (left.position !== right.position) return left.position - right.position;
    return right.score - left.score;
  });
}

function resolveComparisonPairFromPrompt(
  prompt: string,
  explicitTicker: string | undefined,
  snapshots: Record<string, DemoCompanySnapshot>
): { primary: ResolvedCompany; comparison: ResolvedCompany } | null {
  if (!hasComparisonIntent(prompt)) return null;

  const mentions = findMentionedCompanies(prompt, explicitTicker, snapshots);
  if (mentions.length < 2) return null;

  const [primary, ...rest] = mentions;
  const comparison = rest.find((candidate) => candidate.ticker !== primary.ticker);
  if (!comparison) return null;

  return {
    primary,
    comparison,
  };
}

function mapStoredProfileToSnapshot(
  resolved: Awaited<ReturnType<typeof resolveCompanyProfile>>
): ResolvedCompany | null {
  if (!resolved?.snapshot) return null;

  return {
    ticker: resolved.company.ticker,
    source: 'company_snapshots',
    asOfDate: resolved.snapshot.asOfDate ?? null,
    snapshot: {
      ticker: resolved.company.ticker,
      companyName: resolved.company.name,
      sector: resolved.company.sector ?? resolved.company.companyType ?? null,
      revenueLtm: resolved.snapshot.revenueLtm,
      ebitdaLtm: resolved.snapshot.ebitdaLtm ?? resolved.snapshot.ebitLtm,
      netIncomeLtm: resolved.snapshot.netIncomeLtm,
      cash: resolved.snapshot.cash,
      totalDebt: resolved.snapshot.totalDebt,
      sharesOutstanding: resolved.snapshot.sharesOutstanding,
      sharePrice: resolved.latestPrice?.close ?? null,
      marketCap: resolved.snapshot.marketCap,
      updatedAt: resolved.snapshot.asOfDate ?? null,
    },
  };
}

function buildResolvedCompanyFromAttachment(snapshot: AttachmentStatementSnapshot): ResolvedCompany | null {
  if (!(typeof snapshot.revenue === 'number' && snapshot.revenue > 0)) return null;
  const ticker = snapshot.ticker?.trim().toUpperCase() || 'ATTACHMENT';
  return {
    ticker,
    source: snapshot.source,
    asOfDate: snapshot.reportEndDate ?? null,
    snapshot: {
      ticker,
      companyName: snapshot.companyName ?? ticker,
      sector: null,
      revenueLtm: snapshot.revenue,
      grossProfitLtm: snapshot.grossProfit ?? null,
      ebitLtm: snapshot.operatingIncome ?? null,
      ebitdaLtm: snapshot.ebitda ?? null,
      netIncomeLtm: snapshot.netIncome ?? null,
      cash: snapshot.cash ?? null,
      totalDebt: snapshot.totalDebt ?? null,
      sharesOutstanding: snapshot.sharesOutstanding ?? null,
      sharePrice: null,
      marketCap: null,
      updatedAt: snapshot.reportEndDate ?? null,
      sourceMap: {
        attachment: snapshot.source,
      },
    },
  };
}

function buildSeededResolvedCompany(params: {
  ticker: string;
  snapshot?: DemoCompanySnapshot | null;
  asOfDate?: string | null;
}): ResolvedCompany {
  const ltm = buildSeededFallbackLtm(params.ticker.toUpperCase());
  const sharePrice =
    typeof ltm.marketCap === 'number' &&
    typeof ltm.sharesOutstanding === 'number' &&
    ltm.sharesOutstanding > 0
      ? ltm.marketCap / ltm.sharesOutstanding
      : null;

  return {
    ticker: params.ticker.toUpperCase(),
    source: 'demo_seed_fallback',
    asOfDate: params.asOfDate ?? ltm.lastUpdated.slice(0, 10),
    snapshot: {
      ticker: params.ticker.toUpperCase(),
      companyName: params.snapshot?.companyName ?? ltm.companyName ?? params.ticker.toUpperCase(),
      sector: params.snapshot?.sector ?? ltm.sector ?? null,
      revenueLtm: ltm.revenue,
      ebitdaLtm: ltm.ebitda ?? null,
      netIncomeLtm: ltm.netIncome ?? null,
      cash: ltm.cash ?? null,
      totalDebt: ltm.totalDebt ?? null,
      sharesOutstanding: ltm.sharesOutstanding ?? null,
      sharePrice,
      marketCap: ltm.marketCap ?? null,
      updatedAt: params.asOfDate ?? ltm.lastUpdated.slice(0, 10),
    },
  };
}

async function resolveCompanyForDcf(prompt: string, explicitTicker?: string): Promise<ResolvedCompany | null> {
  const stored = await resolveCompanyProfile({ prompt, ticker: explicitTicker });
  const storedResolved = mapStoredProfileToSnapshot(stored);
  if (storedResolved?.snapshot.revenueLtm && storedResolved.snapshot.revenueLtm > 0) {
    return storedResolved;
  }

  const snapshots = await loadDemoSnapshots();
  const demoResolved = resolveCompanyFromPrompt(prompt, explicitTicker, snapshots);
  if (demoResolved?.snapshot.revenueLtm && demoResolved.snapshot.revenueLtm > 0) {
    return demoResolved;
  }

  if (demoResolved) {
    return buildSeededResolvedCompany({
      ticker: demoResolved.ticker,
      snapshot: demoResolved.snapshot,
      asOfDate: demoResolved.asOfDate,
    });
  }

  const parsed = parseDcfPrompt(prompt, explicitTicker);
  const fallbackTicker = explicitTicker?.trim().toUpperCase() || parsed.impliedTicker;
  if (fallbackTicker) {
    return buildSeededResolvedCompany({ ticker: fallbackTicker });
  }

  return null;
}

async function hydrateResolvedCompany(seed: ResolvedCompany): Promise<ResolvedCompany> {
  const stored = await resolveCompanyProfile({
    prompt: seed.snapshot.companyName || seed.ticker,
    ticker: seed.ticker,
  });
  const storedResolved = mapStoredProfileToSnapshot(stored);
  if (storedResolved?.snapshot.revenueLtm && storedResolved.snapshot.revenueLtm > 0) {
    return storedResolved;
  }
  if (!(seed.snapshot.revenueLtm && seed.snapshot.revenueLtm > 0)) {
    return buildSeededResolvedCompany({
      ticker: seed.ticker,
      snapshot: seed.snapshot,
      asOfDate: seed.asOfDate ?? seed.snapshot.updatedAt ?? null,
    });
  }
  return seed;
}

function buildBaseMetrics(snapshot: DemoCompanySnapshot): AnalystDcfBaseMetrics {
  const cash = snapshot.cash ?? 0;
  const totalDebt = snapshot.totalDebt ?? 0;

  return {
    revenueLtm: snapshot.revenueLtm ?? 0,
    ebitdaLtm: snapshot.ebitdaLtm ?? 0,
    netIncomeLtm: snapshot.netIncomeLtm ?? 0,
    cash,
    totalDebt,
    netDebt: totalDebt - cash,
    sharesOutstanding:
      typeof snapshot.sharesOutstanding === 'number' && snapshot.sharesOutstanding > 0 ? snapshot.sharesOutstanding : null,
    sharePrice: typeof snapshot.sharePrice === 'number' && snapshot.sharePrice > 0 ? snapshot.sharePrice : null,
    marketCap: typeof snapshot.marketCap === 'number' && snapshot.marketCap > 0 ? snapshot.marketCap : null,
  };
}

function buildComparisonNotes(primary: AnalystDcfDemoPayload, comparison: AnalystDcfComparisonPayload): string[] {
  const primaryBase = primary.scenarios.base;
  const comparisonBase = comparison.scenarios.base;
  const notes: string[] = [];

  const betterUpside =
    primaryBase.upsidePct !== null && comparisonBase.upsidePct !== null
      ? primaryBase.upsidePct >= comparisonBase.upsidePct
        ? primary.companyName
        : comparison.companyName
      : null;
  if (betterUpside) {
    notes.push(`Compared with ${comparison.companyName}, ${betterUpside} shows the stronger base-case upside/downside profile in this DCF set.`);
  }

  const primaryGrowth = primary.assumptions.revenueGrowth[0] ?? 0;
  const comparisonGrowth = comparison.assumptions.revenueGrowth[0] ?? 0;
  if (primaryGrowth !== comparisonGrowth) {
    const fasterName = primaryGrowth > comparisonGrowth ? primary.companyName : comparison.companyName;
    notes.push(`${fasterName} is modeled with the faster near-term revenue growth path in year one.`);
  }

  const primaryMargin = primary.assumptions.ebitMargin[0] ?? 0;
  const comparisonMargin = comparison.assumptions.ebitMargin[0] ?? 0;
  if (primaryMargin !== comparisonMargin) {
    const higherMarginName = primaryMargin > comparisonMargin ? primary.companyName : comparison.companyName;
    notes.push(`${higherMarginName} carries the higher modeled EBIT margin entering the forecast period.`);
  }

  return notes.slice(0, 3);
}

function defaultGrowthCurve(years: number, sector: string | null, revenueLtm: number): number[] {
  const normalizedSector = normalizePromptText(sector || '');
  let first = 0.07;
  let last = 0.03;

  if (/(software|internet|technology|communication)/.test(normalizedSector)) {
    first = 0.09;
    last = 0.04;
  } else if (/(consumer|retail)/.test(normalizedSector)) {
    first = 0.07;
    last = 0.03;
  } else if (/(industrial|energy|materials|utilities)/.test(normalizedSector)) {
    first = 0.06;
    last = 0.025;
  } else if (/(financial|bank|insurance)/.test(normalizedSector)) {
    first = 0.055;
    last = 0.025;
  }

  if (revenueLtm > 250_000) {
    first -= 0.01;
    last -= 0.005;
  }

  if (years === 1) return [Number(clamp(first, 0.01, 0.18).toFixed(4))];

  return Array.from({ length: years }, (_, index) => {
    const progress = index / Math.max(years - 1, 1);
    const value = first + (last - first) * progress;
    return Number(clamp(value, 0.01, 0.18).toFixed(4));
  });
}

function defaultMarginCurve(years: number, baseMargin: number, tone: PromptParseResult['tone']): number[] {
  const uplift = tone === 'bull' ? 0.015 : tone === 'bear' ? -0.015 : 0.005;
  const terminal = clamp(baseMargin + uplift, 0.08, 0.42);
  if (years === 1) return [Number(terminal.toFixed(4))];

  return Array.from({ length: years }, (_, index) => {
    const progress = index / Math.max(years - 1, 1);
    const value = baseMargin + (terminal - baseMargin) * progress;
    return Number(clamp(value, 0.08, 0.45).toFixed(4));
  });
}

export function buildDeterministicAssumptions(
  snapshot: DemoCompanySnapshot,
  parsed: PromptParseResult
): DeterministicAssumptions {
  const revenueLtm = snapshot.revenueLtm ?? 0;
  const ebitdaMargin =
    revenueLtm > 0 && typeof snapshot.ebitdaLtm === 'number' ? snapshot.ebitdaLtm / revenueLtm : 0.28;
  const daPctRevenue = clamp(ebitdaMargin > 0.3 ? 0.025 : 0.03, 0.02, 0.04);
  const baseEbitMargin = clamp(ebitdaMargin - daPctRevenue, 0.12, 0.38);

  const sector = snapshot.sector || null;
  const normalizedSector = normalizePromptText(sector || '');

  let taxRate = 0.21;
  let capexPctRevenue = /(software|internet)/.test(normalizedSector) ? 0.035 : 0.045;
  let nwcPctRevenue = /(software|internet)/.test(normalizedSector) ? 0.01 : 0.015;
  let wacc = /(software|internet|technology|communication)/.test(normalizedSector) ? 0.09 : 0.1;
  let terminalGrowth = /(software|internet|technology|communication)/.test(normalizedSector) ? 0.03 : 0.025;

  if (parsed.tone === 'bull') {
    wacc -= 0.005;
    terminalGrowth += 0.0025;
  } else if (parsed.tone === 'bear') {
    wacc += 0.005;
    terminalGrowth -= 0.0025;
    capexPctRevenue += 0.0025;
  }

  if (typeof parsed.overrides.wacc === 'number') wacc = parsed.overrides.wacc;
  if (typeof parsed.overrides.terminalGrowth === 'number') terminalGrowth = parsed.overrides.terminalGrowth;

  const notes = [
    `Base year revenue uses stored LTM revenue of ${formatCompactCurrency(revenueLtm)}.`,
    `Operating margin anchors off available EBITDA with a ${Math.round(daPctRevenue * 1000) / 10}% D&A assumption.`,
    'Discount rate and terminal growth are deterministic modeling assumptions, not market-calibrated cost of capital outputs.',
  ];

  return {
    revenueGrowth: defaultGrowthCurve(parsed.years, sector, revenueLtm),
    ebitMargin: defaultMarginCurve(parsed.years, baseEbitMargin, parsed.tone),
    taxRate,
    daPctRevenue,
    capexPctRevenue,
    nwcPctRevenue,
    wacc: clamp(wacc, 0.06, 0.16),
    terminalGrowth: clamp(terminalGrowth, 0.01, 0.04),
    notes,
  };
}

function mergeAssumptions(
  base: DeterministicAssumptions,
  patch: AiAssumptionPatch,
  years: number
): DeterministicAssumptions {
  const revenueGrowth = Array.isArray(patch.revenueGrowth)
    ? patch.revenueGrowth.slice(0, years).map((value) => clamp(value, -0.05, 0.25))
    : base.revenueGrowth;
  const ebitMargin = Array.isArray(patch.ebitMargin)
    ? patch.ebitMargin.slice(0, years).map((value) => clamp(value, 0.05, 0.5))
    : base.ebitMargin;

  return {
    revenueGrowth: revenueGrowth.length === years ? revenueGrowth : base.revenueGrowth,
    ebitMargin: ebitMargin.length === years ? ebitMargin : base.ebitMargin,
    taxRate: typeof patch.taxRate === 'number' ? clamp(patch.taxRate, 0.1, 0.35) : base.taxRate,
    daPctRevenue: typeof patch.daPctRevenue === 'number' ? clamp(patch.daPctRevenue, 0.01, 0.05) : base.daPctRevenue,
    capexPctRevenue:
      typeof patch.capexPctRevenue === 'number' ? clamp(patch.capexPctRevenue, 0.015, 0.1) : base.capexPctRevenue,
    nwcPctRevenue:
      typeof patch.nwcPctRevenue === 'number' ? clamp(patch.nwcPctRevenue, -0.02, 0.05) : base.nwcPctRevenue,
    wacc: typeof patch.wacc === 'number' ? clamp(patch.wacc, 0.06, 0.16) : base.wacc,
    terminalGrowth:
      typeof patch.terminalGrowth === 'number' ? clamp(patch.terminalGrowth, 0.01, 0.04) : base.terminalGrowth,
    notes: Array.isArray(patch.notes) && patch.notes.length > 0
      ? patch.notes.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).slice(0, 4)
      : base.notes,
  };
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  const slice = first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed;
  return JSON.parse(slice);
}

async function generateAiAssumptionPatch(params: {
  prompt: string;
  companyName: string;
  ticker: string;
  sector: string | null;
  revenueLtm: number;
  ebitdaMargin: number | null;
  years: number;
  defaults: DeterministicAssumptions;
  apiKeys: string[];
}): Promise<AiAssumptionPatch | null> {
  if (params.apiKeys.length === 0) return null;

  const models = getOpenAIModelCandidates(process.env.OPENAI_MODEL, 'gpt-5.4-pro', 'gpt-5.4');
  const systemPrompt = [
    'You are generating assumptions for a DCF demo inside an investor product.',
    'Return JSON only. No markdown or prose.',
    `Return arrays with exactly ${params.years} values for revenueGrowth and ebitMargin.`,
    'Stay conservative and internally consistent with the provided scale and sector.',
    'Assumption fields: revenueGrowth, ebitMargin, taxRate, daPctRevenue, capexPctRevenue, nwcPctRevenue, wacc, terminalGrowth, notes.',
    'Use decimals, not percentages.',
  ].join(' ');

  const userPrompt = JSON.stringify(
    {
      prompt: params.prompt,
      company: params.companyName,
      ticker: params.ticker,
      sector: params.sector,
      baseMetrics: {
        revenueLtm: params.revenueLtm,
        ebitdaMargin: params.ebitdaMargin,
      },
      defaultAssumptions: params.defaults,
    },
    null,
    2
  );

  try {
    const response = await generateTextWithProviderFallback({
      clientType: 'user',
      preferredProvider: 'anthropic',
      temperature: 0.2,
      maxTokens: 900,
      openAiModels: models,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    const content = response?.text;
    if (content) {
      const parsed = extractJsonObject(content) as Record<string, unknown>;
      return {
        revenueGrowth: Array.isArray(parsed.revenueGrowth)
          ? parsed.revenueGrowth.filter((value): value is number => typeof value === 'number')
          : undefined,
        ebitMargin: Array.isArray(parsed.ebitMargin)
          ? parsed.ebitMargin.filter((value): value is number => typeof value === 'number')
          : undefined,
        taxRate: typeof parsed.taxRate === 'number' ? parsed.taxRate : undefined,
        daPctRevenue: typeof parsed.daPctRevenue === 'number' ? parsed.daPctRevenue : undefined,
        capexPctRevenue: typeof parsed.capexPctRevenue === 'number' ? parsed.capexPctRevenue : undefined,
        nwcPctRevenue: typeof parsed.nwcPctRevenue === 'number' ? parsed.nwcPctRevenue : undefined,
        wacc: typeof parsed.wacc === 'number' ? parsed.wacc : undefined,
        terminalGrowth: typeof parsed.terminalGrowth === 'number' ? parsed.terminalGrowth : undefined,
        notes: Array.isArray(parsed.notes)
          ? parsed.notes.filter((value): value is string => typeof value === 'string')
          : undefined,
      };
    }
  } catch {
    // fall through to deterministic assumptions
  }

  return null;
}

function makeSensitivityWacc(baseWacc: number): number[] {
  return [-0.015, -0.01, -0.005, 0, 0.005, 0.01, 0.015]
    .map((delta) => Number(clamp(baseWacc + delta, 0.06, 0.16).toFixed(4)))
    .filter((value, index, array) => array.indexOf(value) === index);
}

function makeSensitivityTerminalGrowth(baseGrowth: number): number[] {
  return [-0.01, -0.005, 0, 0.005, 0.01]
    .map((delta) => Number(clamp(baseGrowth + delta, 0.01, 0.04).toFixed(4)))
    .filter((value, index, array) => array.indexOf(value) === index);
}

function buildScenarioAssumptions(
  assumptions: DeterministicAssumptions,
  key: AnalystDcfScenarioKey
): DeterministicAssumptions {
  if (key === 'base') return assumptions;

  const growthDelta = key === 'bull' ? 0.015 : -0.015;
  const marginDelta = key === 'bull' ? 0.01 : -0.015;
  const waccDelta = key === 'bull' ? -0.0075 : 0.01;
  const terminalDelta = key === 'bull' ? 0.005 : -0.005;

  return {
    ...assumptions,
    revenueGrowth: assumptions.revenueGrowth.map((value) => Number(clamp(value + growthDelta, -0.03, 0.28).toFixed(4))),
    ebitMargin: assumptions.ebitMargin.map((value) => Number(clamp(value + marginDelta, 0.06, 0.48).toFixed(4))),
    wacc: Number(clamp(assumptions.wacc + waccDelta, 0.06, 0.18).toFixed(4)),
    terminalGrowth: Number(clamp(assumptions.terminalGrowth + terminalDelta, 0.01, 0.04).toFixed(4)),
  };
}

function buildDcfSpec(params: {
  years: number;
  startYear: number;
  ticker: string;
  companyName: string;
  revenueLtm: number;
  currentEbitMargin: number;
  assumptions: DeterministicAssumptions;
}): DcfSpec {
  return DcfSpecSchema.parse({
    company: {
      name: params.companyName,
      ticker: params.ticker,
      currency: 'USD',
    },
    periods: {
      start_year: params.startYear,
      years: params.years,
    },
    base_year: {
      revenue: params.revenueLtm,
      ebit_margin: clamp(params.currentEbitMargin, 0.08, 0.4),
    },
    forecast: {
      revenue_growth: params.assumptions.revenueGrowth,
      ebit_margin: params.assumptions.ebitMargin,
      tax_rate: params.assumptions.taxRate,
      da_pct_rev: params.assumptions.daPctRevenue,
      capex_pct_rev: params.assumptions.capexPctRevenue,
      nwc_pct_rev: params.assumptions.nwcPctRevenue,
    },
    valuation: {
      wacc: params.assumptions.wacc,
      terminal: {
        method: 'gordon',
        g: params.assumptions.terminalGrowth,
      },
    },
    outputs: {
      sensitivity: {
        wacc: makeSensitivityWacc(params.assumptions.wacc),
        terminal_g: makeSensitivityTerminalGrowth(params.assumptions.terminalGrowth),
      },
    },
  });
}

function evaluateScenario(params: {
  key: AnalystDcfScenarioKey;
  spec: DcfSpec;
  netDebt: number;
  sharesOutstanding: number | null;
  marketPrice: number | null;
}): {
  scenario: AnalystDcfScenarioResult;
  forecast: AnalystDcfDemoPayload['forecast'];
} {
  const evaluation = evaluateDcfSpec(params.spec);
  const equityValue = evaluation.enterpriseValue - params.netDebt;
  const pricePerShare =
    typeof params.sharesOutstanding === 'number' && params.sharesOutstanding > 0
      ? equityValue / params.sharesOutstanding
      : null;
  const upsidePct =
    pricePerShare !== null && params.marketPrice !== null && params.marketPrice > 0
      ? pricePerShare / params.marketPrice - 1
      : null;
  const terminalValueWeight =
    evaluation.enterpriseValue !== 0 ? evaluation.pvTerminalValue / evaluation.enterpriseValue : null;

  const forecast = evaluation.revenue.map((revenue, index) => ({
    year: params.spec.periods.start_year + index + 1,
    revenue,
    ebit: evaluation.ebit[index],
    fcff: evaluation.fcff[index],
  }));

  return {
    scenario: {
      name: params.key === 'bull' ? 'Bull' : params.key === 'bear' ? 'Bear' : 'Base',
      enterpriseValue: evaluation.enterpriseValue,
      equityValue,
      pricePerShare,
      marketPrice: params.marketPrice,
      upsidePct,
      netDebt: params.netDebt,
      stagePv: evaluation.stagePv,
      terminalValue: evaluation.terminalValue,
      pvTerminalValue: evaluation.pvTerminalValue,
      terminalValueWeight,
    },
    forecast,
  };
}

function buildDeterministicMemo(payload: AnalystDcfDemoPayload): string {
  const base = payload.scenarios.base;
  const formatMemoPrice = (value: number | null) => (value === null ? 'n/a' : `$${value.toFixed(2)}`);
  const baseValueText =
    base.pricePerShare === null
      ? 'Base case per-share valuation is unavailable because share count is missing.'
      : `Base case intrinsic value is ${formatMemoPrice(base.pricePerShare)} per share.`;
  const terminalMix =
    base.terminalValueWeight === null ? 'Terminal value mix is not available.' : `Terminal value represents ${(base.terminalValueWeight * 100).toFixed(1)}% of enterprise value.`;

  const comparisonSentence = payload.comparison
    ? ` Versus ${payload.comparison.companyName}, the base case implies ${fmtComparisonMetric(payload.scenarios.base.pricePerShare)} for ${payload.companyName} against ${fmtComparisonMetric(payload.comparison.scenarios.base.pricePerShare)} for ${payload.comparison.companyName}.`
    : '';

  return [
    `${payload.companyName} screens as a long-duration valuation where cash flow compounding and discount-rate discipline drive most of the result.`,
    `${baseValueText} ${terminalMix}`,
    `The underwriting debate is whether revenue growth can decelerate into the terminal period without giving back too much operating margin.${comparisonSentence}`,
  ].join(' ');
}

function fmtComparisonMetric(value: number | null): string {
  return value === null ? 'n/a' : `$${value.toFixed(2)}`;
}

async function generateAiMemo(
  payload: AnalystDcfDemoPayload,
  apiKeys: string[]
): Promise<string | null> {
  if (apiKeys.length === 0) return null;

  const models = getOpenAIModelCandidates(process.env.OPENAI_MODEL, 'gpt-5.4-pro', 'gpt-5.4');
  const systemPrompt = [
    'You are writing a short internal investment memo for a DCF output that may be shown in a meeting.',
    'Keep it to 4 sentences maximum.',
    'Do not mention missing live data, APIs, or implementation details.',
    'Lead with the decision-relevant conclusion, then explain the driver, the main risk, and what would change the thesis.',
    'Write like a buy-side analyst, not like a chatbot.',
  ].join(' ');
  const userPrompt = JSON.stringify(
    {
      company: payload.companyName,
      ticker: payload.ticker,
      sector: payload.sector,
      baseCase: payload.scenarios.base,
      bullCase: payload.scenarios.bull,
      bearCase: payload.scenarios.bear,
      assumptions: payload.assumptions,
      comparison: payload.comparison
        ? {
            company: payload.comparison.companyName,
            ticker: payload.comparison.ticker,
            baseCase: payload.comparison.scenarios.base,
            assumptions: payload.comparison.assumptions,
          }
        : null,
    },
    null,
    2
  );

  try {
    const response = await generateTextWithProviderFallback({
      clientType: 'user',
      preferredProvider: 'anthropic',
      temperature: 0.4,
      maxTokens: 180,
      openAiModels: models,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    if (response?.text?.trim()) {
      return response.text.trim();
    }
  } catch {
    // fall through to deterministic memo
  }

  return null;
}

function buildReply(payload: AnalystDcfDemoPayload): string {
  const formatPrice = (value: number | null) => (value === null ? 'n/a' : `$${value.toFixed(2)}`);
  const formatValue = (value: number) => formatCompactCurrency(value * 1_000_000);
  const base = payload.scenarios.base;
  const bull = payload.scenarios.bull;
  const bear = payload.scenarios.bear;

  const comparisonSection = payload.comparison
    ? [
        '',
        `COMPARISON VS ${payload.comparison.companyName.toUpperCase()}`,
        `- ${payload.companyName}: base implied value ${formatPrice(base.pricePerShare)} on ${formatValue(base.enterpriseValue)} EV.`,
        `- ${payload.comparison.companyName}: base implied value ${formatPrice(payload.comparison.scenarios.base.pricePerShare)} on ${formatValue(payload.comparison.scenarios.base.enterpriseValue)} EV.`,
        `- Year 1 revenue growth: ${(payload.assumptions.revenueGrowth[0] * 100).toFixed(1)}% for ${payload.ticker} vs ${(payload.comparison.assumptions.revenueGrowth[0] * 100).toFixed(1)}% for ${payload.comparison.ticker}.`,
        `- Year 1 EBIT margin: ${(payload.assumptions.ebitMargin[0] * 100).toFixed(1)}% for ${payload.ticker} vs ${(payload.comparison.assumptions.ebitMargin[0] * 100).toFixed(1)}% for ${payload.comparison.ticker}.`,
      ]
    : [];

  return [
    'VALUATION SUMMARY',
    `- Base case implied value: ${formatPrice(base.pricePerShare)} per share on ${formatValue(base.enterpriseValue)} EV.`,
    `- Bull case implied value: ${formatPrice(bull.pricePerShare)} per share.`,
    `- Bear case implied value: ${formatPrice(bear.pricePerShare)} per share.`,
    '',
    'KEY ASSUMPTIONS',
    `- Forecast horizon: ${payload.years} years.`,
    `- Revenue growth path: ${payload.assumptions.revenueGrowth.map((value) => `${(value * 100).toFixed(1)}%`).join(', ')}.`,
    `- EBIT margin path: ${payload.assumptions.ebitMargin.map((value) => `${(value * 100).toFixed(1)}%`).join(', ')}.`,
    `- WACC / terminal growth: ${(payload.assumptions.wacc * 100).toFixed(1)}% / ${(payload.assumptions.terminalGrowth * 100).toFixed(1)}%.`,
    ...comparisonSection,
    '',
    'INVESTMENT MEMO',
    payload.memo,
  ].join('\n');
}

function normalizeAssumptionLength(assumptions: AnalystDcfAssumptions, years: number): DeterministicAssumptions {
  const expandSeries = (series: number[]) => {
    if (series.length === years) return series;
    if (series.length > years) return series.slice(0, years);
    const fill = series[series.length - 1] ?? 0;
    return [...series, ...Array.from({ length: years - series.length }, () => fill)];
  };

  return {
    ...assumptions,
    revenueGrowth: expandSeries(assumptions.revenueGrowth),
    ebitMargin: expandSeries(assumptions.ebitMargin),
    notes: [],
  };
}

function parseDcfOverrideValue(raw: string, typeHint: 'percent' | 'number' | 'text'): string | number | undefined {
  const cleaned = raw.trim().replace(/[.,]+$/, '');
  if (!cleaned) return undefined;
  if (typeHint === 'text') return cleaned;

  const normalizedPercentWords = cleaned.replace(/\bpercent(age)?\b/gi, '%');
  const compact = normalizedPercentWords.replace(/,/g, '').replace(/\$/g, '').trim();
  const match = compact.match(/^(-?\d*\.?\d+)\s*(%)?$/i);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return undefined;
  if (typeHint === 'percent' || match[2]) return parsed > 1 ? parsed / 100 : parsed;
  return parsed;
}

function parseScenarioDeltaValue(rawValue: string, rawUnit: string | undefined): number | undefined {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return undefined;
  const unit = (rawUnit ?? '').toLowerCase();
  if (/\b(bp|bps|basis\s+points?)\b/.test(unit)) return parsed / 10000;
  return parsed > 1 ? parsed / 100 : parsed;
}

function directionSign(rawDirection: string): 1 | -1 {
  return /\b(down|decrease|decreases|decreased|decline|declines|declined|drop|drops|dropped|fall|falls|fell|lower|compress|compresses|compressed|compression)\b/i.test(rawDirection)
    ? -1
    : 1;
}

function extractScenarioDelta(prompt: string, aliases: string[]): number | null {
  for (const alias of aliases) {
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const patterns = [
      new RegExp(`\\b${escapedAlias}\\b\\s+(up|increase[sd]?|rise[sn]?|rose|higher|down|decrease[sd]?|decline[sd]?|drop(?:ped|s)?|fall(?:s|en)?|fell|lower|compress(?:es|ed)?|compression)\\s+(?:by\\s+)?(-?\\d*\\.?\\d+)\\s*(bps?|basis\\s+points?|%)?`, 'i'),
      new RegExp(`(up|increase[sd]?|rise[sn]?|rose|higher|down|decrease[sd]?|decline[sd]?|drop(?:ped|s)?|fall(?:s|en)?|fell|lower)\\s+(?:by\\s+)?(-?\\d*\\.?\\d+)\\s*(bps?|basis\\s+points?|%)?\\s+(?:in\\s+)?\\b${escapedAlias}\\b`, 'i'),
      new RegExp(`\\b${escapedAlias}\\b\\s+(?:compression|compress(?:es|ed)?)\\s+(?:of\\s+)?(-?\\d*\\.?\\d+)\\s*(bps?|basis\\s+points?|%)?`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (!match) continue;
      const rawDirection = match.length === 4 ? match[1] : 'down';
      const rawValue = match.length === 4 ? match[2] : match[1];
      const rawUnit = match.length === 4 ? match[3] : match[2];
      const parsed = parseScenarioDeltaValue(rawValue, rawUnit);
      if (typeof parsed === 'number') return directionSign(rawDirection) * Math.abs(parsed);
    }
  }

  return null;
}

function extractDcfOverrides(prompt: string, payload: AnalystDcfDemoPayload): {
  companyName?: string;
  years?: number;
  assumptions?: Partial<DeterministicAssumptions>;
} {
  const overrides: {
    companyName?: string;
    years?: number;
    assumptions?: Partial<DeterministicAssumptions>;
  } = {};

  const assumptionOverrides: Partial<DeterministicAssumptions> = {};
  const renameMatch = prompt.match(/(?:rename|change|update|adjust|make|set)(?:\s+the)?\s+name\s+(?:to|as)?\s+([A-Za-z0-9.&' -]+)/i)
    || prompt.match(/company name\s+(?:to|as)\s+([A-Za-z0-9.&' -]+)/i);
  if (renameMatch?.[1]) {
    overrides.companyName = renameMatch[1].trim().replace(/[.,]+$/, '');
  }

  const yearsMatch = prompt.match(/(?:set|make|change|adjust|update)\s+(?:the\s+)?(?:forecast\s+)?years?\s+(?:to\s+)?(\d{1,2})/i);
  if (yearsMatch?.[1]) {
    overrides.years = clamp(Number(yearsMatch[1]), 3, 10);
  }

  const scalarPatterns: Array<{
    key: 'wacc' | 'terminalGrowth' | 'taxRate' | 'daPctRevenue' | 'capexPctRevenue' | 'nwcPctRevenue';
    aliases: string[];
    type: 'percent' | 'number';
  }> = [
    { key: 'wacc', aliases: ['wacc'], type: 'percent' },
    { key: 'terminalGrowth', aliases: ['terminal growth', 'terminal g'], type: 'percent' },
    { key: 'taxRate', aliases: ['tax rate'], type: 'percent' },
    { key: 'daPctRevenue', aliases: ['d&a', 'depreciation', 'amortization'], type: 'percent' },
    { key: 'capexPctRevenue', aliases: ['capex', 'capex percent'], type: 'percent' },
    { key: 'nwcPctRevenue', aliases: ['nwc', 'working capital'], type: 'percent' },
  ];

  for (const { key, aliases, type } of scalarPatterns) {
    for (const alias of aliases) {
      const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const patterns = [
        new RegExp(`(?:set|make|change|adjust|update)\\s+(?:the\\s+)?${escapedAlias}\\s+(?:to\\s+)?([^,.;\\n]+)`, 'i'),
        new RegExp(`${escapedAlias}\\s+(?:to\\s+)?([^,.;\\n]+)`, 'i'),
      ];
      for (const pattern of patterns) {
        const match = prompt.match(pattern);
        const parsed = parseDcfOverrideValue(match?.[1] ?? '', type);
        if (typeof parsed === 'number') {
          assumptionOverrides[key] = parsed;
          break;
        }
      }
      if (key in assumptionOverrides) break;
    }
  }

  const waccDelta = extractScenarioDelta(prompt, ['wacc', 'discount rate', 'rates', 'interest rates']);
  if (typeof waccDelta === 'number') {
    assumptionOverrides.wacc = Number(clamp(payload.assumptions.wacc + waccDelta, 0.06, 0.16).toFixed(4));
  }

  const terminalGrowthDelta = extractScenarioDelta(prompt, ['terminal growth', 'terminal g']);
  if (typeof terminalGrowthDelta === 'number') {
    assumptionOverrides.terminalGrowth = Number(clamp(payload.assumptions.terminalGrowth + terminalGrowthDelta, 0.01, 0.04).toFixed(4));
  }

  const revenueGrowthDelta = extractScenarioDelta(prompt, ['revenue growth', 'growth']);
  if (typeof revenueGrowthDelta === 'number') {
    assumptionOverrides.revenueGrowth = applySeriesDelta(payload.assumptions.revenueGrowth, revenueGrowthDelta, -0.05, 0.25);
  }

  const ebitMarginDelta = extractScenarioDelta(prompt, ['ebit margin', 'operating margin', 'margin', 'margins']);
  if (typeof ebitMarginDelta === 'number') {
    assumptionOverrides.ebitMargin = applySeriesDelta(payload.assumptions.ebitMargin, ebitMarginDelta, 0.05, 0.5);
  }

  const seriesPatterns: Array<{ key: 'revenueGrowth' | 'ebitMargin'; aliases: string[] }> = [
    { key: 'revenueGrowth', aliases: ['revenue growth', 'growth'] },
    { key: 'ebitMargin', aliases: ['ebit margin', 'operating margin'] },
  ];

  for (const { key, aliases } of seriesPatterns) {
    for (const alias of aliases) {
      const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const yearMatch = prompt.match(new RegExp(`(?:year|yr)\\s*(\\d+)\\s+${escapedAlias}\\s+(?:to\\s+)?([^,.;\\n]+)`, 'i'));
      if (yearMatch?.[1] && yearMatch?.[2]) {
        const yearIndex = Number(yearMatch[1]) - 1;
        if (Number.isInteger(yearIndex) && yearIndex >= 0 && yearIndex < payload.assumptions[key].length) {
          const nextValue = parseDcfOverrideValue(yearMatch[2], 'percent');
          if (typeof nextValue === 'number') {
            assumptionOverrides[key] = payload.assumptions[key].map((value, index) => (index === yearIndex ? nextValue : value));
            break;
          }
        }
      }

      const fullSeriesMatch = prompt.match(new RegExp(`(?:set|make|change|adjust|update)\\s+(?:the\\s+)?${escapedAlias}\\s+(?:to\\s+)?([^.;\\n]+)`, 'i'))
        || prompt.match(new RegExp(`${escapedAlias}\\s+(?:to\\s+)?([^.;\\n]+)`, 'i'));
      if (fullSeriesMatch?.[1]) {
        const parts = fullSeriesMatch[1].split(/[\\/,]/).map((part) => part.trim()).filter(Boolean);
        const parsed = parts
          .map((part) => parseDcfOverrideValue(part, 'percent'))
          .filter((value): value is number => typeof value === 'number');
        if (parsed.length > 1) {
          assumptionOverrides[key] = parsed.slice(0, payload.assumptions[key].length);
          break;
        }
        if (parsed.length === 1) {
          assumptionOverrides[key] = payload.assumptions[key].map(() => parsed[0]);
          break;
        }
      }
    }
  }

  if (Object.keys(assumptionOverrides).length > 0) {
    overrides.assumptions = assumptionOverrides;
  }

  return overrides;
}

async function buildAnalystDcfDemoFromPayload(params: {
  prompt: string;
  ticker: string;
  companyName: string;
  sector: string | null;
  source: string;
  asOfDate: string | null;
  years: number;
  baseMetrics: AnalystDcfBaseMetrics;
  assumptions: DeterministicAssumptions;
  warnings: string[];
  comparison?: AnalystDcfComparisonPayload | null;
  includeMemo?: boolean;
}): Promise<{ reply: string; payload: AnalystDcfDemoPayload }> {
  const currentEbitMargin = clamp(
    params.assumptions.ebitMargin[0] ?? ((params.baseMetrics.revenueLtm > 0 && params.baseMetrics.ebitdaLtm > 0)
      ? (params.baseMetrics.ebitdaLtm / params.baseMetrics.revenueLtm) - params.assumptions.daPctRevenue
      : 0.2),
    0.08,
    0.4
  );

  const scenarioResults = {
    base: null as AnalystDcfScenarioResult | null,
    bull: null as AnalystDcfScenarioResult | null,
    bear: null as AnalystDcfScenarioResult | null,
  };
  let forecast: AnalystDcfDemoPayload['forecast'] = [];

  for (const key of ['base', 'bull', 'bear'] as const) {
    const scenarioAssumptions = buildScenarioAssumptions(params.assumptions, key);
    const spec = buildDcfSpec({
      years: params.years,
      startYear: new Date().getUTCFullYear(),
      ticker: params.ticker,
      companyName: params.companyName,
      revenueLtm: params.baseMetrics.revenueLtm,
      currentEbitMargin,
      assumptions: scenarioAssumptions,
    });

    const evaluated = evaluateScenario({
      key,
      spec,
      netDebt: params.baseMetrics.netDebt,
      sharesOutstanding: params.baseMetrics.sharesOutstanding,
      marketPrice: params.baseMetrics.sharePrice,
    });
    scenarioResults[key] = evaluated.scenario;
    if (key === 'base') forecast = evaluated.forecast;
  }

  const payload: AnalystDcfDemoPayload = {
    prompt: params.prompt,
    ticker: params.ticker,
    companyName: params.companyName,
    sector: params.sector,
    currency: 'USD',
    years: params.years,
    source: params.source,
    asOfDate: params.asOfDate,
    memo: '',
    warnings: params.warnings,
    notes: params.assumptions.notes,
    baseMetrics: params.baseMetrics,
    assumptions: {
      revenueGrowth: params.assumptions.revenueGrowth,
      ebitMargin: params.assumptions.ebitMargin,
      taxRate: params.assumptions.taxRate,
      daPctRevenue: params.assumptions.daPctRevenue,
      capexPctRevenue: params.assumptions.capexPctRevenue,
      nwcPctRevenue: params.assumptions.nwcPctRevenue,
      wacc: params.assumptions.wacc,
      terminalGrowth: params.assumptions.terminalGrowth,
    },
    forecast,
    scenarios: {
      base: scenarioResults.base as AnalystDcfScenarioResult,
      bull: scenarioResults.bull as AnalystDcfScenarioResult,
      bear: scenarioResults.bear as AnalystDcfScenarioResult,
    },
    comparison: params.comparison ?? null,
  };

  if (payload.comparison) {
    payload.notes = [...payload.notes, ...buildComparisonNotes(payload, payload.comparison)].slice(0, 6);
  }
  payload.memo = params.includeMemo === false
    ? buildDeterministicMemo(payload)
    : (await generateAiMemo(payload, getOpenAIKeyCandidates('user'))) ?? buildDeterministicMemo(payload);

  return {
    reply: buildReply(payload),
    payload,
  };
}

export async function reviseAnalystDcfDemo(
  prompt: string,
  existingPayload: AnalystDcfDemoPayload,
): Promise<{ reply: string; payload: AnalystDcfDemoPayload } | null> {
  const overrides = extractDcfOverrides(prompt, existingPayload);
  if (!overrides.companyName && !overrides.years && !overrides.assumptions) return null;

  const assumptions: DeterministicAssumptions = {
    ...existingPayload.assumptions,
    ...(overrides.assumptions ?? {}),
    revenueGrowth: overrides.assumptions?.revenueGrowth ?? existingPayload.assumptions.revenueGrowth,
    ebitMargin: overrides.assumptions?.ebitMargin ?? existingPayload.assumptions.ebitMargin,
    notes: [
      ...existingPayload.notes,
      'Updated from an Analyst Chat follow-up adjustment.',
    ].slice(0, 4),
  };

  let comparison = existingPayload.comparison ?? null;
  if (comparison) {
    const normalizedComparisonAssumptions = normalizeAssumptionLength(comparison.assumptions, overrides.years ?? existingPayload.years);
    const rebuiltComparison = await buildAnalystDcfDemoFromPayload({
      prompt,
      ticker: comparison.ticker,
      companyName: comparison.companyName,
      sector: comparison.sector,
      source: comparison.source,
      asOfDate: comparison.asOfDate,
      years: overrides.years ?? existingPayload.years,
      baseMetrics: comparison.baseMetrics,
      assumptions: {
        ...normalizedComparisonAssumptions,
        notes: comparison.notes,
      },
      warnings: [],
      comparison: null,
      includeMemo: false,
    });
    comparison = {
      ticker: rebuiltComparison.payload.ticker,
      companyName: rebuiltComparison.payload.companyName,
      sector: rebuiltComparison.payload.sector,
      source: rebuiltComparison.payload.source,
      asOfDate: rebuiltComparison.payload.asOfDate,
      notes: rebuiltComparison.payload.notes,
      baseMetrics: rebuiltComparison.payload.baseMetrics,
      assumptions: rebuiltComparison.payload.assumptions,
      scenarios: rebuiltComparison.payload.scenarios,
    };
  }

  return buildAnalystDcfDemoFromPayload({
    prompt,
    ticker: existingPayload.ticker,
    companyName: overrides.companyName ?? existingPayload.companyName,
    sector: existingPayload.sector,
    source: existingPayload.source,
    asOfDate: existingPayload.asOfDate,
    years: overrides.years ?? existingPayload.years,
    baseMetrics: existingPayload.baseMetrics,
    assumptions,
    warnings: existingPayload.warnings,
    comparison,
  });
}

export async function reviseAnalystDcfDemoFromAdjustment(
  adjustment: AnalystDcfAdjustment,
  existingPayload: AnalystDcfDemoPayload,
): Promise<{ reply: string; payload: AnalystDcfDemoPayload } | null> {
  const hasAdjustment =
    (Array.isArray(adjustment.revenueGrowth) && adjustment.revenueGrowth.length > 0) ||
    (Array.isArray(adjustment.ebitMargin) && adjustment.ebitMargin.length > 0) ||
    typeof adjustment.wacc === 'number' ||
    typeof adjustment.terminalGrowth === 'number';
  if (!hasAdjustment) return null;

  const nextYears = existingPayload.years;
  const assumptions: DeterministicAssumptions = {
    ...existingPayload.assumptions,
    revenueGrowth:
      Array.isArray(adjustment.revenueGrowth) && adjustment.revenueGrowth.length === nextYears
        ? adjustment.revenueGrowth.map((value) => clamp(value, -0.05, 0.25))
        : existingPayload.assumptions.revenueGrowth,
    ebitMargin:
      Array.isArray(adjustment.ebitMargin) && adjustment.ebitMargin.length === nextYears
        ? adjustment.ebitMargin.map((value) => clamp(value, 0.05, 0.5))
        : existingPayload.assumptions.ebitMargin,
    wacc:
      typeof adjustment.wacc === 'number' ? clamp(adjustment.wacc, 0.06, 0.16) : existingPayload.assumptions.wacc,
    terminalGrowth:
      typeof adjustment.terminalGrowth === 'number'
        ? clamp(adjustment.terminalGrowth, 0.01, 0.04)
        : existingPayload.assumptions.terminalGrowth,
    notes: [
      ...existingPayload.notes,
      'Updated from Analyst Chat scenario controls.',
    ].slice(0, 4),
  };

  let comparison = existingPayload.comparison ?? null;
  if (comparison) {
    const normalizedComparisonAssumptions = normalizeAssumptionLength(comparison.assumptions, nextYears);
    const rebuiltComparison = await buildAnalystDcfDemoFromPayload({
      prompt: existingPayload.prompt,
      ticker: comparison.ticker,
      companyName: comparison.companyName,
      sector: comparison.sector,
      source: comparison.source,
      asOfDate: comparison.asOfDate,
      years: nextYears,
      baseMetrics: comparison.baseMetrics,
      assumptions: {
        ...normalizedComparisonAssumptions,
        notes: comparison.notes,
      },
      warnings: [],
      comparison: null,
      includeMemo: false,
    });
    comparison = {
      ticker: rebuiltComparison.payload.ticker,
      companyName: rebuiltComparison.payload.companyName,
      sector: rebuiltComparison.payload.sector,
      source: rebuiltComparison.payload.source,
      asOfDate: rebuiltComparison.payload.asOfDate,
      notes: rebuiltComparison.payload.notes,
      baseMetrics: rebuiltComparison.payload.baseMetrics,
      assumptions: rebuiltComparison.payload.assumptions,
      scenarios: rebuiltComparison.payload.scenarios,
    };
  }

  return buildAnalystDcfDemoFromPayload({
    prompt: existingPayload.prompt,
    ticker: existingPayload.ticker,
    companyName: existingPayload.companyName,
    sector: existingPayload.sector,
    source: existingPayload.source,
    asOfDate: existingPayload.asOfDate,
    years: nextYears,
    baseMetrics: existingPayload.baseMetrics,
    assumptions,
    warnings: existingPayload.warnings,
    comparison,
  });
}

export async function reviseAnalystDcfDemoFromEventShock(
  prompt: string,
  existingPayload: AnalystDcfDemoPayload,
): Promise<{ reply: string; payload: AnalystDcfDemoPayload } | null> {
  const shock = inferEventShock(prompt, existingPayload);
  if (!shock) return null;

  const assumptions: DeterministicAssumptions = {
    ...existingPayload.assumptions,
    ...shock.assumptions,
    revenueGrowth: shock.assumptions.revenueGrowth ?? existingPayload.assumptions.revenueGrowth,
    ebitMargin: shock.assumptions.ebitMargin ?? existingPayload.assumptions.ebitMargin,
    notes: [...existingPayload.notes, ...shock.notes].slice(0, 5),
  };

  let comparison = existingPayload.comparison ?? null;
  if (comparison) {
    const normalizedComparisonAssumptions = normalizeAssumptionLength(comparison.assumptions, existingPayload.years);
    const rebuiltComparison = await buildAnalystDcfDemoFromPayload({
      prompt: existingPayload.prompt,
      ticker: comparison.ticker,
      companyName: comparison.companyName,
      sector: comparison.sector,
      source: comparison.source,
      asOfDate: comparison.asOfDate,
      years: existingPayload.years,
      baseMetrics: comparison.baseMetrics,
      assumptions: {
        ...normalizedComparisonAssumptions,
        notes: comparison.notes,
      },
      warnings: [],
      comparison: null,
      includeMemo: false,
    });
    comparison = {
      ticker: rebuiltComparison.payload.ticker,
      companyName: rebuiltComparison.payload.companyName,
      sector: rebuiltComparison.payload.sector,
      source: rebuiltComparison.payload.source,
      asOfDate: rebuiltComparison.payload.asOfDate,
      notes: rebuiltComparison.payload.notes,
      baseMetrics: rebuiltComparison.payload.baseMetrics,
      assumptions: rebuiltComparison.payload.assumptions,
      scenarios: rebuiltComparison.payload.scenarios,
    };
  }

  const rebuilt = await buildAnalystDcfDemoFromPayload({
    prompt: existingPayload.prompt,
    ticker: existingPayload.ticker,
    companyName: existingPayload.companyName,
    sector: existingPayload.sector,
    source: existingPayload.source,
    asOfDate: existingPayload.asOfDate,
    years: existingPayload.years,
    baseMetrics: existingPayload.baseMetrics,
    assumptions,
    warnings: existingPayload.warnings,
    comparison,
  });

  return {
    reply: `Applied a ${shock.label} to the active DCF. The model now reflects the revised growth, margin, and valuation assumptions for that event path.\n\n${rebuilt.reply}`,
    payload: rebuilt.payload,
  };
}

export async function generateAnalystDcfDemo(params: {
  prompt: string;
  explicitTicker?: string;
  attachmentStatementSnapshot?: AttachmentStatementSnapshot | null;
}): Promise<{
  reply: string;
  payload: AnalystDcfDemoPayload;
}> {
  const snapshots = await loadDemoSnapshots();
  const comparisonPair = resolveComparisonPairFromPrompt(params.prompt, params.explicitTicker, snapshots);
  const resolved = comparisonPair
    ? await hydrateResolvedCompany(comparisonPair.primary)
    : await resolveCompanyForDcf(params.prompt, params.explicitTicker);
  const attachmentResolved = params.attachmentStatementSnapshot
    ? buildResolvedCompanyFromAttachment(params.attachmentStatementSnapshot)
    : null;
  const effectiveResolved = attachmentResolved ?? resolved;

  if (!effectiveResolved?.snapshot) {
    throw new Error('No matching company profile was found for this prompt.');
  }

  const parsed = parseDcfPrompt(params.prompt, effectiveResolved.ticker);
  const snapshot = effectiveResolved.snapshot;
  const companyName = snapshot.companyName || effectiveResolved.ticker;
  const revenueLtm = snapshot.revenueLtm ?? 0;
  if (!(revenueLtm > 0)) {
    throw new Error(`Cached demo financials for ${effectiveResolved.ticker} are incomplete.`);
  }

  const ebitdaLtm = snapshot.ebitdaLtm ?? 0;
  const netIncomeLtm = snapshot.netIncomeLtm ?? 0;
  const cash = snapshot.cash ?? 0;
  const totalDebt = snapshot.totalDebt ?? 0;
  const netDebt = totalDebt - cash;
  const sharesOutstanding = typeof snapshot.sharesOutstanding === 'number' && snapshot.sharesOutstanding > 0
    ? snapshot.sharesOutstanding
    : null;
  const sharePrice = typeof snapshot.sharePrice === 'number' && snapshot.sharePrice > 0 ? snapshot.sharePrice : null;
  const marketCap = typeof snapshot.marketCap === 'number' && snapshot.marketCap > 0 ? snapshot.marketCap : null;
  const ebitdaMargin = revenueLtm > 0 && ebitdaLtm > 0 ? ebitdaLtm / revenueLtm : null;

  const defaultAssumptions = buildDeterministicAssumptions(snapshot, parsed);
  const aiPatch = await generateAiAssumptionPatch({
    prompt: params.prompt,
    companyName,
    ticker: effectiveResolved.ticker,
    sector: snapshot.sector ?? null,
    revenueLtm,
    ebitdaMargin,
    years: parsed.years,
    defaults: defaultAssumptions,
    apiKeys: getOpenAIKeyCandidates('user'),
  });
  const assumptions = mergeAssumptions(defaultAssumptions, aiPatch ?? {}, parsed.years);

  let comparison: AnalystDcfComparisonPayload | null = null;
  if (comparisonPair) {
    const comparisonResolved = await hydrateResolvedCompany(comparisonPair.comparison);
    const comparisonSnapshot = comparisonResolved.snapshot;
    const comparisonBaseMetrics = buildBaseMetrics(comparisonSnapshot);
    if (comparisonBaseMetrics.revenueLtm > 0) {
      const comparisonAssumptions = buildDeterministicAssumptions(comparisonSnapshot, parsed);
      const comparisonPayload = await buildAnalystDcfDemoFromPayload({
        prompt: params.prompt,
        ticker: comparisonResolved.ticker,
        companyName: comparisonSnapshot.companyName || comparisonResolved.ticker,
        sector: comparisonSnapshot.sector ?? null,
        source: comparisonResolved.source,
        asOfDate: comparisonResolved.asOfDate ?? comparisonSnapshot.updatedAt ?? null,
        years: parsed.years,
        baseMetrics: comparisonBaseMetrics,
        assumptions: comparisonAssumptions,
        warnings: [],
        comparison: null,
        includeMemo: false,
      });

      comparison = {
        ticker: comparisonPayload.payload.ticker,
        companyName: comparisonPayload.payload.companyName,
        sector: comparisonPayload.payload.sector,
        source: comparisonPayload.payload.source,
        asOfDate: comparisonPayload.payload.asOfDate,
        notes: comparisonPayload.payload.notes,
        baseMetrics: comparisonPayload.payload.baseMetrics,
        assumptions: comparisonPayload.payload.assumptions,
        scenarios: comparisonPayload.payload.scenarios,
      };
    }
  }

  return buildAnalystDcfDemoFromPayload({
    prompt: params.prompt,
    ticker: effectiveResolved.ticker,
    companyName,
    sector: snapshot.sector ?? null,
    source: effectiveResolved.source,
    asOfDate: effectiveResolved.asOfDate ?? snapshot.updatedAt ?? null,
    years: parsed.years,
    baseMetrics: {
      revenueLtm,
      ebitdaLtm,
      netIncomeLtm,
      cash,
      totalDebt,
      netDebt,
      sharesOutstanding,
      sharePrice,
      marketCap,
    },
    assumptions,
    warnings: [
      ...(sharePrice === null ? ['Cached share price unavailable; upside/downside may be blank.'] : []),
      ...(sharesOutstanding === null ? ['Cached shares outstanding unavailable; implied share price may be blank.'] : []),
    ],
    comparison,
  });
}
