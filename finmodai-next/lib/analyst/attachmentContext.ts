import {
  extractPdfStatementPackage,
  type AttachmentStatementSnapshot,
  type PdfStatementPackage,
} from '@/lib/analyst/pdfFinancialStatements';
import {
  assessPdfStatementExtraction,
  type StatementExtractionStatus,
} from '@/lib/analyst/pdfModelSeeding';
import {
  buildFilingPacket,
  classifyAttachmentFiling,
  type FilingClassification,
  type FilingPacket,
} from '@/lib/analyst/filingClassification';

export type AttachmentKind = 'earnings_report' | 'model_workbook' | 'spreadsheet' | 'document';

export type AttachmentSignals = {
  companyName?: string;
  ticker?: string;
  modelTypeHint?: 'DCF' | 'THREE_STATEMENT' | 'COMPS' | 'LBO' | 'SCORECARD';
  fiscalPeriod?: string;
  keyLines: string[];
  extractedMetrics?: Array<{ label: string; value: string }>;
};

export type UploadedAttachmentContext = {
  name: string;
  mimeType: string;
  sizeKb: number;
  kind: AttachmentKind;
  summary: string;
  warnings: string[];
  rawText?: string;
  rawBase64?: string;
  signals?: AttachmentSignals;
  statementPackage?: PdfStatementPackage;
  statementExtractionStatus?: StatementExtractionStatus;
  statementExtractionWarnings?: string[];
  isFinancialModelSeedable?: boolean;
  filingClassification?: FilingClassification;
  filingPacket?: FilingPacket;
};

const MAX_SPREADSHEET_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_WORKBOOK_SHEETS = 4;
const MAX_WORKBOOK_PREVIEW_ROWS = 25;
const MAX_WORKBOOK_PREVIEW_COLS = 12;
const MAX_WORKBOOK_ALLOWED_ROWS = 2000;
const MAX_WORKBOOK_ALLOWED_COLS = 100;

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

function inferModelTypeHint(text: string): AttachmentSignals['modelTypeHint'] | undefined {
  const lower = text.toLowerCase();
  if (/\bscorecard\b/.test(lower)) return 'SCORECARD';
  if (/\blbo\b|leveraged buyout|sources and uses|deleveraging/.test(lower)) return 'LBO';
  if (/\bcomps\b|comparable company|ev \/ ebitda|ev \/ revenue|p \/ e/.test(lower)) return 'COMPS';
  if (/\bthree[- ]statement\b|\b3[- ]statement\b|income statement|balance sheet|cash flow statement/.test(lower)) {
    return 'THREE_STATEMENT';
  }
  if (/\bdcf\b|discounted cash flow|terminal value|wacc|fcff/.test(lower)) return 'DCF';
  return undefined;
}

