export type PdfStatementKind = 'income_statement' | 'balance_sheet' | 'cash_flow_statement';

export type PdfStatementUnits = 'actual' | 'thousands' | 'millions';

export type PdfStatementPeriodType = 'quarter' | 'annual' | 'ttm' | 'unknown';

export type PdfStatementConfidence = 'low' | 'medium' | 'high';

export type PdfStatementLine = {
  statement: PdfStatementKind;
  normalizedLabel: string;
  label: string;
  value: number;
  rawValue: string;
  page: number | null;
  lineNumber: number;
  rawLine: string;
};

export type AttachmentStatementSnapshot = {
  source: 'attachment_pdf_statement';
  companyName: string | null;
  ticker: string | null;
  reportEndDate: string | null;
  fiscalPeriod: string | null;
  periodType: PdfStatementPeriodType;
  units: PdfStatementUnits;
  currency: 'USD' | 'unknown';
  annualizedFromQuarter: boolean;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  ebitda: number | null;
  netIncome: number | null;
  cash: number | null;
  totalDebt: number | null;
  sharesOutstanding: number | null;
  capex: number | null;
  depreciationAndAmortization: number | null;
  warnings: string[];
};

export type PdfStatementPackage = {
  companyName: string | null;
  ticker: string | null;
  reportEndDate: string | null;
  fiscalPeriod: string | null;
  periodType: PdfStatementPeriodType;
  units: PdfStatementUnits;
  currency: 'USD' | 'unknown';
  confidence: PdfStatementConfidence;
  warnings: string[];
  missingStatements: PdfStatementKind[];
  incomeStatement: PdfStatementLine[];
  balanceSheet: PdfStatementLine[];
  cashFlowStatement: PdfStatementLine[];
  snapshot: AttachmentStatementSnapshot | null;
};

type StatementAlias = {
  statement: PdfStatementKind;
  normalizedLabel: string;
  patterns: RegExp[];
};

const SECTION_HEADINGS: Array<{ statement: PdfStatementKind; pattern: RegExp }> = [
  { statement: 'income_statement', pattern: /\b(?:income statements?|statements? of operations|results of operations)\b/i },
  { statement: 'balance_sheet', pattern: /\b(?:balance sheets?|statements? of financial position)\b/i },
  { statement: 'cash_flow_statement', pattern: /\b(?:cash flow statements?|statements? of cash flows)\b/i },
];

const STATEMENT_ALIASES: StatementAlias[] = [
  {
    statement: 'income_statement',
    normalizedLabel: 'revenue',
    patterns: [/\b(?:revenue|net sales|total revenue|sales)\b/i],
  },
  {
    statement: 'income_statement',
    normalizedLabel: 'gross_profit',
    patterns: [/\b(?:gross profit|gross margin dollars?)\b/i],
  },
  {
    statement: 'income_statement',
    normalizedLabel: 'operating_income',
    patterns: [/\b(?:operating income|income from operations|operating profit)\b/i],
  },
  {
    statement: 'income_statement',
    normalizedLabel: 'ebitda',
    patterns: [/\bebitda\b/i],
  },
  {
    statement: 'income_statement',
    normalizedLabel: 'net_income',
    patterns: [/\b(?:net income|net earnings|net loss attributable to|net loss)\b/i],
  },
  {
    statement: 'income_statement',
    normalizedLabel: 'shares_outstanding',
    patterns: [/\b(?:weighted average shares|diluted weighted average shares|shares outstanding)\b/i],
  },
  {
    statement: 'balance_sheet',
    normalizedLabel: 'cash',
    patterns: [/\b(?:cash and cash equivalents|cash equivalents|cash)\b/i],
  },
  {
    statement: 'balance_sheet',
    normalizedLabel: 'short_term_debt',
    patterns: [/\b(?:short term debt|short-term debt|current portion of long term debt|current portion of long-term debt)\b/i],
  },
  {
    statement: 'balance_sheet',
    normalizedLabel: 'long_term_debt',
    patterns: [/\b(?:long term debt|long-term debt)\b/i],
  },
  {
    statement: 'balance_sheet',
    normalizedLabel: 'total_debt',
    patterns: [/\b(?:total debt|debt obligations|borrowings)\b/i],
  },
  {
    statement: 'cash_flow_statement',
    normalizedLabel: 'capex',
    patterns: [/\b(?:capital expenditures|purchases of property and equipment|additions to property and equipment)\b/i],
  },
  {
    statement: 'cash_flow_statement',
    normalizedLabel: 'depreciation_and_amortization',
    patterns: [/\b(?:depreciation and amortization|depreciation & amortization|depreciation)\b/i],
  },
];

