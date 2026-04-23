import * as cheerio from 'cheerio';

import { resolveCompanyProfile } from '@/lib/data/company/resolveCompanyProfile';
import type { CompanyQuery, ResolvedCompanyProfile } from '@/lib/data/company/types';
import { fetchJsonWithRetry, sleep } from '@/lib/data/providers/shared';
import { serverEnv } from '@/lib/env/server';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';
import type {
  StrictDiscoveredSource,
  StrictFinancialMetric,
  StrictFinancialPeriodType,
  StrictSourceDiscoveryPlan,
} from '@/lib/data/financial-extraction/strict/types';

export type SourceDiscoverySurface =
  | 'strict_pipeline'
  | 'analyst_chat'
  | 'model_generation';

export type SourceDiscoveryResult =
  | {
      ok: true;
      profile: ResolvedCompanyProfile;
      plan: StrictSourceDiscoveryPlan;
    }
  | {
      ok: false;
      reason: string;
    };

type SourceDiscoveryParams = {
  surface: SourceDiscoverySurface;
  query: CompanyQuery;
  periodType?: StrictFinancialPeriodType | null;
  targetModelType?: string | null;
  metrics?: StrictFinancialMetric[];
};

type SecRecentFiling = {
  filingDate: string;
  form: string;
  primaryDocument: string;
  accessionNumber: string;
  filingUrl: string;
};

const DEFAULT_METRICS: StrictFinancialMetric[] = [
  'revenue',
  'ebitda',
  'net_income',
  'free_cash_flow',
  'debt',
  'cash',
];

const KNOWN_IR_URLS: Record<string, string> = {
  AAPL: 'https://investor.apple.com/',
  AMZN: 'https://ir.aboutamazon.com/',
  GOOG: 'https://abc.xyz/investor/',
  GOOGL: 'https://abc.xyz/investor/',
  META: 'https://investor.fb.com/home/default.aspx',
  MSFT: 'https://www.microsoft.com/en-us/Investor/default',
  MU: 'https://investors.micron.com/',
  NVDA: 'https://investor.nvidia.com/',
  PLTR: 'https://investors.palantir.com/',
  TSLA: 'https://ir.tesla.com/',
};

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() || trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < firstBrace) return {};
  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  } catch {
    return {};
  }
}

function secHeaders(): HeadersInit {
  return {
    'User-Agent': serverEnv.SEC_UA_EMAIL || 'capitalbase/unknown',
    Accept: 'application/json,text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  };
}

async function fetchTextWithRetry(
  url: string,
  headers?: HeadersInit,
  maxRetries = 2,
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const response = await fetch(url, { headers });
      if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
        await sleep(500 * Math.pow(2, attempt));
        attempt += 1;
        continue;
      }
      if (!response.ok) {
        return { ok: false, reason: `HTTP ${response.status} for ${url}` };
      }
      return { ok: true, text: await response.text() };
    } catch (error) {
      if (attempt < maxRetries) {
        await sleep(500 * Math.pow(2, attempt));
        attempt += 1;
        continue;
      }
      return {
        ok: false,
        reason: error instanceof Error ? error.message : `Failed to fetch ${url}`,
      };
    }
  }

  return { ok: false, reason: `Rate limited while fetching ${url}` };
}

