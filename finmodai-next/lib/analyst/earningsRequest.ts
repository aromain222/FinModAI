export type EarningsRequestTarget = {
  ticker: string;
  mode: 'latest' | 'explicit_quarter' | 'yearless_quarter';
  fiscalPeriod: string | null;
  fiscalYear: number | null;
  reportEndDate: string | null;
};

function normalizeFiscalPeriod(value: string | null | undefined): string | null {
  if (!value) return null;
  const matched = value.trim().toUpperCase().match(/^Q([1-4])$/);
  return matched ? `Q${matched[1]}` : null;
}

export function buildEarningsPackageKey(params: {
  ticker: string;
  fiscalPeriod?: string | null;
  fiscalYear?: number | null;
  reportEndDate?: string | null;
}): string {
  return [
    params.ticker.trim().toUpperCase(),
    normalizeFiscalPeriod(params.fiscalPeriod) ?? '',
    params.fiscalYear ?? '',
    params.reportEndDate?.trim() ?? '',
  ].join('::');
}

export function extractEarningsRequestTarget(params: {
  ticker: string;
  prompt?: string | null;
}): EarningsRequestTarget {
  const ticker = params.ticker.trim().toUpperCase();
  const prompt = String(params.prompt ?? '');
  const lowered = prompt.toLowerCase();

  const reportEndDateMatch = prompt.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (reportEndDateMatch) {
    return {
      ticker,
      mode: 'explicit_quarter',
      fiscalPeriod: null,
      fiscalYear: Number(reportEndDateMatch[1].slice(0, 4)),
      reportEndDate: reportEndDateMatch[1],
    };
  }

  const quarterYearPatterns = [
    /\bq([1-4])\s*(?:fy|fiscal\s*year\s*)?(20\d{2})\b/i,
    /\b(?:fy|fiscal\s*year\s*)?(20\d{2})\s*q([1-4])\b/i,
    /\bfiscal\s*q([1-4])\s*(20\d{2})\b/i,
  ];

  for (const pattern of quarterYearPatterns) {
    const match = prompt.match(pattern);
    if (!match) continue;
    const first = Number(match[1]);
    const second = Number(match[2]);
    const quarter = first >= 1 && first <= 4 ? first : second;
    const year = first >= 2000 ? first : second;
    if (quarter >= 1 && quarter <= 4 && year >= 2000) {
      return {
        ticker,
        mode: 'explicit_quarter',
        fiscalPeriod: `Q${quarter}`,
        fiscalYear: year,
        reportEndDate: null,
      };
    }
  }

  if (/\bq[1-4]\b/.test(lowered) && /\b(quarter|financials|report|results|release|earnings)\b/.test(lowered)) {
    const quarterOnly = lowered.match(/\bq([1-4])\b/);
    if (quarterOnly) {
      return {
        ticker,
        mode: 'yearless_quarter',
        fiscalPeriod: `Q${quarterOnly[1]}`,
        fiscalYear: null,
        reportEndDate: null,
      };
    }
  }

  return {
    ticker,
    mode: 'latest',
    fiscalPeriod: null,
    fiscalYear: null,
    reportEndDate: null,
  };
}
