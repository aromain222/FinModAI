'use client';

export type DownloadWorkbookParams = {
  ticker: string;
  modelType: string;
  modelId: string;
};

/**
 * Download result type for expected vs unexpected failures
 */
export type DownloadResult = 
  | { success: true }
  | { 
      success: false; 
      expected: true; // Expected failure (guest mode, etc.) - show UI message, don't throw
      message: string;
      code?: string;
    }
  | { 
      success: false; 
      expected: false; // Unexpected failure (network, server error) - throw
      error: Error;
    };

/**
 * Download workbook - direct browser download via API route
 * Uses Supabase session check on client side, then navigates to download endpoint
 */
export async function downloadWorkbook(params: DownloadWorkbookParams): Promise<DownloadResult> {
  if (!params.modelId || typeof params.modelId !== 'string' || params.modelId.trim().length === 0) {
    return {
      success: false,
      expected: true,
      message: 'Missing model identifier. Please regenerate the model and try again.',
      code: 'MODEL_ID_MISSING',
    };
  }
  const endpoint = `/api/models/${encodeURIComponent(params.modelId)}/download`;
  try {
    const response = await fetch(endpoint, { credentials: 'include' });

    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const payload = await response.json().catch(() => null);
      if (payload?.url) {
        window.location.href = payload.url;
        return { success: true };
      }
    }

    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : null;
    const message =
      (payload && (payload.error || payload.message)) ||
      `Unable to download (status ${response.status}).`;
    console.error('[downloadWorkbook] failed', { status: response.status, message });
    return {
      success: false,
      expected: true,
      message,
      code: response.status.toString(),
    };
  } catch (error: any) {
    return {
      success: false,
      expected: false,
      error: error instanceof Error ? error : new Error(error?.message || 'Download failed'),
    };
  }
}
