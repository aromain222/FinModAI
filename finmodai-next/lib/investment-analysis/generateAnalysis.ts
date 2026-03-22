import { extractCompanyQuery } from '@/lib/data/company/extractCompanyQuery';
import { resolveCompanyProfile } from '@/lib/data/company/resolveCompanyProfile';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';
import {
  createInvestmentAnalysisDocument,
} from '@/lib/investment-analysis/workspaceState';
import {
  INVESTMENT_MEMO_REFRESH_SYSTEM_PROMPT,
  INVESTMENT_MEMO_SYSTEM_PROMPT,
} from '@/lib/investment-analysis/memoPrompts';
import {
  buildInitialInvestmentMemoPayload,
  buildInvestmentMemoRefreshPayload,
} from '@/lib/investment-analysis/memoPayloads';
import type {
  DeterministicValuationAssumptions,
  InvestmentAnalysisDocument,
  InvestmentCompanyMetadata,
  InvestmentMemoSections,
  InvestmentScenarioKey,
} from '@/lib/investment-analysis/types';
import type { ResolvedCompanyProfile } from '@/lib/data/company/types';

function clamp(value: number, floor: number, ceiling: number): number {
  return Math.min(ceiling, Math.max(floor, value));
}

function normalizePrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, ' ');
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  const slice = first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed;
  return JSON.parse(slice);
}

function buildFallbackMemo(document: InvestmentAnalysisDocument, scenarioKey: InvestmentScenarioKey): InvestmentMemoSections {
  const scenario = document.scenarios[scenarioKey];
  const valuation = scenario.result.valuation;
  const firstYear = scenario.result.forecast[0];
  const lastYear = scenario.result.forecast[scenario.result.forecast.length - 1];
  const perShare =
    typeof valuation.impliedPerShareValue === 'number'
      ? `$${valuation.impliedPerShareValue.toFixed(2)} per share`
      : `$${valuation.equityValue.toLocaleString('en-US')} million of equity value`;

  return {
    summary: `${document.company.companyName} is framed through a ${scenario.label.toLowerCase()} valuation case with ${perShare} implied by the current assumptions.`,
    whyItMatters: `The model is driven by revenue growth stepping from ${(scenario.assumptions.revenueGrowthByYear[0] * 100).toFixed(1)}% to ${(scenario.assumptions.revenueGrowthByYear[scenario.assumptions.revenueGrowthByYear.length - 1] * 100).toFixed(1)}% and operating margin moving from ${(scenario.assumptions.operatingMarginByYear[0] * 100).toFixed(1)}% to ${(scenario.assumptions.operatingMarginByYear[scenario.assumptions.operatingMarginByYear.length - 1] * 100).toFixed(1)}%.`,
    analysis: `This is mainly a cash flow and discounting story. Revenue rises from $${firstYear.revenue.toLocaleString('en-US')} million in year ${firstYear.year} to $${lastYear.revenue.toLocaleString('en-US')} million by year ${lastYear.year}, while WACC and terminal growth of ${(scenario.assumptions.wacc * 100).toFixed(1)}% and ${(scenario.assumptions.terminalGrowthRate * 100).toFixed(1)}% determine how much of that operating profile converts into valuation support.`,
    updatedAt: new Date().toISOString(),
  };
}

