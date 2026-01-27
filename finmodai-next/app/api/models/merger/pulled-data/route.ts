import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getModelData } from '@/lib/data/getModelData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const traceId = randomUUID();
  try {
    const body = await req.json();
    const acquirerRaw = body?.acquirer;
    const targetRaw = body?.target;

    if (!acquirerRaw || !targetRaw) {
      return NextResponse.json(
        {
          error: 'INVALID_INPUT',
          message: 'Acquirer and target tickers are required.',
          traceId,
        },
        { status: 400 }
      );
    }

    const acquirer = String(acquirerRaw).trim().toUpperCase();
    const target = String(targetRaw).trim().toUpperCase();

    const modelData = await getModelData({
      modelType: 'merger',
      primaryTicker: acquirer,
      tickers: [acquirer, target],
      traceId,
    });

    const acquirerData = modelData.financials[acquirer];
    const targetData = modelData.financials[target];

    if (!acquirerData || !targetData) {
      return NextResponse.json(
        {
          error: 'DATA_NOT_FOUND',
          message: 'Unable to load merger company data.',
          traceId,
        },
        { status: 404 }
      );
    }

    const toCompanyPayload = (data: any, ticker: string) => {
      const sharePrice = typeof data.price === 'number' ? data.price : undefined;
      const sharesOutstanding = typeof data.shares === 'number' ? data.shares : undefined;
      const netIncome = typeof data.netIncome === 'number' ? data.netIncome : undefined;

      return {
        name: data.name,
        ticker,
        sharePrice,
        sharesOutstanding,
        netIncome,
      };
    };

    return NextResponse.json({
      acquirer: toCompanyPayload(acquirerData, acquirer),
      target: toCompanyPayload(targetData, target),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'MERGER_DATA_FAILED',
        message: error?.message || 'Unable to load merger company data.',
        traceId,
      },
      { status: 500 }
    );
  }
}
