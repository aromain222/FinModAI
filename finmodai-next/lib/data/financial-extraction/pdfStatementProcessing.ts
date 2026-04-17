import { extractPdfStatementPackage, type PdfStatementPackage } from '@/lib/analyst/pdfFinancialStatements';
import { extractPdfTextServer } from '@/lib/analyst/serverPdfExtraction';
import { extractPdfTextWithOcr, isFinancialExtractionOcrConfigured } from '@/lib/data/financial-extraction/ocrAdapter';

export type PdfStatementProcessingResult = {
  statementPackage: PdfStatementPackage | null;
  extractionMethod: 'pdf_text' | 'ocr' | 'none';
  warnings: string[];
  ocrProvider: string | null;
  pageRefs: number[];
};

function textNeedsOcr(text: string | null): boolean {
  if (!text) return true;
  const normalized = text.trim();
  if (normalized.length < 400) return true;
  const lineCount = normalized.split('\n').filter(Boolean).length;
  const numericLines = normalized
    .split('\n')
    .filter((line) => /\d/.test(line) && /[A-Za-z]{3,}/.test(line)).length;
  return lineCount < 12 || numericLines < 5;
}

export async function extractPdfStatementPackageWithFallback(params: {
  buffer: Buffer;
  fileId: string;
}): Promise<PdfStatementProcessingResult> {
  const extraction = await extractPdfTextServer(params.buffer);
  const warnings = [...extraction.warnings];
  const extractedText = extraction.text;
  const deterministicPackage = extractedText ? extractPdfStatementPackage(extractedText) : null;

  if (deterministicPackage && !textNeedsOcr(extractedText)) {
    return {
      statementPackage: deterministicPackage,
      extractionMethod: 'pdf_text',
      warnings,
      ocrProvider: null,
      pageRefs: [],
    };
  }

  if (!isFinancialExtractionOcrConfigured()) {
    return {
      statementPackage: deterministicPackage,
      extractionMethod: deterministicPackage ? 'pdf_text' : 'none',
      warnings,
      ocrProvider: null,
      pageRefs: [],
    };
  }

  const ocrResult = await extractPdfTextWithOcr({
    buffer: params.buffer,
    fileId: params.fileId,
  });
  if (!ocrResult?.text) {
    return {
      statementPackage: deterministicPackage,
      extractionMethod: deterministicPackage ? 'pdf_text' : 'none',
      warnings: [...warnings, ...(ocrResult?.warnings ?? [])],
      ocrProvider: ocrResult?.provider ?? null,
      pageRefs: ocrResult?.pageRefs ?? [],
    };
  }

  const ocrPackage = extractPdfStatementPackage(ocrResult.text);
  return {
    statementPackage: ocrPackage ?? deterministicPackage,
    extractionMethod: ocrPackage ? 'ocr' : deterministicPackage ? 'pdf_text' : 'none',
    warnings: [...warnings, ...ocrResult.warnings],
    ocrProvider: ocrResult.provider,
    pageRefs: ocrResult.pageRefs,
  };
}
