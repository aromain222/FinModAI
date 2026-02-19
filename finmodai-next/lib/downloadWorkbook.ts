export interface DownloadWorkbookParams {
  modelId?: string;
  ticker: string;
  modelType: string;
  [key: string]: unknown;
}

export async function downloadWorkbook(params: DownloadWorkbookParams): Promise<void> {
  const { modelType, ticker, modelId: _modelId, ...rest } = params;
  const generatePayload = {
    ...rest,
    ticker,
    modelType,
  };

  // Step 1: idempotent generate
  const requestGenerate = async () => {
    const generateRes = await fetch(`/api/model-types/${modelType}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(generatePayload),
    });
    const genJson = await generateRes.json();
    if (!generateRes.ok) {
      throw new Error(genJson?.error || genJson?.message || 'Generation request failed');
    }
    return genJson;
  };

  let genJson = await requestGenerate();
  if (genJson.status === 'assumptions_required') {
    throw new Error('assumptions_required');
  }

  // Poll generation route briefly when run is still active
  let attempts = 0;
  while (genJson.status === 'generating' && attempts < 12) {
    await new Promise((resolve) => setTimeout(resolve, 750));
    genJson = await requestGenerate();
    attempts += 1;
  }

  if (genJson.status !== 'generated') {
    throw new Error(`Generation not ready: ${genJson.status}`);
  }

  const runId = genJson.runId;
  if (!runId) {
    throw new Error('Missing runId for download');
  }

  // Step 2: fetch fresh signed URL
  const dlRes = await fetch(`/api/model-runs/${runId}/download`, { method: 'POST' });
  const dlJson = await dlRes.json();
  if (!dlRes.ok) throw new Error(dlJson?.error || dlJson?.message || 'Download URL fetch failed');
  if (dlJson.status !== 'generated' || !dlJson.downloadUrl) throw new Error('Download not ready');

  const filename = `${ticker}_${modelType}_${new Date().toISOString().split('T')[0]}.xlsx`;
  const link = document.createElement('a');
  link.href = dlJson.downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
