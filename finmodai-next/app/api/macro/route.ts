import { NextResponse } from 'next/server';
import { fetchMacroSnapshot } from '@/lib/macroService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

export async function GET() {
  const data = await fetchMacroSnapshot();
  return NextResponse.json(data);
}
