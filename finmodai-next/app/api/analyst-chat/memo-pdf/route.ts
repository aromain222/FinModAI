import { NextResponse } from 'next/server';

import { createReportPdf } from '@/lib/reportPdf';

export const runtime = 'nodejs';

type MemoPdfRequest = {
  title?: string;
  prompt?: string;
  content?: string;
  sources?: string[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MemoPdfRequest;
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const title = typeof body.title === 'string' && body.title.trim().length > 0
      ? body.title.trim()
      : 'CapitalBase Analyst Memo';
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const sources = Array.isArray(body.sources)
      ? body.sources.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).slice(0, 8)
      : [];

    const sourceBody = sources.length > 0 ? sources.map((source) => `- ${source}`).join('\n') : 'No sources attached.';
    const pdfBuffer = await createReportPdf(
      {
        title,
        summaryText: content,
        subtitle: new Date().toISOString().slice(0, 10),
        sections: [
          ...(prompt ? [{ title: 'Prompt Run', body: prompt }] : []),
          { title: 'Memo', body: content },
          { title: 'Sources', body: sourceBody },
        ],
      },
      {
        companyName: title,
        asOfDate: new Date().toISOString().slice(0, 10),
      },
    );

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizeFilename(title)}.pdf"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build memo PDF';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '') || 'capitalbase_analyst_memo';
}
