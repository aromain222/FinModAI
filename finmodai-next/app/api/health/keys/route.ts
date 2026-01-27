import { NextResponse } from 'next/server';
import { keysPresent } from '@/lib/env/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return NextResponse.json({ ok: true, keys: keysPresent });
}
