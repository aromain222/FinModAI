import { fetchCompanyFinancials, type CompanyFinancials, type CompanyFinancialsRequest } from './dataRetrieval';
import { featureFlags } from '@/lib/env/server';
import { extractEarningsRequestTarget, buildEarningsPackageKey, type EarningsRequestTarget } from './earningsRequest';
import {
  getEarningsPackageByQuarter,
  getLatestEarningsPackage,
  isEarningsPackageFresh,
  upsertEarningsPackage,
  type StoredEarningsPackage,
} from './earningsPackageRepo';

export type EarningsRetrievalAgentResult = {
  ticker: string;
  companyName: string;
  quarter: {
    fiscalPeriod: string | null;
    reportEndDate: string | null;
    filedAt: string | null;
    revenue: number | null;
    operatingIncome: number | null;
    netIncome: number | null;
    eps: number | null;
    source: string | null;
    reportUrl: string | null;
  };
  annual: {
    reportEndDate: string | null;
    revenue: number | null;
    ebitda: number | null;
    netIncome: number | null;
    source: string | null;
  };
  commentary: {
    highlights: string[];
    sourceNotes: string[];
  };
  dataQuality: {
    usedCachedPackage: boolean;
    usedEarningsRelease: boolean;
    usedTranscript: boolean;
    usedFinancials: boolean;
    usedFallback: boolean;
    gaps: string[];
  };
};

export type EarningsRetrievalRuntimeMeta = {
  packageKey: string;
  packageId: string | null;
  cacheStatus: 'hit_fresh' | 'hit_stale' | 'miss';
  request: EarningsRequestTarget;
  freshnessExpiresAt: string | null;
  lastFetchedAt: string | null;
};

export type EarningsRetrievalAgentEnvelope = {
  result: EarningsRetrievalAgentResult;
  runtime: EarningsRetrievalRuntimeMeta;
};

function hasQuarterMetrics(financials: CompanyFinancials): boolean {
  return [
    financials.latestQuarter.revenue,
    financials.latestQuarter.operatingIncome ?? null,
    financials.latestQuarter.netIncome,
    financials.latestQuarter.eps,
  ].some((value) => typeof value === 'number' && Number.isFinite(value));
}

function usesFallbackSource(financials: CompanyFinancials): boolean {
  const quarterSource = String(financials.latestQuarter.source ?? '').toLowerCase();
  const annualSource = String(financials.latestAnnual.source ?? '').toLowerCase();
  return (
    quarterSource.includes('sec_') ||
    annualSource.includes('sec_') ||
    quarterSource.includes('fallback') ||
    annualSource.includes('fallback')
  );
}

function buildGaps(result: EarningsRetrievalAgentResult): string[] {
  const gaps: string[] = [];
  if (result.quarter.revenue == null) gaps.push('Latest quarter revenue unavailable.');
  if (result.quarter.operatingIncome == null) gaps.push('Latest quarter operating income unavailable.');
  if (result.quarter.netIncome == null) gaps.push('Latest quarter net income unavailable.');
  if (result.quarter.eps == null) gaps.push('Latest quarter EPS unavailable.');
  if (!result.quarter.reportUrl) gaps.push('Latest quarter report link unavailable.');
  if (result.commentary.highlights.length === 0) gaps.push('No transcript or prepared-remarks highlights available.');
  return gaps;
}