function toSourceId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function normalizeUrl(value: string, baseUrl?: string): string | null {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function metricPreferenceDefaults(candidates: StrictDiscoveredSource[]): Partial<Record<StrictFinancialMetric, string[]>> {
  const secFirst = candidates
    .filter((candidate) => candidate.provider === 'sec_edgar')
    .map((candidate) => candidate.source_id);
  const irSecond = candidates
    .filter((candidate) => candidate.provider === 'company_ir')
    .map((candidate) => candidate.source_id);
  const preferred = [...secFirst, ...irSecond];

  return {
    revenue: preferred,
    ebitda: preferred,
    net_income: preferred,
    free_cash_flow: preferred,
    debt: preferred,
    cash: preferred,
  };
}

async function fetchRecentSecFiling(
  cik: string,
  periodType: StrictFinancialPeriodType,
): Promise<SecRecentFiling | null> {
  const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const result = await fetchJsonWithRetry<{
    filings?: {
      recent?: {
        filingDate?: string[];
        form?: string[];
        primaryDocument?: string[];
        accessionNumber?: string[];
      };
    };
  }>({
    provider: 'sec_edgar',
    url: submissionsUrl,
    cacheKey: `source_discovery:sec_submissions:${cik}`,
    ttlMs: 15 * 60 * 1000,
    options: { headers: secHeaders() },
  });
  if (!result.ok) return null;

  const recent = result.data?.filings?.recent;
  if (!recent?.form || !recent.accessionNumber || !recent.primaryDocument || !recent.filingDate) {
    return null;
  }

  const acceptedForms =
    periodType === 'annual'
      ? new Set(['10-K', '20-F'])
      : periodType === 'quarterly'
        ? new Set(['10-Q'])
        : new Set(['10-K', '20-F', '10-Q']);

  const maxCount = Math.min(
    recent.form.length,
    recent.accessionNumber.length,
    recent.primaryDocument.length,
    recent.filingDate.length,
  );

  for (let index = 0; index < maxCount; index += 1) {
    const form = recent.form[index] ?? '';
    if (!acceptedForms.has(form)) continue;
    const accessionNumber = recent.accessionNumber[index] ?? '';
    const primaryDocument = recent.primaryDocument[index] ?? '';
    const filingDate = recent.filingDate[index] ?? '';
    if (!accessionNumber || !primaryDocument || !filingDate) continue;

    const cikNoLeadingZeros = String(Number(cik));
    const accessionNoDashes = accessionNumber.replace(/-/g, '');
    const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cikNoLeadingZeros}/${accessionNoDashes}/${primaryDocument}`;
    return {
      filingDate,
      form,
      primaryDocument,
      accessionNumber,
      filingUrl,
    };
  }

  return null;
}

function chooseResultLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const winners = new Set<string>();

  $('a[href]').each((_, anchor) => {
    const href = String($(anchor).attr('href') ?? '');
    const text = $(anchor).text().replace(/\s+/g, ' ').trim().toLowerCase();
    const absolute = normalizeUrl(href, baseUrl);
    if (!absolute) return;
    const url = new URL(absolute);
    const sameHost = url.hostname === new URL(baseUrl).hostname;
    if (!sameHost) return;
    const haystack = `${text} ${absolute}`.toLowerCase();
    if (!/earnings|results|financial results|quarterly|annual report|shareholder letter|press release/.test(haystack)) {
      return;
    }
    winners.add(absolute);
  });

  return Array.from(winners).slice(0, 2);
}

async function discoverInvestorRelationsCandidates(
  profile: ResolvedCompanyProfile,
): Promise<StrictDiscoveredSource[]> {
  const rootUrl = KNOWN_IR_URLS[profile.company.ticker];
  if (!rootUrl) return [];

  const rootFetch = await fetchTextWithRetry(rootUrl);
  if (!rootFetch.ok) {
    return [
      {
        source_id: `company_ir_root:${toSourceId(profile.company.ticker)}`,
        provider: 'company_ir',
        source_family: 'company_results',
        source_url: rootUrl,
        requires_robots_check: true,
        rationale: 'Known official investor-relations root URL for the issuer.',
      },
    ];
  }

  const candidates: StrictDiscoveredSource[] = [
    {
      source_id: `company_ir_root:${toSourceId(profile.company.ticker)}`,
      provider: 'company_ir',
      source_family: 'company_results',
      source_url: rootUrl,
      requires_robots_check: true,
      rationale: 'Known official investor-relations root URL for the issuer.',
    },
  ];

  for (const link of chooseResultLinks(rootFetch.text, rootUrl)) {
    candidates.push({
      source_id: `company_ir_page:${toSourceId(link)}`,
      provider: 'company_ir',
      source_family: 'company_results',
      source_url: link,
      requires_robots_check: true,
      rationale: 'Official investor-relations results or earnings page discovered from the issuer IR root.',
    });
  }

  return candidates;
}

function buildCandidateSources(args: {
  profile: ResolvedCompanyProfile;
  periodType: StrictFinancialPeriodType;
  filing: SecRecentFiling | null;
  irCandidates: StrictDiscoveredSource[];
}): StrictDiscoveredSource[] {
  const cik = args.profile.identifiers.find((identifier) => identifier.cik)?.cik ?? null;
  const candidates: StrictDiscoveredSource[] = [];

  if (cik) {
    candidates.push(
      {
        source_id: `sec_companyfacts:${cik}`,
        provider: 'sec_edgar',
        source_family: 'filing',
        source_url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
        requires_robots_check: false,
        rationale: 'Official SEC companyfacts endpoint for filing-backed statement metrics.',
      },
      {
        source_id: `sec_submissions:${cik}`,
        provider: 'sec_edgar',
        source_family: 'filing',
        source_url: `https://data.sec.gov/submissions/CIK${cik}.json`,
        requires_robots_check: false,
        rationale: 'Official SEC submissions feed used to identify recent filing documents.',
      },
    );
  }

  if (args.filing) {
    candidates.push({
      source_id: `sec_filing:${toSourceId(args.filing.form)}:${args.filing.accessionNumber}`,
      provider: 'sec_edgar',
      source_family: 'filing',
      source_url: args.filing.filingUrl,
      requires_robots_check: false,
      rationale: `Latest ${args.filing.form} primary document for the requested period.`,
    });
  }

  return [...candidates, ...args.irCandidates];
}

export const sourceDiscoveryDeps = {
  resolveCompanyProfile,
  fetchRecentSecFiling,
  discoverInvestorRelationsCandidates,
  generateTextWithProviderFallback,
};

