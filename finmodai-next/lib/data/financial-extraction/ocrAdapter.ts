import path from 'node:path';

export type OcrPdfExtractionResult = {
  text: string | null;
  provider: string;
  warnings: string[];
  pageRefs: number[];
};

function getConfiguredProvider(): string | null {
  const provider = process.env.FINANCIAL_EXTRACTION_OCR_PROVIDER?.trim();
  return provider ? provider : null;
}

export function isFinancialExtractionOcrConfigured(): boolean {
  const provider = getConfiguredProvider();
  if (!provider) return false;
  if (provider !== 'custom_http') return false;
  return Boolean(
    process.env.FINANCIAL_EXTRACTION_OCR_URL?.trim() &&
      process.env.FINANCIAL_EXTRACTION_OCR_API_KEY?.trim(),
  );
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
    : [];
}

export async function extractPdfTextWithOcr(params: {
  buffer: Buffer;
  fileId: string;
}): Promise<OcrPdfExtractionResult | null> {
  const provider = getConfiguredProvider();
  if (!provider) return null;

  if (provider !== 'custom_http') {
    throw new Error(`Unsupported OCR provider "${provider}".`);
  }

  const endpoint = process.env.FINANCIAL_EXTRACTION_OCR_URL?.trim();
  const apiKey = process.env.FINANCIAL_EXTRACTION_OCR_API_KEY?.trim();
  if (!endpoint || !apiKey) {
    throw new Error('Custom OCR provider is configured without URL or API key.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      filename: path.basename(params.fileId),
      mimeType: 'application/pdf',
      task: 'financial_statement_extraction',
      fileBase64: params.buffer.toString('base64'),
    }),
  });

  if (!response.ok) {
    throw new Error(`OCR provider request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    text?: unknown;
    warnings?: unknown;
    pageRefs?: unknown;
  };
  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  if (!text) {
    return {
      text: null,
      provider,
      warnings: ['OCR provider returned no readable text.'],
      pageRefs: readNumberArray(payload?.pageRefs),
    };
  }

  return {
    text,
    provider,
    warnings: readStringArray(payload?.warnings),
    pageRefs: readNumberArray(payload?.pageRefs),
  };
}
