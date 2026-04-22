import { NextRequest, NextResponse } from 'next/server';
import { deriveSmartAssumptions } from '@/lib/smart-assumptions/deriveSmartAssumptions';
import type {
  SmartAssumptionCurrentAssumptions,
  SmartAssumptionInput,
} from '@/lib/smart-assumptions/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseCurrentAssumptions(value: unknown): Partial<SmartAssumptionCurrentAssumptions> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return {
    revenue_growth: toNullableNumber(row.revenue_growth),
    operating_margin: toNullableNumber(row.operating_margin),
    wacc: toNullableNumber(row.wacc),
    terminal_growth_rate: toNullableNumber(row.terminal_growth_rate),
  };
}

function parseInput(body: any, req: NextRequest): SmartAssumptionInput {
  return {
    company: {
      companyName: toNullableString(body?.company?.companyName),
      ticker: toNullableString(body?.company?.ticker),
      sector: toNullableString(body?.company?.sector),
      industry: toNullableString(body?.company?.industry),
    },
    currentAssumptions: parseCurrentAssumptions(body?.currentAssumptions),
    modelType: toNullableString(body?.modelType),
    origin: req.nextUrl.origin,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = parseInput(body, req);
    if (!input.company.companyName && !input.company.ticker) {
      return NextResponse.json({ error: 'Company name or ticker is required.' }, { status: 400 });
    }
    const result = await deriveSmartAssumptions(input);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to derive smart assumptions.' },
      { status: 400 },
    );
  }
}
