import { extractCompanyQuery } from '@/lib/data/company/extractCompanyQuery';
import { resolveCompanyProfile } from '@/lib/data/company/resolveCompanyProfile';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';
import { applyEventAssumptionDeltas } from '@/lib/investment-analysis/eventAssumptionApplication';
import { deriveEventAwareAssumptionDeltas } from '@/lib/investment-analysis/eventAssumptions';
import { classifyInvestmentEvent } from '@/lib/investment-analysis/eventClassifier';
import {
  createInvestmentAnalysisDocument,
} from '@/lib/investment-analysis/workspaceState';
import {
  INVESTMENT_EVENT_UPDATE_SUMMARY_SYSTEM_PROMPT,
  INVESTMENT_EVENT_SUMMARY_SYSTEM_PROMPT,
  INVESTMENT_MEMO_REFRESH_SYSTEM_PROMPT,
  INVESTMENT_MEMO_SYSTEM_PROMPT,
} from '@/lib/investment-analysis/memoPrompts';
import {
  buildEventAwareDeltaSummaryPayload,
  buildEventAwareInvestmentMemoPayload,
  buildInitialInvestmentMemoPayload,
  buildInvestmentMemoRefreshPayload,
} from '@/lib/investment-analysis/memoPayloads';
import { refreshInvestmentAnalysisModel } from '@/lib/investment-analysis/modelRefresh';
import { parseInvestmentPromptContext } from '@/lib/investment-analysis/promptParser';
import type {
  DeterministicValuationAssumptions,
  InvestmentAnalysisDocument,
  InvestmentAnalysisGenerationResult,
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

type EventAwareSummaryPayload = {
  executiveSummary?: string;
  investmentView?: string;
  whyEventMatters?: string;
  keyRisks?: string[];
  scenarioCommentary?: {
    bull?: string;
    base?: string;
    bear?: string;
  };
};

type EventAwareUpdateSummary = {
  whatChanged?: string;
  whyItChanged?: string;
  valuationMove?: string;
  whatMattersNow?: string;
};

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

    const parsed = extractJsonObject(result?.text ?? '');
    const normalized = normalizeGeneratedMemoPayload(parsed);
    if (normalized) return normalized;
  } catch {
    // fall through to deterministic fallback memo
  }

  return args.fallback;
}

