// @ts-nocheck
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import type { ModelKind } from '@/lib/modelReportTypes';
import { generateModelReport } from '@/lib/modelReport';

const ALLOWED_MODELS: ModelKind[] = ['dcf', 'lbo', 'comps', 'three-statement', 'scorecard', 'debt-capacity-lite'];

interface RequestBody {
  ticker?: string;
  companyName?: string;
  modelKind?: ModelKind | 'three_statement';
  keyOutputs?: {
    impliedPrice?: number;
    upsidePct?: number;
    entryMultiple?: number;
    exitMultiple?: number;
    irrPct?: number;
    moic?: number;
  };
}

export async function POST(req: Request) {
  try {
    const body: RequestBody = await req.json();
    const ticker = body.ticker?.trim().toUpperCase();
    const normalizedModelKind = body.modelKind === 'three_statement' ? 'three-statement' : body.modelKind;
    const modelKind = normalizedModelKind as ModelKind | undefined;

    if (!ticker || !modelKind || !ALLOWED_MODELS.includes(modelKind)) {
      return NextResponse.json({ error: 'ticker and modelKind are required' }, { status: 400 });
    }

    const report = await generateModelReport({
      ticker,
      companyName: body.companyName,
      modelKind,
      keyOutputs: body.keyOutputs,
    });

    try {
      const supabase = createRouteHandlerClient({ cookies });
      const {
        data: { user },
      } = await supabase.auth.getUser();

      await supabase.from('model_reports').insert({
        user_id: user?.id ?? null,
        ticker: report.ticker,
        company_name: report.companyName ?? null,
        model_kind: report.modelKind,
        as_of_date: report.asOfDate,
        runtime_seconds: report.runtimeSeconds ?? null,
        key_outputs: report.keyOutputs ?? null,
        report,
      });
    } catch (error) {
      console.error('[modelReport] Failed to persist report', error);
    }

    return NextResponse.json({ report });
  } catch (error) {
    console.error('[modelReport] Generation failed', error);
    return NextResponse.json({ error: 'Failed to generate model report' }, { status: 500 });
  }
}