export async function runSourceDiscoveryAgent(
  params: SourceDiscoveryParams,
): Promise<SourceDiscoveryResult> {
  const profile = await sourceDiscoveryDeps.resolveCompanyProfile(params.query);
  if (!profile?.company?.ticker) {
    return {
      ok: false,
      reason: 'Unable to resolve the requested public company for source discovery.',
    };
  }

  const cik = profile.identifiers.find((identifier) => identifier.cik)?.cik ?? null;
  if (!cik) {
    return {
      ok: false,
      reason: 'SEC CIK is unavailable for the requested public company.',
    };
  }

  const requestedPeriod = params.periodType ?? 'ltm';
  const requestedMetrics = params.metrics?.length ? params.metrics : DEFAULT_METRICS;
  const filing = await sourceDiscoveryDeps.fetchRecentSecFiling(cik, requestedPeriod);
  const irCandidates = await sourceDiscoveryDeps.discoverInvestorRelationsCandidates(profile);
  const candidateSources = buildCandidateSources({
    profile,
    periodType: requestedPeriod,
    filing,
    irCandidates,
  });

  if (!candidateSources.length) {
    return {
      ok: false,
      reason: 'No official source candidates were discovered for the requested company and period.',
    };
  }

  const response = await sourceDiscoveryDeps.generateTextWithProviderFallback({
    clientType: 'service',
    preferredProvider: 'openai',
    openAiModels: ['gpt-5.4'],
    temperature: 0,
    maxTokens: 1200,
    messages: [
      {
        role: 'system',
        content: [
          'You are a SOURCE_DISCOVERY_AGENT for official financial retrieval.',
          'TASK: choose which official source URLs should be fetched for public-company financial metrics.',
          'RULES:',
          '- Output JSON only.',
          '- Never emit financial values.',
          '- Never estimate or infer missing facts.',
          '- Only choose from the provided candidate source_ids.',
          '- Prefer SEC companyfacts and relevant SEC filing pages first.',
          '- Use company investor-relations or earnings-results pages only as supplementary official evidence.',
          '- If you cannot make a safe official-only plan, return empty chosen_source_ids.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({
          surface: params.surface,
          target_model_type: params.targetModelType ?? null,
          requested_period: requestedPeriod,
          requested_subject: {
            ticker: profile.company.ticker,
            company_name: profile.company.name,
          },
          requested_metrics: requestedMetrics,
          candidate_sources: candidateSources,
          output_schema: {
            chosen_source_ids: ['source ids from input only'],
            metric_preferences: {
              revenue: ['source ids from input only'],
              ebitda: ['source ids from input only'],
            },
            warnings: ['optional warning'],
            rationale: 'short reason',
          },
        }),
      },
    ],
  });

  if (!response?.text) {
    return {
      ok: false,
      reason: 'SOURCE_DISCOVERY_AGENT did not return a usable official-source plan.',
    };
  }

  const parsed = extractJsonObject(response.text) as {
    chosen_source_ids?: unknown;
    metric_preferences?: unknown;
    warnings?: unknown;
    rationale?: unknown;
  };

  const allowedSourceIds = new Set(candidateSources.map((candidate) => candidate.source_id));
  const chosenSourceIds = Array.isArray(parsed.chosen_source_ids)
    ? Array.from(
        new Set(
          parsed.chosen_source_ids.filter(
            (value): value is string => typeof value === 'string' && allowedSourceIds.has(value),
          ),
        ),
      )
    : [];

  if (!chosenSourceIds.length) {
    return {
      ok: false,
      reason: 'SOURCE_DISCOVERY_AGENT could not choose a safe official-source plan.',
    };
  }

  const metricPreferences: StrictSourceDiscoveryPlan['metric_preferences'] = {};
  const rawMetricPreferences =
    parsed.metric_preferences && typeof parsed.metric_preferences === 'object'
      ? (parsed.metric_preferences as Record<string, unknown>)
      : {};
  for (const metric of requestedMetrics) {
    const selected = Array.isArray(rawMetricPreferences[metric])
      ? rawMetricPreferences[metric].filter(
          (value): value is string => typeof value === 'string' && allowedSourceIds.has(value),
        )
      : [];
    if (selected.length > 0) {
      metricPreferences[metric] = Array.from(new Set(selected));
    }
  }

  const chosenSources = candidateSources.filter((candidate) => chosenSourceIds.includes(candidate.source_id));
  const normalizedMetricPreferences = Object.keys(metricPreferences).length
    ? metricPreferences
    : metricPreferenceDefaults(chosenSources);

  return {
    ok: true,
    profile,
    plan: {
      requested_subject: {
        ticker: profile.company.ticker,
        company_name: profile.company.name,
      },
      requested_period: requestedPeriod,
      candidate_sources: candidateSources,
      chosen_source_ids: chosenSourceIds,
      chosen_sources: chosenSources,
      metric_preferences: normalizedMetricPreferences,
      warnings: Array.isArray(parsed.warnings)
        ? parsed.warnings.filter((warning): warning is string => typeof warning === 'string' && warning.trim().length > 0)
        : [],
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale.trim() : '',
    },
  };
}
