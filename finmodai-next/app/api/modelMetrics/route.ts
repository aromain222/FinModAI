import { NextRequest, NextResponse } from 'next/server';
import { getModelStats, mapModelTypeToMetrics } from '@/lib/modelMetrics';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get('ticker');
  const modelTypeParam = searchParams.get('modelType');

  if (!ticker || !modelTypeParam) {
    return NextResponse.json({ error: 'ticker and modelType are required' }, { status: 400 });
  }

  const normalizedModelType = mapModelTypeToMetrics(modelTypeParam);
  if (!normalizedModelType) {
    return NextResponse.json({ error: 'Invalid modelType' }, { status: 400 });
  }

  const stats = await getModelStats({
    ticker,
    modelType: normalizedModelType,
  });

  return NextResponse.json(stats);
}
