import { NextResponse } from 'next/server';
import { supabaseRouteClient } from '@/lib/supabase/server';
import type { ModelRow } from '@/types/modelContracts';
import type { PreviewV3 } from '@/types/preview-v3';
import { extractPreviewCandidates, buildPreviewV3FromUnknown } from '@/lib/preview/previewV3';

export async function GET(_: Request, { params }: { params: { modelId: string } }) {
  const { modelId } = params;
  let chosenPath: string | undefined;
  let candidatePaths: string[] = [];
  let preview: PreviewV3 | null = null;
  let reason: string | undefined;
  let rawType: string | undefined;
  let rawKeys: string[] | undefined;
  let rowCountBeforeCap: number | undefined;
  let colCountBeforeCap: number | undefined;

  try {
    const supabase = supabaseRouteClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const devBypass = process.env.NODE_ENV !== 'production' && process.env.BYPASS_AUTH === '1';
    const effectiveUserId = devBypass ? '00000000-0000-0000-0000-000000000000' : session?.user?.id;
    
    if (!effectiveUserId) {
      reason = 'unauthorized';
      console.log('[PREVIEW_V3]', { modelId, ok: true, reason, chosenPath, rows: 0, cols: 0, truncated: false });
      return NextResponse.json({ ok: true, modelId, status: null, preview_v3: null, reason });
    }

    const { data: model } = await supabase
      .from<ModelRow>('models')
      .select('id, user_id, status, preview, results')
      .eq('id', modelId)
      .eq('user_id', effectiveUserId)
      .maybeSingle();

    if (!model) {
      reason = 'not_found';
      console.log('[PREVIEW_V3]', { modelId, ok: true, reason, chosenPath, rows: 0, cols: 0, truncated: false });
      return NextResponse.json({ ok: true, modelId, status: null, preview_v3: null, reason });
    }

    // Parse strings if needed
    let results: any = model.results;
    if (typeof results === 'string') {
      try {
        results = JSON.parse(results);
      } catch {
        // leave as string
      }
    }
    let previewRaw: any = model.preview;
    if (typeof previewRaw === 'string') {
      try {
        previewRaw = JSON.parse(previewRaw);
      } catch {
        // leave as string
      }
    }

    const candidates = extractPreviewCandidates({ ...model, results, preview: previewRaw });
    candidatePaths = candidates.map((c) => c.path);
    for (const candidate of candidates) {
      const meta = buildPreviewV3FromUnknown(candidate.value);
      if (meta.preview) {
        preview = meta.preview;
        chosenPath = candidate.path;
        rawType = typeof candidate.value;
        rawKeys = candidate.value && typeof candidate.value === 'object' ? Object.keys(candidate.value) : undefined;
        rowCountBeforeCap = meta.meta?.rowCountBeforeCap ?? meta.preview.stats?.rowCount;
        colCountBeforeCap = meta.meta?.colCountBeforeCap ?? meta.preview.stats?.colCount;
        break;
      }
      if (!reason) reason = meta.reason;
    }

    if (!preview) {
      reason = reason || 'missing_preview';
    }

    console.log('[PREVIEW_V3]', {
      modelId,
      ok: true,
      reason,
      chosenPath,
      rows: preview?.rows.length ?? 0,
      cols: preview?.columns.length ?? 0,
      truncated: preview?.stats?.truncated ?? false,
    });

    const debug =
      process.env.NODE_ENV !== 'production'
        ? {
            candidatePathsTried: candidatePaths,
            chosenPath,
            rawType,
            rawKeys,
            rowCountBeforeCap,
            colCountBeforeCap,
            truncated: preview?.stats?.truncated ?? false,
          }
        : undefined;

    return NextResponse.json({
      ok: true,
      modelId,
      status: model.status,
      preview_v3: preview,
      reason: preview ? null : reason,
      ...(debug ? { debug } : {}),
    });
  } catch (error: any) {
    reason = error?.message || 'unknown_error';
    console.log('[PREVIEW_V3]', { modelId, ok: true, reason, chosenPath, rows: 0, cols: 0, truncated: false });
    return NextResponse.json({
      ok: true,
      modelId,
      status: null,
      preview_v3: null,
      reason,
    });
  }
}
