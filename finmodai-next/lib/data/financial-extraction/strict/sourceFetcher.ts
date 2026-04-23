import { strictFinancialPipelineDeps } from '@/lib/data/financial-extraction/strict/deps';
import { executeSourceFetchPlan } from '@/lib/data/financial-extraction/strict/sourceFetchExecutor';
import type {
  StrictPipelineArtifactBundle,
  StrictPipelineFailure,
  StrictPipelineRequest,
  StrictSourceDiscoveryPlan,
} from '@/lib/data/financial-extraction/strict/types';

export async function runStrictSourceFetcher(
  request: StrictPipelineRequest,
): Promise<
  | {
      ok: true;
      ticker: string;
      companyName: string;
      discoveryPlan: StrictSourceDiscoveryPlan;
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
        step: 'SOURCE_DISCOVERY_AGENT',
        reason: resolution.error,
        missing_fields: ['ticker'],
        conflicts: [],
      },
    };
  }

  const ticker = resolution.identity.ticker ?? request.ticker;
  const discovery = await strictFinancialPipelineDeps.runSourceDiscoveryAgent({
    surface: 'strict_pipeline',
    query: {
      ticker,
      companyName: resolution.identity.companyName,
    },
    periodType: request.period_type,
    targetModelType: request.target_model_type,
    metrics: ['revenue', 'ebitda', 'net_income', 'free_cash_flow', 'debt', 'cash'],
  });

  if (!discovery.ok) {
    return {
      ok: false,
      failure: {
        status: 'FAILURE',
        step: 'SOURCE_DISCOVERY_AGENT',
        reason: discovery.reason,
        missing_fields: ['revenue', 'ebitda', 'net_income', 'free_cash_flow', 'debt', 'cash'],
        conflicts: [],
      },
    };
  }

  const fetched = await executeSourceFetchPlan({ plan: discovery.plan });
  if (!fetched.ok) {
    return {
      ok: false,
      failure: fetched.failure,
    };
  }

  return {
    ok: true,
    ticker,
    companyName: resolution.identity.companyName,
    discoveryPlan: discovery.plan,
    artifacts: fetched.artifacts,
  };
}
