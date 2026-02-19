import { NextRequest, NextResponse } from 'next/server';
import { getRun, updateRun } from '@/lib/modelRunStore';
import { getSignedUrlForKey, objectExists } from '@/lib/storage/objectStore';

export async function POST(_req: NextRequest, { params }: { params: { runId: string } }) {
  const runId = String(params.runId || '');
  const run = getRun(runId);

  if (!run) {
    return NextResponse.json({ status: 'not_found', error: 'Run not found' }, { status: 404 });
  }

  if (run.status !== 'generated' || (!run.storageKey && !run.dataUrl)) {
    return NextResponse.json(
      {
        status: run.status,
        message: run.status === 'failed' ? run.errorMessage || 'Generation failed' : 'Run is not ready for download',
      },
      { status: 409 }
    );
  }

  try {
    if (run.storageKey) {
      const exists = await objectExists(run.storageKey);
      console.log('[model-run-download] existence check', { runId: run.id, storageKey: run.storageKey, exists });
      if (!exists) {
        updateRun(run.id, { status: 'failed', errorMessage: 'Stored workbook could not be found' });
        return NextResponse.json(
          { status: 'failed', error: 'Workbook not found in storage' },
          { status: 410 }
        );
      }

      const downloadUrl = await getSignedUrlForKey(run.storageKey, 900);
      return NextResponse.json({ status: 'generated', runId: run.id, downloadUrl });
    }

    return NextResponse.json({ status: 'generated', runId: run.id, downloadUrl: run.dataUrl });
  } catch (error: any) {
    updateRun(run.id, {
      status: 'failed',
      errorMessage: error?.message || 'Failed to sign download URL',
    });
    return NextResponse.json(
      { status: 'failed', error: error?.message || 'Failed to sign download URL' },
      { status: 500 }
    );
  }
}
