import { NextRequest, NextResponse } from 'next/server';
import { insertModel } from '@/lib/modelsRepo';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ticker = body?.ticker;
    const modelType = body?.modelType;

    if (!ticker || !modelType) {
      return NextResponse.json({ error: 'ticker and modelType are required' }, { status: 400 });
    }

    const record = await insertModel({
      ticker,
      model_type: modelType,
      status: 'ready',
      file_name: body?.fileName ?? null,
      notes: body?.notes ?? null
    });

    return NextResponse.json({ model: record });
  } catch (error) {
    console.error('Failed to log model', error);
    return NextResponse.json({ error: 'Failed to log model' }, { status: 500 });
  }
}
