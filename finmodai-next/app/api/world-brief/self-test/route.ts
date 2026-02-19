import { NextResponse } from 'next/server';
import { runWorldBriefValidationFixtures } from '@/lib/worldBrief';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = runWorldBriefValidationFixtures();
  return NextResponse.json(
    {
      ok: result.ok,
      checks: {
        whatHappenedSentenceCount: result.whatLen,
        marketImpactSentenceCount: result.marketLen,
      },
    },
    { status: result.ok ? 200 : 500 }
  );
}
