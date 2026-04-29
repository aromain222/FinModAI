import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getFinancialModelAnalysis } from '@/lib/news/tradingSignal';
import { runDCF, applyModelImpact, DEFAULT_BASE_MODEL } from '@/lib/finance/dcfEngine';

const requestSchema = z.object({
  event: z.string().min(1),
  context: z.string().optional(),
  base_model: z
    .object({
      growth: z.number(),
      margin: z.number(),
      discountRate: z.number(),
    })
    .optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing required field: event' }, { status: 400 });
  }

  const { event, context, base_model } = parsed.data;
  const baseModel = base_model ?? DEFAULT_BASE_MODEL;

  const content = context ? `${event}. ${context}` : event;

  const analysis = await getFinancialModelAnalysis({
    mode: 'EVENT_ANALYSIS',
    data: { content },
  });

  const deltas = analysis?.model_impact ?? {
    growth_delta: 0,
    margin_delta: 0,
    discount_rate_delta: 0,
    primary_driver: 'growth',
  };

  // Real DCF computation
  const baseVal = runDCF(baseModel).value;
  const updatedModel = applyModelImpact(baseModel, deltas);
  const newVal = runDCF(updatedModel).value;
  const valuationChange = baseVal > 0 ? (newVal - baseVal) / baseVal : 0;
  const direction =
    valuationChange > 0.005 ? 'bullish' : valuationChange < -0.005 ? 'bearish' : 'neutral';

  return NextResponse.json({
    impact_summary: {
      direction,
      primary_driver: deltas.primary_driver ?? analysis?.signal?.primary_driver ?? 'growth',
      valuation_change: Math.round(valuationChange * 10000) / 10000,
      base_valuation: Math.round(baseVal * 100) / 100,
      new_valuation: Math.round(newVal * 100) / 100,
    },
    model_changes: {
      growth_delta: deltas.growth_delta,
      margin_delta: deltas.margin_delta,
      discount_rate_delta: deltas.discount_rate_delta,
    },
    scenarios: analysis?.scenarios ?? null,
    signal: analysis?.signal ?? null,
    confidence: analysis?.confidence ?? null,
  });
}