function defaultGrowthCurve(years: number, sector: string | null, revenueLtm: number): number[] {
  const normalizedSector = String(sector ?? '').toLowerCase();
  let first = 0.09;
  let last = 0.04;

  if (/(software|internet|technology|communication)/.test(normalizedSector)) {
    first = 0.11;
    last = 0.05;
  } else if (/(consumer|retail)/.test(normalizedSector)) {
    first = 0.07;
    last = 0.035;
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

  return Array.from({ length: years }, (_, index) => {
    const progress = index / Math.max(years - 1, 1);
    const value = first + (last - first) * progress;
    return Number(clamp(value, 0.01, 0.18).toFixed(4));
  });
}

function defaultMarginCurve(years: number, baseMargin: number): number[] {
  const terminal = clamp(baseMargin + 0.005, 0.08, 0.42);
  return Array.from({ length: years }, (_, index) => {
    const progress = index / Math.max(years - 1, 1);
    const value = baseMargin + (terminal - baseMargin) * progress;
    return Number(clamp(value, 0.08, 0.45).toFixed(4));
  });
}

function buildCompanyMetadata(profile: ResolvedCompanyProfile): InvestmentCompanyMetadata {
  return {
    ticker: profile.company.ticker,
    companyName: profile.company.name,
    sector: profile.company.sector,
    industry: profile.company.industry,
    currency: profile.snapshot?.currency ?? 'USD',
    asOfDate: profile.snapshot?.asOfDate ?? profile.latestPrice?.date ?? null,
  };
}

function buildBaseAssumptions(profile: ResolvedCompanyProfile): DeterministicValuationAssumptions {
  // Initial seeding is deterministic by design:
  // company snapshot -> normalized DCF assumptions -> workspace document.
  // Claude only writes the memo after the model state exists.
  const snapshot = profile.snapshot;
  if (!snapshot?.revenueLtm || snapshot.revenueLtm <= 0) {
    throw new Error('Structured company revenue is missing for this analysis.');
  }

  const revenueLtm = snapshot.revenueLtm;
  const normalizedSector = String(profile.company.sector ?? '').toLowerCase();
  const years = 5;
  const daPctRevenue = /(software|internet|technology|communication)/.test(normalizedSector) ? 0.025 : 0.03;

  const ebitMarginFromEbit = snapshot.ebitLtm && revenueLtm > 0 ? snapshot.ebitLtm / revenueLtm : null;
  const ebitMarginFromEbitda =
    snapshot.ebitdaLtm && revenueLtm > 0 ? (snapshot.ebitdaLtm / revenueLtm) - daPctRevenue : null;
  const baseOperatingMargin = clamp(ebitMarginFromEbit ?? ebitMarginFromEbitda ?? 0.22, 0.08, 0.4);

  const taxRate = /(financial|bank|insurance)/.test(normalizedSector) ? 0.23 : 0.21;
  const capexPctRevenue = /(software|internet|technology|communication)/.test(normalizedSector) ? 0.035 : 0.045;
  const nwcChangePctRevenue = /(software|internet|technology|communication)/.test(normalizedSector) ? 0.01 : 0.015;
  const wacc = /(software|internet|technology|communication)/.test(normalizedSector) ? 0.09 : 0.1;
  const terminalGrowthRate = /(software|internet|technology|communication)/.test(normalizedSector) ? 0.03 : 0.025;

  return {
    baseRevenue: revenueLtm,
    revenueGrowthByYear: defaultGrowthCurve(years, profile.company.sector, revenueLtm),
    operatingMarginByYear: defaultMarginCurve(years, baseOperatingMargin),
    taxRate,
    capexPctRevenue,
    nwcChangePctRevenue,
    wacc,
    terminalGrowthRate,
    shareCount: snapshot.sharesOutstanding ?? null,
    netDebt: (snapshot.totalDebt ?? 0) - (snapshot.cash ?? 0),
  };
}

async function generateMemoFromStructuredPayload(args: {
  systemPrompt: string;
  payload: Record<string, unknown>;
  fallback: InvestmentMemoSections;
}): Promise<InvestmentMemoSections> {
  try {
    const result = await generateTextWithProviderFallback({
      preferredProvider: 'anthropic',
      clientType: 'service',
      temperature: 0.15,
      maxTokens: 900,
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: JSON.stringify(args.payload, null, 2) },
      ],
    });

    const parsed = extractJsonObject(result?.text ?? '') as Partial<InvestmentMemoSections>;
    if (
      parsed &&
      typeof parsed.summary === 'string' &&
      typeof parsed.whyItMatters === 'string' &&
      typeof parsed.analysis === 'string'
    ) {
      return {
        summary: parsed.summary.trim(),
        whyItMatters: parsed.whyItMatters.trim(),
        analysis: parsed.analysis.trim(),
        updatedAt: new Date().toISOString(),
      };
    }
  } catch {
    // fall through to deterministic fallback memo
  }

  return args.fallback;
}

export async function generateInvestmentAnalysisFromPrompt(prompt: string): Promise<InvestmentAnalysisDocument> {
  const normalizedPrompt = normalizePrompt(prompt);
  if (!normalizedPrompt) {
    throw new Error('Prompt is required.');
  }

  const companyQuery = extractCompanyQuery({ prompt: normalizedPrompt });
  if (!companyQuery.ticker && !companyQuery.companyName) {
    throw new Error('Could not identify the company to analyze.');
  }

  const profile = await resolveCompanyProfile({ prompt: normalizedPrompt });
  if (!profile?.snapshot) {
    throw new Error('No structured company snapshot was available for this analysis.');
  }

  const document = createInvestmentAnalysisDocument({
    company: buildCompanyMetadata(profile),
    assumptions: buildBaseAssumptions(profile),
    memo: {
      summary: 'Generating memo…',
      whyItMatters: 'Generating memo…',
      analysis: 'Generating memo…',
      updatedAt: null,
    },
  });

  const fallbackMemo = buildFallbackMemo(document, 'base');
  const memo = await generateMemoFromStructuredPayload({
    systemPrompt: INVESTMENT_MEMO_SYSTEM_PROMPT,
    payload: buildInitialInvestmentMemoPayload(document),
    fallback: fallbackMemo,
  });

  return {
    ...document,
    memo,
  };
}

export async function refreshInvestmentMemo(args: {
  document: InvestmentAnalysisDocument;
  activeScenario: InvestmentScenarioKey;
}): Promise<InvestmentMemoSections> {
  const fallbackMemo = buildFallbackMemo(args.document, args.activeScenario);
  return generateMemoFromStructuredPayload({
    systemPrompt: INVESTMENT_MEMO_REFRESH_SYSTEM_PROMPT,
    payload: buildInvestmentMemoRefreshPayload({
      document: args.document,
      activeScenario: args.activeScenario,
      previousMemo: args.document.memo,
    }),
    fallback: fallbackMemo,
  });
}
