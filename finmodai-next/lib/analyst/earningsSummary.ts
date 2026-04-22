import type { EarningsRetrievalAgentResult } from '@/lib/analyst/earningsRetrievalAgent';

export type EarningsNextDateHint = {
  displayDate: string;
  source?: string | null;
  note?: string | null;
} | null;

export type AnalystEarningsSummaryCard = {
  companyName: string;
  ticker: string;
  quarterLabel: string;
  metrics: Array<{
    label: string;
    value: string;
  }>;
  highlights: string[];
  nextEarningsDate: string | null;
  warnings: string[];
};

function formatNumber(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return value.toLocaleString('en-US');
}

function formatMoneyMillions(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return `$${value.toLocaleString('en-US')}M`;
}

function formatQuarterLabel(result: EarningsRetrievalAgentResult): string {
  const fiscalPeriod = result.quarter.fiscalPeriod;
  const reportEndDate = result.quarter.reportEndDate;
  const fiscalYear = reportEndDate ? reportEndDate.slice(0, 4) : null;
  if (fiscalPeriod && fiscalYear) return `${fiscalPeriod} ${fiscalYear}`;
  if (fiscalPeriod) return fiscalPeriod;
  if (reportEndDate) return reportEndDate;
  return 'the latest reported quarter';
}

export function formatEarningsQuarterLabel(result: EarningsRetrievalAgentResult): string {
  return formatQuarterLabel(result);
}

function buildMetricsSentence(result: EarningsRetrievalAgentResult): string {
  const parts: string[] = [];
  const revenue = formatMoneyMillions(result.quarter.revenue);
  const operatingIncome = formatMoneyMillions(result.quarter.operatingIncome);
  const netIncome = formatMoneyMillions(result.quarter.netIncome);
  const eps = formatNumber(result.quarter.eps);

  if (revenue) parts.push(`revenue was ${revenue}`);
  if (operatingIncome) parts.push(`operating income was ${operatingIncome}`);
  if (netIncome) parts.push(`net income was ${netIncome}`);
  if (eps) parts.push(`EPS was ${eps}`);

  if (parts.length === 0) {
    return `The current earnings package does not include clean quarter metrics beyond the period label.`;
  }

  return `In ${formatQuarterLabel(result)}, ${parts.join(', ')}.`;
}

export function isGenericEarningsSummaryPrompt(message: string): boolean {
  const text = message.toLowerCase();
  const hasEarningsAnchor =
    /\b(earnings|quarter|quarterly|results|reported|print|release)\b/.test(text);
  const hasSummaryVerb =
    /\b(tell me about|walk me through|summarize|summary|recap|what happened|how were|how did|talk me through|brief me on)\b/.test(text);
  return hasEarningsAnchor && hasSummaryVerb;
}

export function buildDeterministicEarningsSummaryReply(params: {
  result: EarningsRetrievalAgentResult;
  nextEarnings: EarningsNextDateHint;
}): string {
  const { result, nextEarnings } = params;
  const header = `${result.companyName} (${result.ticker}) last reported ${formatQuarterLabel(result)}. ${buildMetricsSentence(result)}`;

  const commentaryLine =
    result.commentary.highlights.length > 0
      ? result.commentary.highlights.slice(0, 2).join(' ')
      : null;

  const nextDateLine = nextEarnings?.displayDate
    ? `The next scheduled earnings date is ${nextEarnings.displayDate}.`
    : null;

  const gapLine =
    result.dataQuality.gaps.length > 0
      ? `Still missing from the current package: ${result.dataQuality.gaps
          .slice(0, 2)
          .map((gap) => gap.replace(/\.$/, '').toLowerCase())
          .join('; ')}.`
      : null;

  return [header, commentaryLine, nextDateLine, gapLine]
    .filter((line): line is string => Boolean(line && line.trim().length > 0))
    .join('\n\n');
}

export function buildDeterministicEarningsSummaryCard(params: {
  result: EarningsRetrievalAgentResult;
  nextEarnings: EarningsNextDateHint;
}): AnalystEarningsSummaryCard {
  const { result, nextEarnings } = params;
  const metrics: AnalystEarningsSummaryCard['metrics'] = [];
  const revenue = formatMoneyMillions(result.quarter.revenue);
  const operatingIncome = formatMoneyMillions(result.quarter.operatingIncome);
  const netIncome = formatMoneyMillions(result.quarter.netIncome);
  const eps = formatNumber(result.quarter.eps);

  if (revenue) metrics.push({ label: 'Revenue', value: revenue });
  if (operatingIncome) metrics.push({ label: 'Operating Income', value: operatingIncome });
  if (netIncome) metrics.push({ label: 'Net Income', value: netIncome });
  if (eps) metrics.push({ label: 'EPS', value: eps });

  return {
    companyName: result.companyName,
    ticker: result.ticker,
    quarterLabel: formatQuarterLabel(result),
    metrics,
    highlights: result.commentary.highlights.slice(0, 2),
    nextEarningsDate: nextEarnings?.displayDate ?? null,
    warnings: result.dataQuality.gaps.slice(0, 2),
  };
}
