export type AttachmentKind = 'earnings_report' | 'model_workbook' | 'spreadsheet' | 'document';

export type UploadedAttachmentContext = {
  name: string;
  mimeType: string;
  sizeKb: number;
  kind: AttachmentKind;
  summary: string;
  warnings: string[];
  rawText?: string;
  rawBase64?: string;
};

function sanitizeText(input: string): string {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function inferKind(name: string, mimeType: string, summary: string): AttachmentKind {
  const haystack = `${name} ${mimeType} ${summary}`.toLowerCase();
  if (
    /\b(earnings|results|guidance|quarter|quarterly|transcript|shareholder letter|10-q|10q|8-k|8k)\b/.test(haystack)
  ) {
    return 'earnings_report';
  }
  if (
    /\b(dcf|discounted cash flow|three statement|three-statement|3 statement|income statement|balance sheet|cash flow|lbo|comps|valuation|scorecard|model)\b/.test(
      haystack,
    )
  ) {
    return 'model_workbook';
  }
  if (/\b(sheet|tab|csv|spreadsheet|xlsx|xls)\b/.test(haystack)) {
    return 'spreadsheet';
  }
  return 'document';
}

function summarizePlainText(text: string, maxChars = 6000): string {
  return truncate(sanitizeText(text), maxChars);
}

function decodePdfLiteral(raw: string): string {
  return raw
    .replace(/\\([\\()])/g, '$1')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, ' ')
    .replace(/\\f/g, ' ');
}

function extractPdfText(buffer: ArrayBuffer): string {
  const ascii = sanitizeText(new TextDecoder('latin1').decode(buffer));
  const literalMatches = Array.from(ascii.matchAll(/\(([^()]*)\)\s*Tj/g)).map((match) => decodePdfLiteral(match[1]));
  const arrayMatches = Array.from(ascii.matchAll(/\[(.*?)\]\s*TJ/g)).flatMap((match) =>
    Array.from(match[1].matchAll(/\(([^()]*)\)/g)).map((item) => decodePdfLiteral(item[1])),
  );

  const extracted = sanitizeText([...literalMatches, ...arrayMatches].join(' '));
  if (extracted.length >= 200) return truncate(extracted, 7000);

  const printableLines = ascii
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /[A-Za-z]{3,}/.test(line) && !/^%PDF/i.test(line) && !/^endobj$/i.test(line))
    .slice(0, 120);
  return truncate(sanitizeText(printableLines.join(' ')), 7000);
}

function summarizeTableRows(rows: unknown[][], maxRows = 12): string[] {
  const lines: string[] = [];
  for (const row of rows) {
    const cells = row
      .map((cell) => (cell == null ? '' : String(cell).trim()))
      .filter(Boolean)
      .slice(0, 8);
    if (cells.length === 0) continue;
    lines.push(cells.join(' | '));
    if (lines.length >= maxRows) break;
  }
  return lines;
}

async function summarizeWorkbook(file: File): Promise<{ summary: string; warnings: string[] }> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', raw: false, cellText: true, cellDates: true });
  const sheetNames = workbook.SheetNames.slice(0, 4);
  const sections: string[] = [];

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      blankrows: false,
      defval: '',
    }) as unknown[][];
    const preview = summarizeTableRows(rows.slice(0, 25));
    if (preview.length > 0) {
      sections.push(`Sheet: ${sheetName}\n${preview.map((line) => `- ${line}`).join('\n')}`);
    }
  }

  const summary = [
    `Workbook file: ${file.name}`,
    `Sheet names: ${sheetNames.join(', ') || 'Unavailable'}`,
    sections.join('\n\n'),
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    summary: truncate(sanitizeText(summary), 7000),
    warnings: sheetNames.length === 0 ? ['No readable sheets found in workbook.'] : [],
  };
}

export async function parseUploadedAttachment(file: File): Promise<UploadedAttachmentContext> {
  const sizeKb = Math.max(1, Math.round(file.size / 1024));
  const mimeType = file.type || 'application/octet-stream';
  const warnings: string[] = [];

  let summary = '';
  let rawText: string | undefined;
  let rawBase64: string | undefined;

  if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    /\.xlsx?$/i.test(file.name)
  ) {
    const workbookSummary = await summarizeWorkbook(file);
    summary = workbookSummary.summary;
    warnings.push(...workbookSummary.warnings);
  } else if (mimeType === 'text/csv' || /\.csv$/i.test(file.name)) {
    rawText = truncate(await file.text(), 120000);
    summary = summarizePlainText(rawText);
  } else if (mimeType === 'text/plain' || /\.txt$/i.test(file.name) || /\.md$/i.test(file.name)) {
    rawText = truncate(await file.text(), 120000);
    summary = summarizePlainText(rawText);
  } else if (mimeType === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const arrayBuffer = await file.arrayBuffer();
    summary = extractPdfText(arrayBuffer);
    rawBase64 = arrayBufferToBase64(arrayBuffer);
    if (summary.length < 200) {
      warnings.push('Client-side PDF preview extraction was limited; server-side extraction will be used for the full chat context.');
    }
  } else {
    rawText = truncate(await file.text().catch(() => ''), 120000);
    summary = summarizePlainText(rawText);
    if (!summary) {
      warnings.push('This file type could not be parsed cleanly. Only metadata was captured.');
    }
  }

  if (!summary) {
    summary = `Uploaded file: ${file.name}`;
  }

  const kind = inferKind(file.name, mimeType, summary);
  return {
    name: file.name,
    mimeType,
    sizeKb,
    kind,
    summary: truncate(summary, 7000),
    warnings,
    ...(rawText ? { rawText } : {}),
    ...(rawBase64 ? { rawBase64 } : {}),
  };
}