function extractCompanySignal(text: string): { companyName?: string; ticker?: string } {
  const compact = sanitizeText(text);
  const namedTicker = compact.match(/\b([A-Z][A-Za-z0-9&.,' -]{2,80})\s+\(([A-Z]{1,5})\)\b/);
  if (namedTicker) {
    return {
      companyName: namedTicker[1].trim(),
      ticker: namedTicker[2].trim(),
    };
  }
  const tickerLabel = compact.match(/\bTicker\b[:| ]+([A-Z]{1,5})\b/i);
  if (tickerLabel) {
    return { ticker: tickerLabel[1].toUpperCase() };
  }
  return {};
}

function extractFiscalPeriod(text: string): string | undefined {
  const match = text.match(/\b(Q[1-4]\s*(?:FY)?\s*\d{2,4}|FY\s*\d{2,4}|fiscal\s+(?:year|quarter)\s+\d{2,4})\b/i);
  return match ? sanitizeText(match[1]) : undefined;
}

function extractKeyLines(text: string, maxLines = 6): string[] {
  const lines = text
    .split('\n')
    .map((line) => sanitizeText(line))
    .filter(Boolean);
  const matches = lines.filter((line) =>
    /\b(revenue|eps|ebitda|ebit|net income|fcff|guidance|margin|wacc|terminal|shares outstanding|enterprise value|equity value|cash flow|debt|capex)\b/i.test(
      line,
    ),
  );
  return (matches.length > 0 ? matches : lines).slice(0, maxLines);
}

function extractMetricValue(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = sanitizeText(match[1] ?? match[0]);
    if (value) return value;
  }
  return undefined;
}

function extractAttachmentMetrics(text: string): Array<{ label: string; value: string }> {
  const normalized = sanitizeText(text);
  const metrics: Array<{ label: string; value: string }> = [];

  const candidates: Array<{ label: string; patterns: RegExp[] }> = [
    {
      label: 'Revenue',
      patterns: [
        /\brevenue\b[^$\dA-Za-z]{0,12}(\$?\s?\d[\d,.\s]*(?:[MBT]|million|billion|trillion)?(?:\s*(?:yoy|YoY))?)/i,
      ],
    },
    {
      label: 'EPS',
      patterns: [
        /\bEPS\b[^$\dA-Za-z]{0,12}(\$?\s?\d[\d,.\s]*)/i,
        /\bearnings per share\b[^$\dA-Za-z]{0,12}(\$?\s?\d[\d,.\s]*)/i,
      ],
    },
    {
      label: 'EBITDA',
      patterns: [/\bEBITDA\b[^$\dA-Za-z]{0,12}(\$?\s?\d[\d,.\s]*(?:[MBT]|million|billion|trillion)?)/i],
    },
    {
      label: 'EBIT margin',
      patterns: [/\bEBIT margin\b[^%\dA-Za-z]{0,12}(\d[\d.,]*\s?%)/i],
    },
    {
      label: 'Operating margin',
      patterns: [/\boperating margin\b[^%\dA-Za-z]{0,12}(\d[\d.,]*\s?%)/i],
    },
    {
      label: 'Gross margin',
      patterns: [/\bgross margin\b[^%\dA-Za-z]{0,12}(\d[\d.,]*\s?%)/i],
    },
    {
      label: 'WACC',
      patterns: [/\bWACC\b[^%\dA-Za-z]{0,12}(\d[\d.,]*\s?%)/i],
    },
    {
      label: 'Terminal growth',
      patterns: [/\bterminal(?: growth| g)\b[^%\dA-Za-z]{0,12}(\d[\d.,]*\s?%)/i],
    },
    {
      label: 'Enterprise value',
      patterns: [/\benterprise value\b[^$\dA-Za-z]{0,12}(\$?\s?\d[\d,.\s]*(?:[MBT]|million|billion|trillion)?)/i],
    },
    {
      label: 'Equity value',
      patterns: [/\bequity value\b[^$\dA-Za-z]{0,12}(\$?\s?\d[\d,.\s]*(?:[MBT]|million|billion|trillion)?)/i],
    },
    {
      label: 'Implied share value',
      patterns: [
        /\bimplied (?:price|share value|value per share)\b[^$\dA-Za-z]{0,12}(\$?\s?\d[\d,.\s]*)/i,
        /\bper-share value\b[^$\dA-Za-z]{0,12}(\$?\s?\d[\d,.\s]*)/i,
      ],
    },
    {
      label: 'Guidance',
      patterns: [/\bguidance\b[^.\n]{0,140}/i],
    },
  ];

  for (const candidate of candidates) {
    const value = extractMetricValue(normalized, candidate.patterns);
    if (value) metrics.push({ label: candidate.label, value });
  }

  return metrics.slice(0, 8);
}

function buildSignals(text: string): AttachmentSignals | undefined {
  const company = extractCompanySignal(text);
  const fiscalPeriod = extractFiscalPeriod(text);
  const keyLines = extractKeyLines(text);
  const modelTypeHint = inferModelTypeHint(text);
  const extractedMetrics = extractAttachmentMetrics(text);

  if (!company.companyName && !company.ticker && !fiscalPeriod && !modelTypeHint && keyLines.length === 0 && extractedMetrics.length === 0) {
    return undefined;
  }

  return {
    ...company,
    ...(modelTypeHint ? { modelTypeHint } : {}),
    ...(fiscalPeriod ? { fiscalPeriod } : {}),
    keyLines,
    ...(extractedMetrics.length > 0 ? { extractedMetrics } : {}),
  };
}

function buildMetricsFromStatementSnapshot(snapshot: AttachmentStatementSnapshot): Array<{ label: string; value: string }> {
  const metrics: Array<{ label: string; value: string }> = [];
  const formatMoney = (value: number | null) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    return `$${Math.round(value).toLocaleString('en-US')}`;
  };
  const candidates: Array<[string, number | null]> = [
    ['Revenue', snapshot.revenue],
    ['EBITDA', snapshot.ebitda],
    ['Operating income', snapshot.operatingIncome],
    ['Net income', snapshot.netIncome],
    ['Cash', snapshot.cash],
    ['Total debt', snapshot.totalDebt],
  ];
  for (const [label, value] of candidates) {
    const formatted = formatMoney(value);
    if (formatted) metrics.push({ label, value: formatted });
  }
  return metrics.slice(0, 8);
}

function mergeSignalsWithStatementPackage(
  base: AttachmentSignals | undefined,
  statementPackage: PdfStatementPackage | undefined,
): AttachmentSignals | undefined {
  if (!statementPackage?.snapshot) return base;
  const snapshot = statementPackage.snapshot;
  const keyLines = [
    ...(base?.keyLines ?? []),
    ...statementPackage.incomeStatement.slice(0, 3).map((line) => line.rawLine),
    ...statementPackage.balanceSheet.slice(0, 2).map((line) => line.rawLine),
    ...statementPackage.cashFlowStatement.slice(0, 2).map((line) => line.rawLine),
  ].filter(Boolean).slice(0, 6);
  const extractedMetrics = buildMetricsFromStatementSnapshot(snapshot);
  return {
    companyName: base?.companyName ?? snapshot.companyName ?? undefined,
    ticker: base?.ticker ?? snapshot.ticker ?? undefined,
    modelTypeHint: base?.modelTypeHint ?? 'THREE_STATEMENT',
    fiscalPeriod: base?.fiscalPeriod ?? snapshot.fiscalPeriod ?? undefined,
    keyLines,
    ...(extractedMetrics.length > 0 ? { extractedMetrics } : base?.extractedMetrics ? { extractedMetrics: base.extractedMetrics } : {}),
  };
}

function deriveFilingMetadata(params: {
  name: string;
  mimeType: string;
  kind: AttachmentKind;
  summary: string;
  rawText?: string;
  signals?: AttachmentSignals;
  statementPackage?: PdfStatementPackage;
}): Pick<UploadedAttachmentContext, 'filingClassification' | 'filingPacket'> {
  const filingClassification = classifyAttachmentFiling({
    name: params.name,
    mimeType: params.mimeType,
    summary: params.summary,
    rawText: params.rawText,
    kind: params.kind,
    signals: params.signals,
    statementPackage: params.statementPackage,
  });
  const filingPacket = buildFilingPacket({
    attachmentName: params.name,
    kind: params.kind,
    classification: filingClassification,
    signals: params.signals,
    statementPackage: params.statementPackage,
  });
  return {
    filingClassification,
    ...(filingPacket ? { filingPacket } : {}),
  };
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
  const warnings: string[] = [];
  const summaryPrefix = [`Workbook file: ${file.name}`];
  if (file.size > MAX_SPREADSHEET_SIZE_BYTES) {
    warnings.push(`Workbook preview skipped because the file exceeds the ${Math.round(MAX_SPREADSHEET_SIZE_BYTES / (1024 * 1024))} MB analysis limit.`);
    return {
      summary: summaryPrefix.join('\n\n'),
      warnings,
    };
  }

  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  let workbook: Awaited<ReturnType<typeof XLSX.read>>;
  try {
    workbook = XLSX.read(buffer, { type: 'array', raw: false, cellText: true, cellDates: true });
  } catch {
    warnings.push('Workbook preview could not be parsed. Only file metadata was captured.');
    return {
      summary: summaryPrefix.join('\n\n'),
      warnings,
    };
  }

  const allSheetNames = workbook.SheetNames;
  const sheetNames = allSheetNames.slice(0, MAX_WORKBOOK_SHEETS);
  const sections: string[] = [];

  summaryPrefix.push(`Sheet names: ${sheetNames.join(', ') || 'Unavailable'}`);
  if (allSheetNames.length > MAX_WORKBOOK_SHEETS) {
    warnings.push(`Workbook preview limited to the first ${MAX_WORKBOOK_SHEETS} sheets out of ${allSheetNames.length}.`);
  }

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    let previewRange: string | undefined;
    const ref = sheet['!ref'];
    if (typeof ref === 'string') {
      const decodedRange = XLSX.utils.decode_range(ref);
      const rowCount = decodedRange.e.r - decodedRange.s.r + 1;
      const colCount = decodedRange.e.c - decodedRange.s.c + 1;
      if (rowCount > MAX_WORKBOOK_ALLOWED_ROWS || colCount > MAX_WORKBOOK_ALLOWED_COLS) {
        warnings.push(
          `Sheet "${sheetName}" preview was truncated from ${rowCount} rows x ${colCount} columns to a safe preview window.`,
        );
      }
      previewRange = XLSX.utils.encode_range({
        s: { r: decodedRange.s.r, c: decodedRange.s.c },
        e: {
          r: Math.min(decodedRange.e.r, decodedRange.s.r + MAX_WORKBOOK_PREVIEW_ROWS - 1),
          c: Math.min(decodedRange.e.c, decodedRange.s.c + MAX_WORKBOOK_PREVIEW_COLS - 1),
        },
      });
    }

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      blankrows: false,
      defval: '',
      ...(previewRange ? { range: previewRange } : {}),
    }) as unknown[][];
    const preview = summarizeTableRows(rows.slice(0, MAX_WORKBOOK_PREVIEW_ROWS));
    if (preview.length > 0) {
      sections.push(`Sheet: ${sheetName}\n${preview.map((line) => `- ${line}`).join('\n')}`);
    }
  }

  const summary = [
    ...summaryPrefix,
    sections.join('\n\n'),
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    summary: truncate(sanitizeText(summary), 7000),
    warnings: [...warnings, ...(sheetNames.length === 0 ? ['No readable sheets found in workbook.'] : [])],
  };
}

