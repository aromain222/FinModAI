import { NextRequest, NextResponse } from 'next/server';
import { updateModelNotes } from '@/lib/modelsRepo';

type RouteContext = {
  params: { modelId: string };
};

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { modelId } = params;
  const body = await req.json();
  const notes = typeof body?.notes === 'string' ? body.notes : '';
  try {
    const updated = await updateModelNotes(modelId, notes);
    return NextResponse.json({ success: true, model: updated });
  } catch (error) {
    console.error('Failed to update notes', error);
    return NextResponse.json({ error: 'Unable to update notes' }, { status: 500 });
  }
}
