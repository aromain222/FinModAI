import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/pm/api/http';
import { updateAlert } from '@/lib/pm/alerts/alertStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const alert = await updateAlert(id, {
      acknowledged: true,
      acknowledgedAt: new Date().toISOString(),
    });
    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }
    return NextResponse.json({ alert });
  } catch (err) {
    return jsonError(err, 'Could not acknowledge alert');
  }
}