function sanitizeText(input: string): string {
  return input.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

function sanitizeLine(input: string): string {
  return sanitizeText(input).replace(/[^\x20-\x7E]/g, ' ').trim();
}

function detectUnits(text: string): PdfStatementUnits {
  const head = text.slice(0, 2500).toLowerCase();
  if (/\bin millions\b[^.\n]{0,120}\bexcept\b[^.\n]{0,120}\bshares?\b[^.\n]{0,120}\bthousands\b/.test(head)) return 'millions';
  if (/\bin thousands\b[^.\n]{0,120}\bexcept\b[^.\n]{0,120}\bshares?\b[^.\n]{0,120}\bmillions\b/.test(head)) return 'thousands';
  if (/\bin millions\b/.test(head) || /\$\s+in millions\b/.test(head)) return 'millions';
  if (/\bin thousands\b/.test(head)) return 'thousands';
  return 'actual';
}

function detectShareCountUnits(text: string, statementUnits: PdfStatementUnits): PdfStatementUnits {
  const head = text.slice(0, 2500).toLowerCase();
  if (/\bshares?\b[^.\n]{0,120}\breflected in thousands\b/.test(head)) return 'thousands';
  if (/\bexcept\b[^.\n]{0,120}\bshares?\b[^.\n]{0,120}\bthousands\b/.test(head)) return 'thousands';
  if (/\bshares?\b[^.\n]{0,120}\breflected in millions\b/.test(head)) return 'millions';
  if (/\bexcept\b[^.\n]{0,120}\bshares?\b[^.\n]{0,120}\bmillions\b/.test(head)) return 'millions';
  return statementUnits;
}

function detectCurrency(text: string): 'USD' | 'unknown' {
  const head = text.slice(0, 2500);
  return /\bUSD\b|\$|US\$|U\.S\. dollars/i.test(head) ? 'USD' : 'unknown';
}

function detectPeriodType(text: string): PdfStatementPeriodType {
  const head = text.slice(0, 4000).toLowerCase();
  if (/\bttm\b|\btrailing twelve months\b/.test(head)) return 'ttm';
  if (/\bthree months ended\b|\bquarter ended\b|\bq[1-4]\b/.test(head)) return 'quarter';
  if (/\byear ended\b|\bfiscal year\b|\bannual\b/.test(head)) return 'annual';
  return 'unknown';
}

function detectFiscalPeriod(text: string): string | null {
  const match = text.match(/\b(Q[1-4]\s*(?:FY)?\s*\d{2,4}|FY\s*\d{2,4}|fiscal\s+(?:year|quarter)\s+\d{2,4})\b/i);
  if (match) return sanitizeText(match[1]);

  const quarterHead = text.match(/\bThree Months Ended\s+([A-Za-z]+ \d{1,2}, \d{4})/i);
  if (quarterHead) {
    const date = new Date(quarterHead[1]);
    if (!Number.isNaN(date.getTime())) {
      const month = date.getUTCMonth();
      const quarter = month <= 2 ? 1 : month <= 5 ? 2 : month <= 8 ? 3 : 4;
      return `Q${quarter} ${date.getUTCFullYear()}`;
    }
  }

  const yearHead = text.match(/\bYear Ended\s+([A-Za-z]+ \d{1,2}, \d{4})/i);
  if (yearHead) {
    const date = new Date(yearHead[1]);
    if (!Number.isNaN(date.getTime())) {
      return `FY ${date.getUTCFullYear()}`;
    }
  }

  return null;
}

function detectReportEndDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const dateMatch = text.match(/\b(?:Three Months Ended|Year Ended|As of)\s+([A-Za-z]+ \d{1,2}, \d{4})/i);
  if (dateMatch) {
    const parsed = new Date(dateMatch[1]);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function detectCompany(text: string): { companyName: string | null; ticker: string | null } {
  const lines = text
    .split('\n')
    .map((line) => sanitizeLine(line))
    .filter(Boolean)
    .slice(0, 20);
  for (const line of lines) {
    const namedTicker = line.match(/^([A-Z][A-Za-z0-9&.,' -]{2,100})\s+\(([A-Z]{1,5})\)$/);
    if (namedTicker) {
      return { companyName: namedTicker[1].trim(), ticker: namedTicker[2].trim() };
    }
  }
  const headerMatch = text.match(/(?:^|\n)\s*([A-Z][A-Za-z0-9&.,' -]{2,100}?)\s+(?:CONDENSED\s+)?CONSOLIDATED\s+STATEMENTS?/i);
  if (headerMatch) {
    return { companyName: sanitizeText(headerMatch[1]), ticker: null };
  }
  const tickerOnly = text.match(/\bTicker\b[:| ]+([A-Z]{1,5})\b/i);
  return { companyName: null, ticker: tickerOnly ? tickerOnly[1].toUpperCase() : null };
}

function unitsMultiplier(units: PdfStatementUnits): number {
  if (units === 'millions') return 1_000_000;
  if (units === 'thousands') return 1_000;
  return 1;
}

function scoreTextLayer(lines: string[]): boolean {
  const nonEmpty = lines.filter((line) => line.length > 0);
  const numericDense = nonEmpty.filter((line) => /\d/.test(line)).length;
  const alphaDense = nonEmpty.filter((line) => /[A-Za-z]{3,}/.test(line)).length;
  const hasStatementHeading = nonEmpty.some((line) => SECTION_HEADINGS.some((heading) => heading.pattern.test(line)));
  return (
    (nonEmpty.length >= 10 && numericDense >= 6 && alphaDense >= 6) ||
    (hasStatementHeading && numericDense >= 5 && alphaDense >= 5)
  );
}

function parseValueToken(raw: string, units: PdfStatementUnits): number | null {
  const cleaned = raw.replace(/\$/g, '').replace(/,/g, '').trim();
  if (!cleaned) return null;
  const negative = /^\(.+\)$/.test(cleaned) || /^-/.test(cleaned);
  const numeric = cleaned.replace(/[()]/g, '');
  const parsed = Number(numeric);
  if (!Number.isFinite(parsed)) return null;
  const signed = negative ? -Math.abs(parsed) : parsed;
  return signed * unitsMultiplier(units);
}

function extractCandidateValues(line: string): Array<{ raw: string; value: number }> {
  const matches = line.match(/(?:\(\$?\d[\d,]*(?:\.\d+)?\)|-?\$?\d[\d,]*(?:\.\d+)?)/g) ?? [];
  return matches
    .map((raw) => ({ raw, value: Number(raw.replace(/[,$()]/g, '')) }))
    .filter((item) => Number.isFinite(item.value));
}

function detectSectionHeading(line: string): PdfStatementKind | null {
  for (const heading of SECTION_HEADINGS) {
    if (heading.pattern.test(line)) return heading.statement;
  }
  return null;
}

function inferAlias(line: string, currentSection: PdfStatementKind | null): StatementAlias | null {
  for (const alias of STATEMENT_ALIASES) {
    if (currentSection && alias.statement !== currentSection) continue;
    if (alias.patterns.some((pattern) => pattern.test(line))) return alias;
  }
  if (!currentSection) {
    for (const alias of STATEMENT_ALIASES) {
      if (alias.patterns.some((pattern) => pattern.test(line))) return alias;
    }
  }
  return null;
}

function chooseCandidateValue(line: string, units: PdfStatementUnits): { raw: string; value: number } | null {
  const rawMatches = line.match(/(?:\(\$?\d[\d,]*(?:\.\d+)?\)|-?\$?\d[\d,]*(?:\.\d+)?)/g) ?? [];
  for (const match of rawMatches) {
    if (/^\(\d+\)$/.test(match.trim())) continue;
    const parsed = parseValueToken(match, units);
    if (parsed !== null) return { raw: match, value: parsed };
  }
  return null;
}

function buildStatementLines(text: string, units: PdfStatementUnits, shareUnits: PdfStatementUnits): PdfStatementLine[] {
  const pages = text.split('\f');
  const lines: PdfStatementLine[] = [];
  const seen = new Set<string>();

  pages.forEach((pageText, pageIndex) => {
    let currentSection: PdfStatementKind | null = null;
    pageText.split('\n').forEach((rawLine, index) => {
      const line = sanitizeLine(rawLine);
      if (!line) return;
      const nextSection = detectSectionHeading(line);
      if (nextSection) {
        currentSection = nextSection;
        return;
      }

      const alias = inferAlias(line, currentSection);
      if (!alias) return;

      const candidate = chooseCandidateValue(
        line,
        alias.normalizedLabel === 'shares_outstanding' ? shareUnits : units,
      );
      if (!candidate) return;

      const dedupeKey = `${alias.statement}:${alias.normalizedLabel}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      lines.push({
        statement: alias.statement,
        normalizedLabel: alias.normalizedLabel,
        label: line.split(candidate.raw)[0]?.trim() || alias.normalizedLabel,
        value: candidate.value,
        rawValue: candidate.raw,
        page: Number.isFinite(pageIndex + 1) ? pageIndex + 1 : null,
        lineNumber: index + 1,
        rawLine: line,
      });
    });
  });

  return lines;
}

function buildFallbackStatementLines(
  text: string,
  units: PdfStatementUnits,
  shareUnits: PdfStatementUnits,
  existing: PdfStatementLine[],
): PdfStatementLine[] {
  const seen = new Set(existing.map((line) => `${line.statement}:${line.normalizedLabel}`));
  const normalizedText = sanitizeText(text);
  const fallback: PdfStatementLine[] = [];

  for (const alias of STATEMENT_ALIASES) {
    const dedupeKey = `${alias.statement}:${alias.normalizedLabel}`;
    if (seen.has(dedupeKey)) continue;

    for (const pattern of alias.patterns) {
      const source = new RegExp(`${pattern.source}[^\\n]{0,120}`, pattern.flags);
      const match = normalizedText.match(source);
      if (!match) continue;
      const rawLine = sanitizeLine(match[0]);
      const candidate = chooseCandidateValue(
        rawLine,
        alias.normalizedLabel === 'shares_outstanding' ? shareUnits : units,
      );
      if (!candidate) continue;
      fallback.push({
        statement: alias.statement,
        normalizedLabel: alias.normalizedLabel,
        label: rawLine.split(candidate.raw)[0]?.trim() || alias.normalizedLabel,
        value: candidate.value,
        rawValue: candidate.raw,
        page: null,
        lineNumber: 0,
        rawLine,
      });
      seen.add(dedupeKey);
      break;
    }
  }

  return fallback;
}

function getLine(lines: PdfStatementLine[], label: string): PdfStatementLine | null {
  return lines.find((line) => line.normalizedLabel === label) ?? null;
}

function computeTotalDebt(lines: PdfStatementLine[]): number | null {
  const totalDebt = getLine(lines, 'total_debt')?.value ?? null;
  if (typeof totalDebt === 'number') return Math.abs(totalDebt);
  const shortTermDebt = getLine(lines, 'short_term_debt')?.value ?? 0;
  const longTermDebt = getLine(lines, 'long_term_debt')?.value ?? 0;
  const sum = Math.abs(shortTermDebt) + Math.abs(longTermDebt);
  return sum > 0 ? sum : null;
}

function extractSharesOutstanding(text: string, units: PdfStatementUnits): number | null {
  const patterns = [
    /\bdiluted weighted average shares outstanding\b[^\d]{0,40}([\d,]+(?:\.\d+)?)/i,
    /shares used in computing earnings per share:[\s\S]{0,240}?diluted[^\d]{0,20}([\d,]+(?:\.\d+)?)/i,
    /\bauthorized;\s*([\d,]+(?:\.\d+)?)\s+and\s+[\d,]+(?:\.\d+)?\s+shares issued and outstanding\b/i,
    /\bshares outstanding\b[^\d]{0,20}([\d,]+(?:\.\d+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const parsed = parseValueToken(match[1], units);
    if (parsed !== null) return Math.abs(parsed);
  }

  return null;
}

function countDetectedStatements(lines: PdfStatementLine[]): PdfStatementKind[] {
  const kinds = new Set<PdfStatementKind>();
  lines.forEach((line) => kinds.add(line.statement));
  return Array.from(kinds);
}

function annualizeFlow(value: number | null, periodType: PdfStatementPeriodType): { value: number | null; annualized: boolean } {
  if (typeof value !== 'number' || !Number.isFinite(value)) return { value: null, annualized: false };
  if (periodType === 'quarter') return { value: value * 4, annualized: true };
  return { value, annualized: false };
}

function buildSnapshot(params: {
  rawText: string;
  lines: PdfStatementLine[];
  shareUnits: PdfStatementUnits;
  companyName: string | null;
  ticker: string | null;
  reportEndDate: string | null;
  fiscalPeriod: string | null;
  periodType: PdfStatementPeriodType;
  units: PdfStatementUnits;
  currency: 'USD' | 'unknown';
  warnings: string[];
}): AttachmentStatementSnapshot | null {
  const revenue = annualizeFlow(getLine(params.lines, 'revenue')?.value ?? null, params.periodType);
  const grossProfit = annualizeFlow(getLine(params.lines, 'gross_profit')?.value ?? null, params.periodType);
  const operatingIncome = annualizeFlow(getLine(params.lines, 'operating_income')?.value ?? null, params.periodType);
  const directEbitda = annualizeFlow(getLine(params.lines, 'ebitda')?.value ?? null, params.periodType);
  const netIncome = annualizeFlow(getLine(params.lines, 'net_income')?.value ?? null, params.periodType);
  const da = annualizeFlow(getLine(params.lines, 'depreciation_and_amortization')?.value ?? null, params.periodType);
  const capexRaw = getLine(params.lines, 'capex')?.value ?? null;
  const capex = annualizeFlow(typeof capexRaw === 'number' ? Math.abs(capexRaw) : null, params.periodType);

  const ebitda =
    directEbitda.value ??
    (typeof operatingIncome.value === 'number' && typeof da.value === 'number'
      ? operatingIncome.value + da.value
      : null);
  const cash = getLine(params.lines, 'cash')?.value ?? null;
  const totalDebt = computeTotalDebt(params.lines);
  const sharesOutstandingRaw =
    getLine(params.lines, 'shares_outstanding')?.value ??
    extractSharesOutstanding(params.rawText, params.shareUnits) ??
    null;
  const sharesOutstanding = typeof sharesOutstandingRaw === 'number' ? Math.abs(sharesOutstandingRaw) : null;

  const hasUsableFlows =
    typeof revenue.value === 'number' ||
    typeof operatingIncome.value === 'number' ||
    typeof ebitda === 'number' ||
    typeof netIncome.value === 'number';
  const hasUsableBalance = typeof cash === 'number' || typeof totalDebt === 'number';
  if (!hasUsableFlows && !hasUsableBalance) return null;

  return {
    source: 'attachment_pdf_statement',
    companyName: params.companyName,
    ticker: params.ticker,
    reportEndDate: params.reportEndDate,
    fiscalPeriod: params.fiscalPeriod,
    periodType: params.periodType,
    units: params.units,
    currency: params.currency,
    annualizedFromQuarter:
      params.periodType === 'quarter' &&
      [revenue.annualized, grossProfit.annualized, operatingIncome.annualized, directEbitda.annualized, netIncome.annualized, da.annualized, capex.annualized].some(Boolean),
    revenue: revenue.value,
    grossProfit: grossProfit.value,
    operatingIncome: operatingIncome.value,
    ebitda,
    netIncome: netIncome.value,
    cash,
    totalDebt,
    sharesOutstanding,
    capex: capex.value,
    depreciationAndAmortization: da.value,
    warnings: params.warnings,
  };
}

export function extractPdfStatementPackage(text: string): PdfStatementPackage | null {
  const raw = text ?? '';
  const pages = raw.split('\f');
  const lines = pages.flatMap((page) => page.split('\n').map((line) => sanitizeLine(line))).filter(Boolean);
  if (!scoreTextLayer(lines)) {
    return null;
  }

  const units = detectUnits(raw);
  const shareUnits = detectShareCountUnits(raw, units);
  const currency = detectCurrency(raw);
  const periodType = detectPeriodType(raw);
  const fiscalPeriod = detectFiscalPeriod(raw);
  const reportEndDate = detectReportEndDate(raw);
  const company = detectCompany(raw);
  const statementLines = buildStatementLines(raw, units, shareUnits);
  const fallbackLines = buildFallbackStatementLines(raw, units, shareUnits, statementLines);
  const allStatementLines = [...statementLines, ...fallbackLines];

  if (allStatementLines.length < 3) {
    return null;
  }

  const detectedStatements = countDetectedStatements(allStatementLines);
  const warnings: string[] = [];
  if (periodType === 'unknown') warnings.push('Could not determine whether the PDF is quarterly or annual.');
  if (!company.companyName && !company.ticker) warnings.push('Could not determine company identity from the PDF text.');

  const missingStatements = (['income_statement', 'balance_sheet', 'cash_flow_statement'] as PdfStatementKind[]).filter(
    (statement) => !detectedStatements.includes(statement),
  );
  if (missingStatements.length > 0) {
    warnings.push(`Missing core statements: ${missingStatements.join(', ')}.`);
  }

  const snapshot = buildSnapshot({
    rawText: raw,
    lines: allStatementLines,
    shareUnits,
    companyName: company.companyName,
    ticker: company.ticker,
    reportEndDate,
    fiscalPeriod,
    periodType,
    units,
    currency,
    warnings,
  });

  if (!snapshot) return null;

  const coreMetrics = [
    snapshot.revenue,
    snapshot.operatingIncome,
    snapshot.ebitda,
    snapshot.netIncome,
    snapshot.cash,
    snapshot.totalDebt,
  ].filter((value) => typeof value === 'number').length;
  const confidence: PdfStatementConfidence =
    coreMetrics >= 5 && missingStatements.length <= 1 ? 'high' : coreMetrics >= 3 ? 'medium' : 'low';

  return {
    companyName: company.companyName,
    ticker: company.ticker,
    reportEndDate,
    fiscalPeriod,
    periodType,
    units,
    currency,
    confidence,
    warnings,
    missingStatements,
    incomeStatement: allStatementLines.filter((line) => line.statement === 'income_statement'),
    balanceSheet: allStatementLines.filter((line) => line.statement === 'balance_sheet'),
    cashFlowStatement: allStatementLines.filter((line) => line.statement === 'cash_flow_statement'),
    snapshot,
  };
}
