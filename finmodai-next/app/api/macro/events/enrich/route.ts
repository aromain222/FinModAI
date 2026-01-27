/**
 * API endpoint to enrich macro events with LLM templates
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildEventFromTemplate, type MacroEventCategory } from '@/lib/view_models/macroEventBuilderHelpers';
import type { TemplateInputs } from '@/lib/view_models/macroEventTemplates';

export const runtime = 'nodejs';

type EnrichRequest = {
  events: Array<{
    category: MacroEventCategory;
    title: string;
    publishedAt: string;
    region: string;
  }>;
  inputs: {
    macroData?: {
      cpi?: number | null;
      unemployment?: number | null;
      fedFunds?: number | null;
    };
    marketData?: {
      spyReturn?: number | null;
      oilMove?: number | null;
      ratesMove?: number | null;
    };
    sources?: Array<{ name: string; url?: string }>;
  };
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as EnrichRequest;
    const { events, inputs } = body;

    const enriched = await Promise.all(
      events.map(async (event) => {
        const templateInputs: TemplateInputs = {
          headlineText: event.title,
          macroData: inputs.macroData,
          marketData: inputs.marketData,
          sources: inputs.sources,
          publishedAt: event.publishedAt,
        };

        return buildEventFromTemplate(
          event.category,
          templateInputs,
          event.publishedAt,
          event.region
        );
      })
    );

    return NextResponse.json({ events: enriched });
  } catch (error: any) {
    console.error('Event enrichment failed:', error);
    return NextResponse.json(
      { error: 'Enrichment failed', message: error?.message },
      { status: 500 }
    );
  }
}

