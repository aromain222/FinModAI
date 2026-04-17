import { NextRequest, NextResponse } from 'next/server';
import { deriveEventLinkedModelAdjustment } from '@/lib/model-events/deriveEventLinkedModelAdjustment';
import type { EventLinkedModelAdjustmentInput } from '@/lib/model-events/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseInput(body: any): EventLinkedModelAdjustmentInput {
  const rawEventText = toNullableString(body?.event?.rawEventText);
  if (!rawEventText) {
    throw new Error('Event text is required.');
  }

  const sourceType = body?.event?.sourceType === 'feed_item' ? 'feed_item' : 'pasted_text';

  return {
    event: {
      sourceType,
      eventId: toNullableString(body?.event?.eventId),
      title: toNullableString(body?.event?.title),
      rawEventText,
      publishedAt: toNullableString(body?.event?.publishedAt),
      sourceUrl: toNullableString(body?.event?.sourceUrl),
      sourceLabel: toNullableString(body?.event?.sourceLabel),
      impactedTickers: Array.isArray(body?.event?.impactedTickers)
        ? body.event.impactedTickers.map((value: unknown) => String(value ?? '').trim()).filter(Boolean)
        : null,
      impactedSectors: Array.isArray(body?.event?.impactedSectors)
        ? body.event.impactedSectors.map((value: unknown) => String(value ?? '').trim()).filter(Boolean)
        : null,
    },
    company: {
      companyName: toNullableString(body?.company?.companyName),
      ticker: toNullableString(body?.company?.ticker),
      sector: toNullableString(body?.company?.sector),
      industry: toNullableString(body?.company?.industry),
    },
    currentAssumptions: {
      revenue_growth: toNullableNumber(body?.currentAssumptions?.revenue_growth),
      operating_margin: toNullableNumber(body?.currentAssumptions?.operating_margin),
      wacc: toNullableNumber(body?.currentAssumptions?.wacc),
      terminal_growth_rate: toNullableNumber(body?.currentAssumptions?.terminal_growth_rate),
    },
    modelType: toNullableString(body?.modelType),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = parseInput(body);
    const adjustment = await deriveEventLinkedModelAdjustment(input);
    return NextResponse.json(adjustment);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to derive event-linked model adjustment.' },
      { status: 400 },
    );
  }
}
