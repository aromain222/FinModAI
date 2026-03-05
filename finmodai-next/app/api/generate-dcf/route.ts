import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DcfOverridesSchema, DcfSpecSchema } from '@/lib/modeling/dcfSpec';
import { generateDcfSpec } from '@/lib/modeling/generateDcfSpec';
import { buildDcfWorkbook, evaluateDcfSpec } from '@/lib/modeling/buildDcfWorkbook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const GenerateDcfRequestSchema = z.object({
  prompt: z.string().min(3, 'prompt must be at least 3 characters'),
  overrides: DcfOverridesSchema,
});

type GenerateDcfResponseSummary = {
  company: string;
  ticker: string;
  years: number;
  wacc: number;
  terminal_method: 'gordon' | 'exit_multiple';
  terminal_g?: number;
  exit_multiple?: number;
  enterprise_value: number;
  warnings: string[];
};

function cleanTicker(value?: string): string {
  const fallback = 'DCF';
  if (!value) return fallback;
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 10);
  return cleaned || fallback;
}

function buildWarnings(spec: z.infer<typeof DcfSpecSchema>): string[] {
  const warnings: string[] = [];

  if (spec.forecast.capex_pct_rev > spec.forecast.da_pct_rev) {
    warnings.push('Capex % revenue is above D&A % revenue, which can depress FCFF in outer years.');
  }

  if (spec.valuation.terminal.method === 'gordon') {
    const spread = spec.valuation.wacc - spec.valuation.terminal.g;
    if (spread < 0.02) {
      warnings.push('WACC minus terminal growth is tight (<2%), making terminal value highly sensitive.');
    }
  }

  const firstMargin = spec.forecast.ebit_margin[0];
  const lastMargin = spec.forecast.ebit_margin[spec.forecast.ebit_margin.length - 1];
  if (lastMargin < firstMargin) {
    warnings.push('EBIT margin declines over the forecast period; verify margin pressure assumptions.');
  }

  return warnings;
}

function serializeHeaderJson(value: unknown): string {
  return encodeURIComponent(JSON.stringify(value));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = GenerateDcfRequestSchema.parse(body);

    const dcfSpec = DcfSpecSchema.parse(await generateDcfSpec(parsed.prompt, parsed.overrides));
    const workbook = await buildDcfWorkbook(dcfSpec);
    const valuation = evaluateDcfSpec(dcfSpec);

    const ticker = cleanTicker(dcfSpec.company.ticker);
    const filename = `CapitalBase_DCF_${ticker}.xlsx`;

    const summary: GenerateDcfResponseSummary = {
      company: dcfSpec.company.name,
      ticker,
      years: dcfSpec.periods.years,
      wacc: dcfSpec.valuation.wacc,
      terminal_method: dcfSpec.valuation.terminal.method,
      terminal_g: dcfSpec.valuation.terminal.method === 'gordon' ? dcfSpec.valuation.terminal.g : undefined,
      exit_multiple:
        dcfSpec.valuation.terminal.method === 'exit_multiple' ? dcfSpec.valuation.terminal.exit_multiple : undefined,
      enterprise_value: valuation.enterpriseValue,
      warnings: buildWarnings(dcfSpec),
    };

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
        'X-CapitalBase-DCF-Summary': serializeHeaderJson(summary),
        'X-CapitalBase-DCF-Spec': serializeHeaderJson(dcfSpec),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate DCF model';
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 400 }
    );
  }
}
