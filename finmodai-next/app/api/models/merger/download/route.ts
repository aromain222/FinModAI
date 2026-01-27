/**
 * Merger Model Download API
 *
 * Delegates generation + storage to `runModel()` and redirects to the produced artifact URL.
 * Prefer using `/api/models/[modelId]/download` for a stable download entrypoint once the model exists.
 */

import { NextResponse } from 'next/server';
import { runModel, ModelRunError } from '@/lib/modeling/runModel';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const baseUrl = (() => {
    try {
      return new URL(req.url).origin;
    } catch {
      return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    }
  })();

  try {
    let body: any = await req.json();

    // Allow nested merger payloads (e.g. { mergerInputs: { ... } })
    if (body && typeof body === 'object' && body.mergerInputs && typeof body.mergerInputs === 'object') {
      body = { ...body.mergerInputs, ...body };
    }

    const run = await runModel({ modelType: 'merger', assumptions: body }, { baseUrl });
    return NextResponse.redirect(run.artifact.downloadUrl, 303);
  } catch (error: any) {
    if (error instanceof ModelRunError) {
      const payload: any = error.toResponseBody();
      const maybeBlocks = (error as any)?.cause;
      if (error.code === 'GUARDRAIL_BLOCKED' && Array.isArray(maybeBlocks)) {
        payload.blocks = maybeBlocks;
      }
      return NextResponse.json(payload, { status: error.httpStatus });
    }

    console.error('[merger download] Error:', error);
    return NextResponse.json(
      {
        error: error?.message || 'Failed to generate merger model Excel',
      },
      { status: 500 }
    );
  }
}
