import { NextRequest, NextResponse } from 'next/server';
import { financialExtractionRouteDeps } from '@/lib/data/financial-extraction/routeDeps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const job = await financialExtractionRouteDeps.getFinancialExtractionJob(jobId);

  if (!job) {
    return NextResponse.json({ error: 'Financial extraction job not found.' }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.id,
    stage: job.stage,
    lane: job.lane,
    validationState: job.validationState,
    resolvedIdentity: job.resolvedIdentity,
    sourceArtifacts: job.sourceArtifacts,
    validationFindings: job.validationFindings,
    snapshot: job.snapshot,
    mappedModelInputs: job.mappedModelInputs,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
}