export async function parseUploadedAttachment(file: File): Promise<UploadedAttachmentContext> {
  const sizeKb = Math.max(1, Math.round(file.size / 1024));
  const mimeType = file.type || 'application/octet-stream';
  const warnings: string[] = [];

  let summary = '';
  let rawText: string | undefined;
  let rawBase64: string | undefined;
  let statementPackage: PdfStatementPackage | undefined;
  let statementExtractionStatus: StatementExtractionStatus | undefined;
  let statementExtractionWarnings: string[] = [];
  let isFinancialModelSeedable: boolean | undefined;

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
    statementPackage = extractPdfStatementPackage(summary) ?? undefined;
    const extractionAssessment = assessPdfStatementExtraction({
      statementPackage,
      authoritative: false,
    });
    statementExtractionStatus = extractionAssessment.statementExtractionStatus;
    statementExtractionWarnings = extractionAssessment.statementExtractionWarnings;
    isFinancialModelSeedable = extractionAssessment.isFinancialModelSeedable;
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
  const signals = mergeSignalsWithStatementPackage(
    buildSignals(`${summary}\n\n${rawText ?? ''}`.slice(0, 16000)),
    statementPackage,
  );
  const filingMetadata = deriveFilingMetadata({
    name: file.name,
    mimeType,
    kind,
    summary: truncate(summary, 7000),
    rawText,
    signals,
    statementPackage,
  });
  return {
    name: file.name,
    mimeType,
    sizeKb,
    kind,
    summary: truncate(summary, 7000),
    warnings,
    ...(rawText ? { rawText } : {}),
    ...(rawBase64 ? { rawBase64 } : {}),
    ...(signals ? { signals } : {}),
    ...(statementPackage ? { statementPackage } : {}),
    ...(statementExtractionStatus ? { statementExtractionStatus } : {}),
    ...(statementExtractionWarnings.length > 0 ? { statementExtractionWarnings } : {}),
    ...(typeof isFinancialModelSeedable === 'boolean' ? { isFinancialModelSeedable } : {}),
    ...filingMetadata,
  };
}
