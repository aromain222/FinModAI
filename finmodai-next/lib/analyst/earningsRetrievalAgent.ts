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

export const EARNINGS_PACKAGE_SCHEMA_VERSION = 2;

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
  resolutionStatus: 'latest' | 'exact_match' | 'unresolved_exact';
  resolvedFrom:
    | 'cached_package'
    | 'annual_results_package'
    | 'earnings_release'
    | 'prepared_remarks'
    | 'quarter_financials'
    | 'stale_cache'
    | 'none';
  matchedIdentity: {
    fiscalPeriod: string | null;
    fiscalYear: number | null;
    reportEndDate: string | null;
  } | null;
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

function buildExplicitQuarterUnresolvedGaps(): string[] {
  return [
    'Exact requested quarter revenue unavailable.',
    'Exact requested quarter operating income unavailable.',
    'Exact requested quarter net income unavailable.',
    'Exact requested quarter EPS unavailable.',
    'Exact requested quarter report link unavailable.',
    'No exact-quarter release, transcript, or prepared-remarks package was resolved from current sources.',
  ];
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
  const storedResolutionStatus = typeof metadata.resolutionStatus === 'string' ? metadata.resolutionStatus : null;
  const storedResolvedFrom = typeof metadata.resolvedFrom === 'string' ? metadata.resolvedFrom : null;
  const storedRequestMode = typeof metadata.requestMode === 'string' ? metadata.requestMode : null;
  const matchedIdentity =
    metadata.matchedIdentity && typeof metadata.matchedIdentity === 'object'
      ? (metadata.matchedIdentity as Record<string, unknown>)
      : null;
  const storedAnnualYear = deriveFiscalYear({
    fiscalYear: typeof annual.fiscalYear === 'number' ? annual.fiscalYear : null,
    reportEndDate: typeof annual.reportEndDate === 'string' ? annual.reportEndDate : null,
  });
  const matchedAnnualYear = deriveFiscalYear({
    fiscalYear: typeof matchedIdentity?.fiscalYear === 'number' ? matchedIdentity.fiscalYear : null,
    reportEndDate: typeof matchedIdentity?.reportEndDate === 'string' ? (matchedIdentity.reportEndDate as string) : null,
  });
  const allowAnnualLane =
    storedRequestMode !== 'explicit_quarter'
      ? true
      : storedResolvedFrom === 'annual_results_package' && storedResolutionStatus === 'exact_match' && storedAnnualYear !== null && storedAnnualYear === matchedAnnualYear;
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
      reportEndDate: allowAnnualLane && typeof annual.reportEndDate === 'string' ? annual.reportEndDate : null,
      revenue: allowAnnualLane && typeof annual.revenue === 'number' ? annual.revenue : null,
      ebitda: allowAnnualLane && typeof annual.ebitda === 'number' ? annual.ebitda : null,
      netIncome: allowAnnualLane && typeof annual.netIncome === 'number' ? annual.netIncome : null,
      source: allowAnnualLane && typeof annual.source === 'string' ? annual.source : null,
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

function isYearEndRequest(target: EarningsRequestTarget): boolean {
  return target.mode === 'explicit_quarter' && target.fiscalPeriod === 'Q4';
}

function yearFromDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function identityMatchesTarget(
  target: EarningsRequestTarget,
  identity: { fiscalPeriod?: string | null; fiscalYear?: number | null; reportEndDate?: string | null } | null | undefined,
): boolean {
  if (!identity || target.mode !== 'explicit_quarter') return false;
  if (target.reportEndDate && identity.reportEndDate !== target.reportEndDate) return false;
  if (target.fiscalPeriod && identity.fiscalPeriod !== target.fiscalPeriod) return false;
  if (typeof target.fiscalYear === 'number') {
    const candidateYear = identity.fiscalYear ?? yearFromDate(identity.reportEndDate);
    if (candidateYear !== target.fiscalYear) return false;
  }
  return Boolean(target.reportEndDate || target.fiscalPeriod || typeof target.fiscalYear === 'number');
}

function annualPackageMatchesTarget(target: EarningsRequestTarget, financials: CompanyFinancials): boolean {
  if (!isYearEndRequest(target)) return false;
  const annualYear = financials.latestAnnual.fiscalYear ?? yearFromDate(financials.latestAnnual.date);
  if (typeof target.fiscalYear === 'number' && annualYear !== target.fiscalYear) return false;
  if (target.reportEndDate && financials.latestAnnual.date !== target.reportEndDate) return false;
  return annualYear !== null || financials.latestAnnual.date !== null;
}

function releaseMatchesTarget(target: EarningsRequestTarget, financials: CompanyFinancials): boolean {
  return identityMatchesTarget(target, {
    fiscalPeriod: financials.earningsContext?.releaseFiscalPeriod ?? null,
    fiscalYear: financials.earningsContext?.releaseFiscalYear ?? null,
    reportEndDate: financials.earningsContext?.releaseReportEndDate ?? null,
  });
}

function transcriptMatchesTarget(target: EarningsRequestTarget, financials: CompanyFinancials): boolean {
  return identityMatchesTarget(target, {
    fiscalPeriod: financials.earningsContext?.transcriptFiscalPeriod ?? null,
    fiscalYear: financials.earningsContext?.transcriptFiscalYear ?? null,
    reportEndDate: financials.earningsContext?.transcriptReportEndDate ?? null,
  });
}

function exactQuarterResolved(target: EarningsRequestTarget, financials: CompanyFinancials): {
  resolved: boolean;
  resolvedFrom: EarningsRetrievalRuntimeMeta['resolvedFrom'];
  matchedIdentity: EarningsRetrievalRuntimeMeta['matchedIdentity'];
} {
  if (target.mode !== 'explicit_quarter') {
    return {
      resolved: true,
      resolvedFrom: 'quarter_financials',
      matchedIdentity: {
        fiscalPeriod: financials.latestQuarter.fiscalPeriod ?? null,
        fiscalYear: yearFromDate(financials.latestQuarter.date),
        reportEndDate: financials.latestQuarter.date ?? null,
      },
    };
  }

  if (isYearEndRequest(target) && annualPackageMatchesTarget(target, financials)) {
    return {
      resolved: true,
      resolvedFrom: 'annual_results_package',
      matchedIdentity: {
        fiscalPeriod: financials.earningsContext?.releaseFiscalPeriod ?? target.fiscalPeriod ?? null,
        fiscalYear:
          financials.earningsContext?.releaseFiscalYear ??
          financials.latestAnnual.fiscalYear ??
          yearFromDate(financials.latestAnnual.date) ??
          target.fiscalYear ??
          null,
        reportEndDate: financials.earningsContext?.releaseReportEndDate ?? financials.latestAnnual.date ?? target.reportEndDate ?? null,
      },
    };
  }

  if (releaseMatchesTarget(target, financials)) {
    return {
      resolved: true,
      resolvedFrom: 'earnings_release',
      matchedIdentity: {
        fiscalPeriod: financials.earningsContext?.releaseFiscalPeriod ?? null,
        fiscalYear: financials.earningsContext?.releaseFiscalYear ?? null,
        reportEndDate: financials.earningsContext?.releaseReportEndDate ?? null,
      },
    };
  }

  if (transcriptMatchesTarget(target, financials)) {
    return {
      resolved: true,
      resolvedFrom: 'prepared_remarks',
      matchedIdentity: {
        fiscalPeriod: financials.earningsContext?.transcriptFiscalPeriod ?? null,
        fiscalYear: financials.earningsContext?.transcriptFiscalYear ?? null,
        reportEndDate: financials.earningsContext?.transcriptReportEndDate ?? null,
      },
    };
  }

  if (sameQuarterAsRequested(target, financials)) {
    return {
      resolved: true,
      resolvedFrom: 'quarter_financials',
      matchedIdentity: {
        fiscalPeriod: financials.latestQuarter.fiscalPeriod ?? null,
        fiscalYear: yearFromDate(financials.latestQuarter.date),
        reportEndDate: financials.latestQuarter.date ?? null,
      },
    };
  }

  return {
    resolved: false,
    resolvedFrom: 'none',
    matchedIdentity: {
      fiscalPeriod: target.fiscalPeriod,
      fiscalYear: target.fiscalYear,
      reportEndDate: target.reportEndDate,
    },
  };
}

function storedPackageMatchesTarget(target: EarningsRequestTarget, pkg: StoredEarningsPackage): boolean {
  if (target.mode !== 'explicit_quarter') return true;
  const metadata = (pkg.sourceMetadata ?? {}) as Record<string, unknown>;
  if (metadata.packageSchemaVersion !== EARNINGS_PACKAGE_SCHEMA_VERSION) return false;
  if (metadata.requestMode !== 'explicit_quarter') return false;
  if (metadata.resolutionStatus !== 'exact_match') return false;

  const matchedIdentity =
    metadata.matchedIdentity && typeof metadata.matchedIdentity === 'object'
      ? (metadata.matchedIdentity as Record<string, unknown>)
      : null;
  if (
    !identityMatchesTarget(target, {
      fiscalPeriod: typeof matchedIdentity?.fiscalPeriod === 'string' ? (matchedIdentity.fiscalPeriod as string) : null,
      fiscalYear: typeof matchedIdentity?.fiscalYear === 'number' ? (matchedIdentity.fiscalYear as number) : null,
      reportEndDate: typeof matchedIdentity?.reportEndDate === 'string' ? (matchedIdentity.reportEndDate as string) : null,
    })
  ) {
    return false;
  }

  if (!identityMatchesTarget(target, {
    fiscalPeriod: pkg.fiscalPeriod,
    fiscalYear: pkg.fiscalYear,
    reportEndDate: pkg.reportEndDate,
  })) {
    return false;
  }

  const resolvedFrom = typeof metadata.resolvedFrom === 'string' ? metadata.resolvedFrom : null;
  if (resolvedFrom === 'annual_results_package') {
    const annual = (pkg.annualData ?? {}) as Record<string, unknown>;
    const annualYear = deriveFiscalYear({
      fiscalYear: typeof annual.fiscalYear === 'number' ? annual.fiscalYear : null,
      reportEndDate: typeof annual.reportEndDate === 'string' ? annual.reportEndDate : null,
    });
    if (typeof target.fiscalYear === 'number' && annualYear !== target.fiscalYear) return false;
  }

  return true;
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
  const allowAnnualLane = target.mode !== 'explicit_quarter' || annualPackageMatchesTarget(target, financials);

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
      reportUrl: filingContext?.latestQuarterUrl ?? financials.earningsContext?.releaseUrl ?? null,
    },
    annual: {
      reportEndDate: allowAnnualLane ? financials.latestAnnual.date ?? null : null,
      revenue: allowAnnualLane ? financials.latestAnnual.revenue : null,
      ebitda: allowAnnualLane ? financials.latestAnnual.ebitda : null,
      netIncome: allowAnnualLane ? financials.latestAnnual.netIncome : null,
      source: allowAnnualLane ? financials.latestAnnual.source ?? null : null,
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
  if (target.mode === 'explicit_quarter' && !storedPackageMatchesTarget(target, pkg)) {
    if (featureFlags.ENABLE_EARNINGS_PACKAGE_LOGS) {
      console.warn('[earnings-agent] invalidated legacy or mismatched explicit-quarter cache row', {
        ticker: target.ticker,
        packageKey: pkg.packageKey,
        request: target,
        storedMetadata: pkg.sourceMetadata ?? {},
      });
    }
    return { pkg: null, cacheStatus: 'miss' };
  }
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
        resolutionStatus: request.mode === 'explicit_quarter' ? 'exact_match' : 'latest',
        resolvedFrom: 'cached_package',
        matchedIdentity: {
          fiscalPeriod: cachedPackage.fiscalPeriod,
          fiscalYear: cachedPackage.fiscalYear,
          reportEndDate: cachedPackage.reportEndDate,
        },
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
        resolutionStatus: request.mode === 'explicit_quarter' ? 'unresolved_exact' : 'latest',
        resolvedFrom: 'stale_cache',
        matchedIdentity: {
          fiscalPeriod: cachedPackage.fiscalPeriod,
          fiscalYear: cachedPackage.fiscalYear,
          reportEndDate: cachedPackage.reportEndDate,
        },
        freshnessExpiresAt: cachedPackage.freshnessExpiresAt,
        lastFetchedAt: cachedPackage.lastFetchedAt,
      },
    };
  }

  const financialResult = buildResultFromFinancials(request, financials);
  const exactResolution = exactQuarterResolved(request, financials);
  if (request.mode === 'explicit_quarter' && !exactResolution.resolved) {
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
    financialResult.commentary.highlights = [];
    financialResult.commentary.sourceNotes = [];
    financialResult.dataQuality.gaps = buildExplicitQuarterUnresolvedGaps();
  }

  const shouldPersistExactPackage = request.mode !== 'explicit_quarter' || exactResolution.resolved;
  const storedPackage = shouldPersistExactPackage
    ? await upsertEarningsPackage({
        packageKey,
        ticker: financialResult.ticker,
        companyName: financialResult.companyName,
        fiscalPeriod: exactResolution.matchedIdentity?.fiscalPeriod ?? financialResult.quarter.fiscalPeriod,
        fiscalYear: exactResolution.matchedIdentity?.fiscalYear ?? deriveFiscalYear({
          fiscalYear: request.fiscalYear,
          reportEndDate: financialResult.quarter.reportEndDate,
        }),
        reportEndDate: exactResolution.matchedIdentity?.reportEndDate ?? financialResult.quarter.reportEndDate,
        filedAt: financialResult.quarter.filedAt,
        quarterData: {
          ...financialResult.quarter,
        },
        annualData: {
          ...financialResult.annual,
          fiscalYear:
            request.mode === 'explicit_quarter' && exactResolution.resolvedFrom !== 'annual_results_package'
              ? null
              : financials.latestAnnual.fiscalYear ?? null,
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
          packageSchemaVersion: EARNINGS_PACKAGE_SCHEMA_VERSION,
          cacheStatusAtWrite: cacheStatus,
          resolutionStatus: request.mode === 'explicit_quarter' ? 'exact_match' : 'latest',
          resolvedFrom: exactResolution.resolvedFrom,
          matchedIdentity: exactResolution.matchedIdentity,
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
      })
    : null;

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
      resolutionStatus:
        request.mode === 'explicit_quarter'
          ? (exactResolution.resolved ? 'exact_match' : 'unresolved_exact')
          : 'latest',
      resolvedFrom: request.mode === 'explicit_quarter' ? exactResolution.resolvedFrom : 'quarter_financials',
      matchedIdentity: exactResolution.matchedIdentity,
      freshnessExpiresAt: storedPackage?.freshnessExpiresAt ?? cachedPackage?.freshnessExpiresAt ?? null,
      lastFetchedAt: storedPackage?.lastFetchedAt ?? cachedPackage?.lastFetchedAt ?? null,
    },
  };
}

export function serializeEarningsRetrievalAgentResult(result: EarningsRetrievalAgentResult): string {
  return JSON.stringify(result, null, 2);
}
