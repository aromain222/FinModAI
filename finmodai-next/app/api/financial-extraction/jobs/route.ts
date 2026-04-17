import { NextRequest, NextResponse } from 'next/server';
import { financialExtractionRouteDeps } from '@/lib/data/financial-extraction/routeDeps';
import type {
  FinancialExtractionJobRequest,
  FinancialExtractionLane,
  FinancialExtractionPeriodType,
} from '@/lib/data/financial-extraction/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isLane(value: unknown): value is FinancialExtractionLane {
  return value === 'public' || value === 'private';
}

function isPeriodType(value: unknown): value is FinancialExtractionPeriodType {
  return value === 'annual' || value === 'quarterly' || value === 'ltm';
}

function parseRequest(body: any): FinancialExtractionJobRequest {
  const lane = body?.lane;
  if (!isLane(lane)) {
    throw new Error('Financial extraction lane must be `public` or `private`.');
  }

  const targetPeriodType = isPeriodType(body?.targetPeriodType) ? body.targetPeriodType : null;
  const targetModelType =
    typeof body?.targetModelType === 'string' && body.targetModelType.trim()
      ? body.targetModelType.trim()
      : null;

  if (lane === 'public') {
    const ticker =
      typeof body?.ticker === 'string' && body.ticker.trim()
        ? body.ticker.trim().toUpperCase()
        : null;
    const companyIdentifier =
      typeof body?.companyIdentifier === 'string' && body.companyIdentifier.trim()
        ? body.companyIdentifier.trim()
        : null;

    if (!ticker && !companyIdentifier) {
      throw new Error('Public-lane extraction requires `ticker` or `companyIdentifier`.');
    }

    return {
      lane,
      ticker,
      companyIdentifier,
      targetPeriodType,
      targetModelType,
    };
  }

  const companyName =
    typeof body?.companyName === 'string' && body.companyName.trim() ? body.companyName.trim() : null;
  const fileIds = Array.isArray(body?.fileIds)
    ? body.fileIds.map((value: unknown) => String(value ?? '').trim()).filter(Boolean)
    : [];

  if (!companyName) {
    throw new Error('Private-lane extraction requires `companyName`.');
  }
  if (fileIds.length === 0) {
    throw new Error('Private-lane extraction requires at least one uploaded `fileId`.');
  }

  return {
    lane,
    companyName,
    fileIds,
    targetPeriodType,
    targetModelType,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const request = parseRequest(body);
    const job = await financialExtractionRouteDeps.createAndProcessFinancialExtractionJob(request);

    return NextResponse.json({
      jobId: job.id,
      stage: job.stage,
      validationState: job.validationState,
      snapshot: job.snapshot,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create financial extraction job.' },
      { status: 400 },
    );
  }
}

export async function GET(req: NextRequest) {
  const laneParam = req.nextUrl.searchParams.get('lane');
  const lane: FinancialExtractionLane | null = isLane(laneParam) ? laneParam : null;
  const ticker = req.nextUrl.searchParams.get('ticker');
  const companyName = req.nextUrl.searchParams.get('companyName');
  const targetModelType = req.nextUrl.searchParams.get('targetModelType');
  const limitParam = req.nextUrl.searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : 10;

  const jobs = await financialExtractionRouteDeps.listFinancialExtractionJobs({
    lane,
    ticker,
    companyName,
    targetModelType,
    limit: Number.isFinite(limit) ? limit : 10,
  });

  return NextResponse.json({
    jobs: jobs.map((job) => ({
      jobId: job.id,
      lane: job.lane,
      stage: job.stage,
      validationState: job.validationState,
      resolvedIdentity: job.resolvedIdentity,
      snapshot: job.snapshot,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    })),
  });
}
