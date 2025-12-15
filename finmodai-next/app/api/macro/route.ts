import { NextResponse } from 'next/server';
import { fetchMacroSnapshot } from '@/lib/macroService';

export async function GET() {
  const data = await fetchMacroSnapshot();
  return NextResponse.json(data);
}
