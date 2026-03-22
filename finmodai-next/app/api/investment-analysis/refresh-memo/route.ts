import { NextResponse } from 'next/server';
import { refreshInvestmentMemo } from '@/lib/investment-analysis/generateAnalysis';
import type {
  InvestmentAnalysisDocument,
  InvestmentScenarioKey,
} from '@/lib/investment-analysis/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      document?: InvestmentAnalysisDocument;
      activeScenario?: InvestmentScenarioKey;
    } | null;

    if (!body?.document || !body?.activeScenario) {
      return NextResponse.json(
        { error: 'document and activeScenario are required.' },
        { status: 400 },
      );
    }

    const memo = await refreshInvestmentMemo({
      document: body.document,
      activeScenario: body.activeScenario,
    });

    return NextResponse.json(memo);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to refresh memo.' },
      { status: 500 },
    );
  }
}
