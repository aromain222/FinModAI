import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export async function readJson(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new Error('INVALID_JSON');
  }
}

export function jsonError(error: unknown, fallback = 'Request failed', status = 400): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid request', details: error.flatten() }, { status: 400 });
  }
  if (error instanceof Error && error.message === 'INVALID_JSON') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status });
}
