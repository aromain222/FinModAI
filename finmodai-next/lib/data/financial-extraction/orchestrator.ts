import {
  resolveFinancialExtractionCompany,
} from '@/lib/data/financial-extraction/companyResolver';
import {
  createFinancialExtractionJob,
  getFinancialExtractionJob,
  updateFinancialExtractionJob,
} from '@/lib/data/financial-extraction/persistence';
import { normalizeAndReconcileFinancialFacts } from '@/lib/data/financial-extraction/normalizerReconciler';
import { discoverFinancialExtractionSources } from '@/lib/data/financial-extraction/sourceDiscovery';
import { extractFinancialFacts } from '@/lib/data/financial-extraction/statementExtractor';
import type {
  FinancialExtractionJob,
  FinancialExtractionJobRequest,
} from '@/lib/data/financial-extraction/types';

export async function createAndProcessFinancialExtractionJob(
  request: FinancialExtractionJobRequest,
): Promise<FinancialExtractionJob> {
  let job = await createFinancialExtractionJob(request);

  try {
    job = await updateFinancialExtractionJob(job.id, { stage: 'resolving_company' });
    const resolution = await resolveFinancialExtractionCompany(request);
    job = await updateFinancialExtractionJob(job.id, {
      resolvedIdentity: resolution.identity,
    });

    job = await updateFinancialExtractionJob(job.id, { stage: 'discovering_sources' });
    const sourceArtifacts = await discoverFinancialExtractionSources({
      request,
      identity: resolution.identity,
      profile: resolution.profile,
    });
    job = await updateFinancialExtractionJob(job.id, { sourceArtifacts });

    job = await updateFinancialExtractionJob(job.id, { stage: 'extracting' });
    const rawFacts = await extractFinancialFacts({
      request,
      identity: resolution.identity,
      profile: resolution.profile,
      sourceArtifacts,
    });
    job = await updateFinancialExtractionJob(job.id, { facts: rawFacts });

    job = await updateFinancialExtractionJob(job.id, { stage: 'normalizing' });
    job = await updateFinancialExtractionJob(job.id, { stage: 'reconciling' });
    const reconciled = normalizeAndReconcileFinancialFacts({
      lane: request.lane,
      identity: resolution.identity,
      facts: rawFacts,
      sourceArtifacts,
    });
    job = await updateFinancialExtractionJob(job.id, {
      facts: reconciled.facts,
      validationFindings: reconciled.validationFindings,
      validationState: reconciled.snapshot.validationState,
      snapshot: reconciled.snapshot,
      mappedModelInputs: reconciled.snapshot.mappedModelInputs,
    });

    job = await updateFinancialExtractionJob(job.id, { stage: 'mapping' });
    job = await updateFinancialExtractionJob(job.id, { stage: 'completed' });
    return job;
  } catch (error) {
    await updateFinancialExtractionJob(job.id, {
      stage: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Financial extraction job failed.',
    });
    const failed = await getFinancialExtractionJob(job.id);
    if (failed) return failed;
    throw error;
  }
}
