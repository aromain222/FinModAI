import { NextResponse } from 'next/server';
import { generateInvestmentAnalysisFromPrompt } from '@/lib/investment-analysis/generateAnalysis';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { prompt?: string } | null;
    const prompt = body?.prompt?.trim() ?? '';

    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required.' }, { status: 400 });
    }

    const document = await generateInvestmentAnalysisFromPrompt(prompt);
    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate investment analysis.' },
      { status: 500 },
    );
  }
}
