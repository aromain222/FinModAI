export interface DownloadWorkbookParams {
  modelId: string;
  ticker: string;
  modelType: string;
}

export async function downloadWorkbook(params: DownloadWorkbookParams): Promise<void> {
  const { modelId, ticker, modelType } = params;
  const filename = `${ticker}_${modelType}_${new Date().toISOString().split('T')[0]}.xlsx`;
  
  // Trigger download
  const link = document.createElement('a');
  link.href = `/api/models/${modelId}/download`;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
