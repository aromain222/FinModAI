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

  if (!job.snapshot || job.snapshot.validationState === 'blocking_error' || !job.mappedModelInputs) {
    return NextResponse.json(
      {
        error: 'Financial extraction job is not model-ready.',
        validationState: job.snapshot?.validationState ?? null,
        blockingErrors: job.snapshot?.blockingErrors ?? [],
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    jobId: job.id,
    validationState: job.snapshot.validationState,
    mappedModelInputs: job.mappedModelInputs,
  });
}