function deriveFiscalYear(params: { fiscalYear?: number | null; reportEndDate?: string | null }): number | null {
  if (typeof params.fiscalYear === 'number' && Number.isFinite(params.fiscalYear)) return params.fiscalYear;
  if (!params.reportEndDate) return null;
  const year = Number(params.reportEndDate.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function dedupeLines(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const cleaned = item.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function mapStoredPackage(pkg: StoredEarningsPackage): EarningsRetrievalAgentResult {
  const quarter = (pkg.quarterData ?? {}) as Record<string, unknown>;
  const annual = (pkg.annualData ?? {}) as Record<string, unknown>;
  const commentary = (pkg.commentaryData ?? {}) as Record<string, unknown>;
  const metadata = (pkg.sourceMetadata ?? {}) as Record<string, unknown>;
  const releaseHighlights = Array.isArray(commentary.releaseHighlights)
    ? commentary.releaseHighlights.filter((item): item is string => typeof item === 'string')
    : [];
  const transcriptHighlights = Array.isArray(commentary.transcriptHighlights)
    ? commentary.transcriptHighlights.filter((item): item is string => typeof item === 'string')
    : [];
  const mergedHighlights = dedupeLines([
    ...releaseHighlights,
    ...transcriptHighlights,
    ...(Array.isArray(commentary.highlights) ? commentary.highlights.filter((item): item is string => typeof item === 'string') : []),
  ]);
  const mergedSourceNotes = dedupeLines([
    ...(Array.isArray(commentary.releaseSourceNotes)
      ? commentary.releaseSourceNotes.filter((item): item is string => typeof item === 'string')
      : []),
    ...(Array.isArray(commentary.transcriptSourceNotes)
      ? commentary.transcriptSourceNotes.filter((item): item is string => typeof item === 'string')
      : []),
    ...(Array.isArray(commentary.sourceNotes) ? commentary.sourceNotes.filter((item): item is string => typeof item === 'string') : []),
  ]);
  const result: EarningsRetrievalAgentResult = {
    ticker: pkg.ticker,
    companyName: pkg.companyName ?? pkg.ticker,
    quarter: {
      fiscalPeriod: pkg.fiscalPeriod,
      reportEndDate: pkg.reportEndDate,
      filedAt: pkg.filedAt,
      revenue: typeof quarter.revenue === 'number' ? quarter.revenue : null,
      operatingIncome: typeof quarter.operatingIncome === 'number' ? quarter.operatingIncome : null,
      netIncome: typeof quarter.netIncome === 'number' ? quarter.netIncome : null,
      eps: typeof quarter.eps === 'number' ? quarter.eps : null,
      source: typeof quarter.source === 'string' ? quarter.source : null,
      reportUrl: typeof quarter.reportUrl === 'string' ? quarter.reportUrl : null,
    },
    annual: {
      reportEndDate: typeof annual.reportEndDate === 'string' ? annual.reportEndDate : null,
      revenue: typeof annual.revenue === 'number' ? annual.revenue : null,
      ebitda: typeof annual.ebitda === 'number' ? annual.ebitda : null,
      netIncome: typeof annual.netIncome === 'number' ? annual.netIncome : null,
      source: typeof annual.source === 'string' ? annual.source : null,
    },
    commentary: {
      highlights: mergedHighlights,
      sourceNotes: mergedSourceNotes,
    },
    dataQuality: {
      usedCachedPackage: true,
      usedEarningsRelease: Boolean(metadata.usedEarningsRelease) || releaseHighlights.length > 0,
      usedTranscript: Boolean(metadata.usedTranscript) || transcriptHighlights.length > 0,
      usedFinancials: true,
      usedFallback: Boolean(metadata.usedFallback),
      gaps: [],
    },
  };
  result.dataQuality.gaps = buildGaps(result);
  return result;
}

function buildFinancialRequest(target: EarningsRequestTarget): CompanyFinancialsRequest {
  return {
    mode: target.mode,
    fiscalPeriod: target.fiscalPeriod,
    fiscalYear: target.fiscalYear,
    reportEndDate: target.reportEndDate,
  };
}

function sameQuarterAsRequested(target: EarningsRequestTarget, financials: CompanyFinancials): boolean {
  if (target.mode !== 'explicit_quarter') return true;
  if (target.reportEndDate && financials.latestQuarter.date !== target.reportEndDate) return false;
  if (target.fiscalPeriod && financials.latestQuarter.fiscalPeriod !== target.fiscalPeriod) return false;
  if (typeof target.fiscalYear === 'number' && financials.latestQuarter.date) {
    const year = Number(financials.latestQuarter.date.slice(0, 4));
    if (Number.isFinite(year) && year !== target.fiscalYear) return false;
  }
  return true;
}

function buildResultFromFinancials(target: EarningsRequestTarget, financials: CompanyFinancials): EarningsRetrievalAgentResult {
  const filingContext =
    target.mode === 'explicit_quarter'
      ? {
          latestQuarterFiledAt:
            target.reportEndDate && financials.filingContext?.latestQuarterPeriodEnd === target.reportEndDate
              ? financials.filingContext.latestQuarterFiledAt
              : null,
          latestQuarterUrl:
            target.reportEndDate && financials.filingContext?.latestQuarterPeriodEnd === target.reportEndDate
              ? financials.filingContext.latestQuarterUrl
              : null,
        }
      : financials.filingContext;

  const releaseHighlights = financials.earningsContext?.releaseHighlights ?? [];
  const transcriptHighlights = financials.earningsContext?.transcriptHighlights ?? [];
  const commentaryHighlights = dedupeLines([...releaseHighlights, ...transcriptHighlights]);
  const commentarySourceNotes = dedupeLines(financials.earningsContext?.sourceNotes ?? []);

  const result: EarningsRetrievalAgentResult = {
    ticker: financials.ticker,
    companyName: financials.companyName,
    quarter: {
      fiscalPeriod: financials.latestQuarter.fiscalPeriod ?? target.fiscalPeriod ?? null,
      reportEndDate: financials.latestQuarter.date ?? target.reportEndDate ?? null,
      filedAt: filingContext?.latestQuarterFiledAt ?? null,
      revenue: financials.latestQuarter.revenue,
      operatingIncome: financials.latestQuarter.operatingIncome ?? null,
      netIncome: financials.latestQuarter.netIncome,
      eps: financials.latestQuarter.eps,
      source: financials.latestQuarter.source ?? null,
      reportUrl: filingContext?.latestQuarterUrl ?? null,
    },
    annual: {
      reportEndDate: financials.latestAnnual.date ?? null,
      revenue: financials.latestAnnual.revenue,
      ebitda: financials.latestAnnual.ebitda,
      netIncome: financials.latestAnnual.netIncome,
      source: financials.latestAnnual.source ?? null,
    },
    commentary: {
      highlights: commentaryHighlights,
      sourceNotes: commentarySourceNotes,
    },
    dataQuality: {
      usedCachedPackage: false,
      usedEarningsRelease: releaseHighlights.length > 0,
      usedTranscript: transcriptHighlights.length > 0,
      usedFinancials: hasQuarterMetrics(financials) || financials.latestAnnual.revenue != null,
      usedFallback: usesFallbackSource(financials),
      gaps: [],
    },
  };
  result.dataQuality.gaps = buildGaps(result);
  return result;
}

async function maybeLoadCachedPackage(target: EarningsRequestTarget): Promise<{
  pkg: StoredEarningsPackage | null;
  cacheStatus: 'hit_fresh' | 'hit_stale' | 'miss';
}> {
  const pkg =
    target.mode === 'explicit_quarter'
      ? await getEarningsPackageByQuarter(target)
      : await getLatestEarningsPackage(target.ticker);
  if (!pkg) return { pkg: null, cacheStatus: 'miss' };
  if (target.mode === 'explicit_quarter') return { pkg, cacheStatus: 'hit_fresh' };
  return { pkg, cacheStatus: isEarningsPackageFresh(pkg) ? 'hit_fresh' : 'hit_stale' };
}

export async function runEarningsRetrievalAgent(params: {
  ticker: string;
  prompt?: string | null;
}): Promise<EarningsRetrievalAgentEnvelope | null> {
  const normalizedTicker = params.ticker.trim().toUpperCase();
  if (!normalizedTicker) return null;

  const request = extractEarningsRequestTarget({
    ticker: normalizedTicker,
    prompt: params.prompt,
  });
  const packageKey = buildEarningsPackageKey(request);
  const { pkg: cachedPackage, cacheStatus } = await maybeLoadCachedPackage(request);
  if (featureFlags.ENABLE_EARNINGS_PACKAGE_LOGS) {
    console.info('[earnings-agent] request', {
      ticker: normalizedTicker,
      packageKey,
      requestMode: request.mode,
      fiscalPeriod: request.fiscalPeriod,
      fiscalYear: request.fiscalYear,
      reportEndDate: request.reportEndDate,
      cacheStatus,
    });
  }

  if (cachedPackage && cacheStatus === 'hit_fresh') {
    return {
      result: mapStoredPackage(cachedPackage),
      runtime: {
        packageKey,
        packageId: cachedPackage.id,
        cacheStatus,
        request,
        freshnessExpiresAt: cachedPackage.freshnessExpiresAt,
        lastFetchedAt: cachedPackage.lastFetchedAt,
      },
    };
  }

  const financials = await fetchCompanyFinancials(normalizedTicker, buildFinancialRequest(request));
  if (!financials) {
    if (!cachedPackage) return null;
    if (featureFlags.ENABLE_EARNINGS_PACKAGE_LOGS) {
      console.warn('[earnings-agent] using stale cached package after live retrieval miss', {
        ticker: normalizedTicker,
        packageKey,
        packageId: cachedPackage.id,
      });
    }
    return {
      result: mapStoredPackage(cachedPackage),
      runtime: {
        packageKey,
        packageId: cachedPackage.id,
        cacheStatus: 'hit_stale',
        request,
        freshnessExpiresAt: cachedPackage.freshnessExpiresAt,
        lastFetchedAt: cachedPackage.lastFetchedAt,
      },
    };
  }

  const financialResult = buildResultFromFinancials(request, financials);
  if (request.mode === 'explicit_quarter' && !sameQuarterAsRequested(request, financials)) {
    if (featureFlags.ENABLE_EARNINGS_PACKAGE_LOGS) {
      console.warn('[earnings-agent] explicit quarter mismatch', {
        ticker: normalizedTicker,
        packageKey,
        requested: request,
        resolvedQuarter: {
          fiscalPeriod: financials.latestQuarter.fiscalPeriod,
          reportEndDate: financials.latestQuarter.date,
        },
      });
    }
    financialResult.quarter.revenue = null;
    financialResult.quarter.operatingIncome = null;
    financialResult.quarter.netIncome = null;
    financialResult.quarter.eps = null;
    financialResult.quarter.reportUrl = null;
    financialResult.quarter.filedAt = null;
    financialResult.dataQuality.gaps = buildGaps(financialResult);
  }

  const storedPackage = await upsertEarningsPackage({
    packageKey,
    ticker: financialResult.ticker,
    companyName: financialResult.companyName,
    fiscalPeriod: financialResult.quarter.fiscalPeriod,
    fiscalYear: deriveFiscalYear({
      fiscalYear: request.fiscalYear,
      reportEndDate: financialResult.quarter.reportEndDate,
    }),
    reportEndDate: financialResult.quarter.reportEndDate,
    filedAt: financialResult.quarter.filedAt,
    quarterData: {
      ...financialResult.quarter,
    },
    annualData: {
      ...financialResult.annual,
    },
    commentaryData: {
      releaseHighlights: financials.earningsContext?.releaseHighlights ?? [],
      releaseSourceNotes: financials.earningsContext?.releaseSourceNotes ?? [],
      releaseUrl: financials.earningsContext?.releaseUrl ?? null,
      transcriptHighlights: financials.earningsContext?.transcriptHighlights ?? [],
      transcriptSourceNotes: financials.earningsContext?.transcriptSourceNotes ?? [],
      highlights: financialResult.commentary.highlights,
      sourceNotes: financialResult.commentary.sourceNotes,
    },
    sourceMetadata: {
      cacheStatusAtWrite: cacheStatus,
      usedTranscript: financialResult.dataQuality.usedTranscript,
      usedFinancials: financialResult.dataQuality.usedFinancials,
      usedFallback: financialResult.dataQuality.usedFallback,
      usedEarningsRelease: financialResult.dataQuality.usedEarningsRelease,
      requestMode: request.mode,
      sourceLanes: {
        release: financialResult.dataQuality.usedEarningsRelease,
        transcript: financialResult.dataQuality.usedTranscript,
        financials: financialResult.dataQuality.usedFinancials,
      },
    },
    rawPayload: {
      request,
      provenance: financials.provenance ?? {},
      filingContext: financials.filingContext ?? null,
    },
    reviewReasonCodes: [
      request.mode === 'explicit_quarter' ? 'historical_quarter_request' : 'latest_quarter_request',
      financialResult.dataQuality.usedTranscript ? 'has_transcript_context' : 'financials_only',
    ],
  });

  if (featureFlags.ENABLE_EARNINGS_PACKAGE_LOGS && financialResult.commentary.highlights.length === 0) {
    console.warn('[earnings-agent] package assembled without commentary lane', {
      ticker: normalizedTicker,
      packageKey,
      requestMode: request.mode,
    });
  }

  return {
    result: financialResult,
    runtime: {
      packageKey,
      packageId: storedPackage?.id ?? cachedPackage?.id ?? null,
      cacheStatus,
      request,
      freshnessExpiresAt: storedPackage?.freshnessExpiresAt ?? cachedPackage?.freshnessExpiresAt ?? null,
      lastFetchedAt: storedPackage?.lastFetchedAt ?? cachedPackage?.lastFetchedAt ?? null,
    },
  };
}

export function serializeEarningsRetrievalAgentResult(result: EarningsRetrievalAgentResult): string {
  return JSON.stringify(result, null, 2);
}
