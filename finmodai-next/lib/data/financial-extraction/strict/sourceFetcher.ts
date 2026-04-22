import { strictFinancialPipelineDeps } from '@/lib/data/financial-extraction/strict/deps';
import type {
  StrictPipelineArtifactBundle,
  StrictPipelineFailure,
  StrictPipelineRequest,
  StrictSourceArtifact,
} from '@/lib/data/financial-extraction/strict/types';

function nowIso(): string {
  return new Date().toISOString();
}

function artifactId(provider: StrictSourceArtifact['provider'], suffix: string): string {
  return `${provider}:${suffix}`;
}

export async function runStrictSourceFetcher(
  request: StrictPipelineRequest,
): Promise<
  | {
      ok: true;
      ticker: string;
      companyName: string;
      artifacts: StrictPipelineArtifactBundle[];
    }
  | {
      ok: false;
      failure: StrictPipelineFailure;
    }
> {
  const resolution = await strictFinancialPipelineDeps.resolvePublicCompany({
    ticker: request.ticker,
    companyIdentifier: request.company_identifier,
  }).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : 'Unable to resolve company.';
    return { error: reason };
  });

  if ('error' in resolution) {
    return {
      ok: false,
      failure: {
        status: 'FAILURE',
        step: 'SOURCE_FETCHER',
        reason: resolution.error,
        missing_fields: ['ticker'],
        conflicts: [],
      },
    };
  }

  const ticker = resolution.identity.ticker ?? request.ticker;
  const secResult = await strictFinancialPipelineDeps.fetchSecCompanyFactsRaw(
    ticker,
    resolution.identity.cik,
  );
  const fmpResult = await strictFinancialPipelineDeps.fetchFmpRawBundle(ticker, request.period_type);

  const artifacts: StrictPipelineArtifactBundle[] = [];
  if (secResult.ok) {
    artifacts.push({
      artifact: {
        source_id: artifactId('sec_edgar', secResult.cik),
        provider: 'sec_edgar',
        artifact_type: 'filing',
        source_url: secResult.sourceUrl,
        fetched_at: nowIso(),
        as_of_date: null,
        period_type: request.period_type,
      },
      raw: secResult.data,
    });
  }

  if (fmpResult.ok) {
    const fetchedAt = nowIso();
    for (const [kind, raw] of Object.entries(fmpResult.data)) {
      if (!raw) continue;
      artifacts.push({
        artifact: {
          source_id: artifactId('fmp', `${ticker}:${kind}:${request.period_type}`),
          provider: 'fmp',
          artifact_type: 'api_response',
          source_url: fmpResult.urls[kind as keyof typeof fmpResult.urls],
          fetched_at: fetchedAt,
          as_of_date: null,
          period_type: request.period_type,
        },
        raw,
      });
    }
  }

  if (artifacts.length === 0) {
    return {
      ok: false,
      failure: {
        status: 'FAILURE',
        step: 'SOURCE_FETCHER',
        reason: 'No usable SEC or verified API artifacts were fetched.',
        missing_fields: ['revenue', 'ebitda', 'net_income', 'free_cash_flow', 'debt', 'cash'],
        conflicts: [],
      },
    };
  }

  return {
    ok: true,
    ticker,
    companyName: resolution.identity.companyName,
    artifacts,
  };
}