function normalizeEventAwareSummaryMemo(
  parsed: EventAwareSummaryPayload,
): InvestmentMemoSections | null {
  if (
    typeof parsed.executiveSummary !== 'string' ||
    typeof parsed.investmentView !== 'string' ||
    typeof parsed.whyEventMatters !== 'string'
  ) {
    return null;
  }

  const scenarioCommentary = parsed.scenarioCommentary ?? {};
  const scenarioParts = [
    typeof scenarioCommentary.bull === 'string' ? `Bull: ${scenarioCommentary.bull.trim()}` : null,
    typeof scenarioCommentary.base === 'string' ? `Base: ${scenarioCommentary.base.trim()}` : null,
    typeof scenarioCommentary.bear === 'string' ? `Bear: ${scenarioCommentary.bear.trim()}` : null,
  ].filter((value): value is string => Boolean(value));

  const riskParts = Array.isArray(parsed.keyRisks)
    ? parsed.keyRisks
        .map((risk) => (typeof risk === 'string' ? risk.trim() : ''))
        .filter(Boolean)
    : [];

  const analysisSections = [parsed.investmentView.trim()];

  if (scenarioParts.length > 0) {
    analysisSections.push(`Scenario Commentary\n${scenarioParts.join('\n')}`);
  }

  if (riskParts.length > 0) {
    analysisSections.push(`Key Risks\n${riskParts.map((risk) => `- ${risk}`).join('\n')}`);
  }

  return {
    summary: parsed.executiveSummary.trim(),
    whyItMatters: parsed.whyEventMatters.trim(),
    analysis: analysisSections.join('\n\n'),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeGeneratedMemoPayload(parsed: unknown): InvestmentMemoSections | null {
  if (!parsed || typeof parsed !== 'object') return null;

  const candidate = parsed as Partial<InvestmentMemoSections> & EventAwareSummaryPayload;

  if (
    typeof candidate.summary === 'string' &&
    typeof candidate.whyItMatters === 'string' &&
    typeof candidate.analysis === 'string'
  ) {
    return {
      summary: candidate.summary.trim(),
      whyItMatters: candidate.whyItMatters.trim(),
      analysis: candidate.analysis.trim(),
      updatedAt: new Date().toISOString(),
    };
  }

  return normalizeEventAwareSummaryMemo(candidate);
}

function normalizeEventAwareUpdateSummary(parsed: unknown): EventAwareUpdateSummary | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const candidate = parsed as EventAwareUpdateSummary;

  if (
    typeof candidate.whatChanged !== 'string' ||
    typeof candidate.whyItChanged !== 'string' ||
    typeof candidate.valuationMove !== 'string' ||
    typeof candidate.whatMattersNow !== 'string'
  ) {
    return null;
  }

  return {
    whatChanged: candidate.whatChanged.trim(),
    whyItChanged: candidate.whyItChanged.trim(),
    valuationMove: candidate.valuationMove.trim(),
    whatMattersNow: candidate.whatMattersNow.trim(),
  };
}

function formatEventAwareUpdateSummary(summary: EventAwareUpdateSummary): string {
  return [
    `What changed: ${summary.whatChanged}`,
    `Why it changed: ${summary.whyItChanged}`,
    `Valuation move: ${summary.valuationMove}`,
    `What matters now: ${summary.whatMattersNow}`,
  ].join('\n');
}

async function generateEventAwareUpdateInterpretation(args: {
  payload: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const result = await generateTextWithProviderFallback({
      preferredProvider: 'anthropic',
      clientType: 'service',
      temperature: 0.1,
      maxTokens: 500,
      messages: [
        { role: 'system', content: INVESTMENT_EVENT_UPDATE_SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(args.payload, null, 2) },
      ],
    });

    const parsed = extractJsonObject(result?.text ?? '');
    const normalized = normalizeEventAwareUpdateSummary(parsed);
    return normalized ? formatEventAwareUpdateSummary(normalized) : null;
  } catch {
    return null;
  }
}

export async function generateInvestmentAnalysisFromPrompt(prompt: string): Promise<InvestmentAnalysisGenerationResult> {
  const normalizedPrompt = normalizePrompt(prompt);
  if (!normalizedPrompt) {
    throw new Error('Prompt is required.');
  }

  const parsedPromptContext = parseInvestmentPromptContext(normalizedPrompt);
  const companyQuery = extractCompanyQuery({ prompt: normalizedPrompt });
  if (!companyQuery.ticker && !companyQuery.companyName) {
    throw new Error('Could not identify the company to analyze.');
  }

  const profile = await resolveCompanyProfile({ prompt: normalizedPrompt });
  if (!profile?.snapshot) {
    throw new Error('No structured company snapshot was available for this analysis.');
  }

  const baseDocument = createInvestmentAnalysisDocument({
    company: buildCompanyMetadata(profile),
    assumptions: buildBaseAssumptions(profile),
    memo: {
      summary: 'Generating memo…',
      whyItMatters: 'Generating memo…',
      analysis: 'Generating memo…',
      updatedAt: null,
    },
  });

  const eventText = parsedPromptContext.eventContextText?.trim();
  if (!eventText) {
    const fallbackMemo = buildFallbackMemo(baseDocument, 'base');
    const memo = await generateMemoFromStructuredPayload({
      systemPrompt: INVESTMENT_MEMO_SYSTEM_PROMPT,
      payload: buildInitialInvestmentMemoPayload(baseDocument),
      fallback: fallbackMemo,
    });

    return {
      document: {
        ...baseDocument,
        memo,
      },
      eventImpact: null,
      eventChartInput: null,
    };
  }

  const classification = classifyInvestmentEvent({
    rawEventText: eventText,
    companyName: profile.company.name,
    sector: profile.company.sector,
  });
  const deltaResult = deriveEventAwareAssumptionDeltas({
    baseAssumptions: baseDocument.scenarios.base.assumptions,
    event: classification,
    company: {
      companyName: profile.company.name,
      sector: profile.company.sector,
      industry: profile.company.industry,
    },
  });
  const application = applyEventAssumptionDeltas(
    baseDocument.scenarios.base.assumptions,
    deltaResult,
  );
  const refreshed = refreshInvestmentAnalysisModel({
    company: baseDocument.company,
    adjustedAssumptions: {
      ...baseDocument.scenarios.base.assumptions,
      ...application.adjustedAssumptions,
    },
    existingDocument: baseDocument,
  });

  const fallbackMemo = buildFallbackMemo(refreshed.document, 'base');
  const memo = await generateMemoFromStructuredPayload({
    systemPrompt: INVESTMENT_EVENT_SUMMARY_SYSTEM_PROMPT,
    payload: buildEventAwareInvestmentMemoPayload({
      beforeDocument: baseDocument,
      afterDocument: refreshed.document,
      classification,
      application,
    }),
    fallback: fallbackMemo,
  });
  const interpretationNote = await generateEventAwareUpdateInterpretation({
    payload: buildEventAwareDeltaSummaryPayload({
      beforeDocument: baseDocument,
      afterDocument: refreshed.document,
      classification,
      application,
    }),
  });

  return {
    document: {
      ...refreshed.document,
      memo,
    },
    eventImpact: {
      classification,
      application,
      valuationStatusLabel: 'Valuation Refreshed',
      interpretationNote: interpretationNote ?? memo.summary,
    },
    eventChartInput: {
      beforeScenario: baseDocument.scenarios.base,
      afterScenario: refreshed.document.scenarios.base,
      refreshedDocument: refreshed.document,
    },
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
