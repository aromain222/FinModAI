import OpenAI from 'openai';
import { getOpenAIKey, getOpenAIModelCandidates } from '@/lib/openaiKey';
import {
  getReportWriterSystemPrompt,
  buildReportWriterUserPrompt,
  type ReportContext,
  type ReportModelType,
} from '@/lib/reportPrompts';
import type { StructuredReportPayload } from '@/lib/reportTypes';

export type GeneratedReportSection = {
  title: string;
  body: string;
};

export type GeneratedModelReport = {
  title: string;
  summaryText: string;
  markdownBody: string;
  reportPayload: StructuredReportPayload;
};

type AiReportMetric = {
  label?: unknown;
  value?: unknown;
  importance?: unknown;
};

type AiReportSection = {
  heading?: unknown;
  style?: unknown;
  content?: unknown;
};

type AiReportCallout = {
  tone?: unknown;
  title?: unknown;
  body?: unknown;
};

type AiReportResponse = {
  title?: unknown;
  subtitle?: unknown;
  reportType?: unknown;
  company?: {
    name?: unknown;
    ticker?: unknown;
    asOfDate?: unknown;
  };
  executiveSummary?: {
    headline?: unknown;
    verdict?: unknown;
    confidence?: unknown;
    summaryBullets?: unknown;
  };
  keyMetrics?: unknown;
  sections?: unknown;
  callouts?: unknown;
};

function formatModelLabel(modelType: string): string {
  return modelType
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function fmtNumber(value: unknown, digits = 2): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits === 0 ? 0 : 0,
  }).format(value);
}

function fmtPct(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${value.toFixed(2)}%`;
}

function toFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function firstFinite(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = toFinite(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function pushLine(lines: string[], line: string | null | undefined): void {
  if (!line) return;
  const trimmed = line.trim();
  if (!trimmed) return;
  lines.push(trimmed);
}

function buildBulletBody(lines: Array<string | null | undefined>, fallback: string): string {
  const items = lines
    .map((line) => (typeof line === 'string' ? line.trim() : ''))
    .filter((line) => line.length > 0);
  if (!items.length) return fallback;
  return items.map((item) => `- ${item}`).join('\n');
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}

function formatSectionBody(style: string, content: string[]): string {
  if (!content.length) return 'Content unavailable.';
  if (style === 'bullets') return content.map((item) => `- ${item}`).join('\n');
  if (style === 'numbered') return content.map((item, idx) => `${idx + 1}. ${item}`).join('\n');
  return content.join('\n\n');
}

function coerceAiReportPayload(
  response: AiReportResponse,
  fallbackTitle: string,
  fallbackSubtitle: string,
  fallbackSummary: string
): StructuredReportPayload | null {
  const executive = response.executiveSummary && typeof response.executiveSummary === 'object' ? response.executiveSummary : {};
  const headline = normalizeString(executive.headline);
  const verdict = normalizeString(executive.verdict);
  const summaryBullets = normalizeStringList(executive.summaryBullets);

  const metricRows = Array.isArray(response.keyMetrics)
    ? (response.keyMetrics as AiReportMetric[])
        .map((row) => {
          const label = normalizeString(row?.label);
          const value = normalizeString(row?.value);
          return label && value ? `${label}: ${value}` : '';
        })
        .filter(Boolean)
    : [];

  const sections = Array.isArray(response.sections)
    ? (response.sections as AiReportSection[])
        .map((section) => {
          const title = normalizeString(section?.heading);
          const style = normalizeString(section?.style).toLowerCase();
          const content = normalizeStringList(section?.content);
          if (!title || !content.length) return null;
          return {
            title,
            body: formatSectionBody(style, content),
          };
        })
        .filter((section): section is { title: string; body: string } => Boolean(section))
    : [];

  const callouts = Array.isArray(response.callouts)
    ? (response.callouts as AiReportCallout[])
        .map((callout) => {
          const tone = normalizeString(callout?.tone);
          const title = normalizeString(callout?.title);
          const body = normalizeString(callout?.body);
          if (!title || !body) return null;
          return {
            title: tone ? `${tone.toUpperCase()}: ${title}` : title,
            body,
          };
        })
        .filter((section): section is { title: string; body: string } => Boolean(section))
    : [];

  const allSections = [...sections, ...callouts];
  const summaryPieces = [headline, verdict, ...summaryBullets].filter(Boolean);
  const summaryText = summaryPieces.join(' ').trim() || fallbackSummary;
  const keyTakeaways = metricRows.length > 0 ? metricRows.slice(0, 3) : summaryBullets.slice(0, 3);

  if (!allSections.length) return null;

  return {
    title: normalizeString(response.title) || fallbackTitle,
    summaryText,
    subtitle: normalizeString(response.subtitle) || fallbackSubtitle,
    oneLineSummary: headline || verdict || fallbackSummary,
    keyTakeaways,
    sections: allSections,
  };
}

function extractKeyTakeaways(sections: GeneratedReportSection[]): string[] {
  const takeaways: string[] = [];

  for (const section of sections) {
    const lines = section.body
      .split('\n')
      .map((line) => line.replace(/^[•*-]\s+/, '').trim())
      .filter((line) => line.length > 0);

    for (const line of lines) {
      if (!takeaways.includes(line)) {
        takeaways.push(line);
      }
      if (takeaways.length >= 3) return takeaways;
    }
  }

  return takeaways;
}

function buildDcfSections(context: ReportContext): GeneratedReportSection[] {
  const key = context.keyOutputs || {};
  const lines: string[] = [];
  pushLine(lines, fmtNumber(key.baseValuePerShare) ? `Base value per share: ${fmtNumber(key.baseValuePerShare)}.` : null);
  pushLine(lines, fmtNumber(key.bullValuePerShare) ? `Bull case value per share: ${fmtNumber(key.bullValuePerShare)}.` : null);
  pushLine(lines, fmtNumber(key.bearValuePerShare) ? `Bear case value per share: ${fmtNumber(key.bearValuePerShare)}.` : null);
  pushLine(lines, fmtPct(key.impliedUpsidePct) ? `Implied upside/downside versus market: ${fmtPct(key.impliedUpsidePct)}.` : null);

  const notes: string[] = [];
  pushLine(notes, 'Primary drivers are the operating forecast, discount rate, and terminal assumptions.');
  if (context.highLevelNotes) pushLine(notes, context.highLevelNotes);

  return [
    {
      title: 'Valuation Snapshot',
      body: buildBulletBody(lines, 'Base-case valuation outputs were generated for the current DCF setup.'),
    },
    {
      title: 'Key Sensitivities',
      body: buildBulletBody(notes, 'Primary valuation sensitivity sits in the long-duration assumptions.'),
    },
  ];
}

function buildLboSections(context: ReportContext): GeneratedReportSection[] {
  const key = context.keyOutputs || {};
  const lines: string[] = [];
  pushLine(lines, fmtNumber(key.entryMultiple) ? `Entry multiple: ${fmtNumber(key.entryMultiple)}x.` : null);
  pushLine(lines, fmtNumber(key.exitMultiple) ? `Exit multiple: ${fmtNumber(key.exitMultiple)}x.` : null);
  pushLine(lines, fmtPct(key.irr) ? `Base IRR: ${fmtPct(key.irr)}.` : null);

  return [
    {
      title: 'Returns Snapshot',
      body: buildBulletBody(lines, 'LBO return outputs were generated from the current case assumptions.'),
    },
    {
      title: 'Underwriting Focus',
      body: buildBulletBody(
        [
          'Return sensitivity is primarily driven by entry price, exit valuation, leverage, and operating deleveraging.',
          'Execution risk rises if margin expansion or cash conversion underperform the base case.',
        ],
        'Return sensitivity is concentrated in the underwriting assumptions.'
      ),
    },
  ];
}

function buildCompsSections(context: ReportContext): GeneratedReportSection[] {
  const key = context.keyOutputs || {};
  const base = fmtNumber(key.baseValuePerShare);

  return [
    {
      title: 'Relative Valuation Snapshot',
      body: base
        ? buildBulletBody(
            [
              `Implied blended value per share: ${base}.`,
              'Output should be read relative to peer-set quality and current market multiple stability.',
            ],
            'Comparable valuation outputs were generated from the current peer set.'
          )
        : 'Comparable valuation outputs were generated from the current peer set.',
    },
    {
      title: 'Interpretation',
      body: buildBulletBody(
        [
          'The model is most useful for relative framing, not absolute intrinsic value.',
          'Multiple compression, peer outliers, and changing market regimes can move the range quickly.',
        ],
        'Relative valuation needs to be read against current peer-set stability.'
      ),
    },
  ];
}

function buildPrecedentsSections(_context: ReportContext): GeneratedReportSection[] {
  return [
    {
      title: 'Precedent Valuation Snapshot',
      body: buildBulletBody(
        [
          'The precedent set should be read as a control-value framing tool rather than a direct trading mark.',
          'Outputs are most useful when the selected transactions are strategically and temporally comparable to the target.',
        ],
        'Precedent valuation outputs were generated from the current transaction set.'
      ),
    },
    {
      title: 'Interpretation',
      body: buildBulletBody(
        [
          'Control premiums and deal-specific synergies can distort direct comparability.',
          'Use the range to support valuation framing, then pressure-test which transactions truly belong in the set.',
        ],
        'Transaction selection and premium normalization drive the usefulness of the precedent range.'
      ),
    },
  ];
}

function buildCapTableSections(context: ReportContext): GeneratedReportSection[] {
  const data = context.data ?? {};
  return [
    {
      title: 'Ownership Snapshot',
      body: buildBulletBody(
        [
          data.extractedInputs?.preMoney ? `Pre-money valuation: ${fmtNumber(data.extractedInputs.preMoney)}.` : null,
          data.extractedInputs?.raiseAmount ? `Primary raise amount: ${fmtNumber(data.extractedInputs.raiseAmount)}.` : null,
          data.extractedInputs?.optionPoolRefresh !== undefined ? `Option pool refresh: ${fmtPct(Number(data.extractedInputs.optionPoolRefresh) * 100)}.` : null,
          'This model is most useful for understanding dilution mechanics, post-money ownership, and control shifts.',
        ],
        'The cap table frames dilution, ownership, and post-money structure under the current financing assumptions.'
      ),
    },
    {
      title: 'Interpretation',
      body: buildBulletBody(
        [
          'The key question is how much ownership existing holders give up for the next financing milestone.',
          'Small changes in valuation, raise size, or option pool sizing can move founder and new-investor ownership meaningfully.',
        ],
        'Dilution is most sensitive to valuation, raise size, and option pool assumptions.'
      ),
    },
  ];
}

function buildSaasOperatingSections(context: ReportContext): GeneratedReportSection[] {
  const data = context.data ?? {};
  return [
    {
      title: 'Operating Snapshot',
      body: buildBulletBody(
        [
          data.extractedInputs?.growthRate !== undefined ? `Growth rate: ${fmtPct(Number(data.extractedInputs.growthRate) * 100)}.` : null,
          data.extractedInputs?.grossMargin !== undefined ? `Gross margin: ${fmtPct(Number(data.extractedInputs.grossMargin) * 100)}.` : null,
          data.extractedInputs?.churn !== undefined ? `Churn: ${fmtPct(Number(data.extractedInputs.churn) * 100)}.` : null,
          data.extractedInputs?.cac ? `CAC: ${fmtNumber(data.extractedInputs.cac)}.` : null,
          data.extractedInputs?.arpu ? `ARPU: ${fmtNumber(data.extractedInputs.arpu)}.` : null,
        ],
        'The SaaS operating model ties recurring revenue assumptions to margin and unit-economic durability.'
      ),
    },
    {
      title: 'Interpretation',
      body: buildBulletBody(
        [
          'The main question is whether growth quality is durable after churn, margin, and acquisition-cost assumptions are applied.',
          'The model is most sensitive to churn discipline and whether CAC remains supportable relative to ARPU and gross margin.',
        ],
        'Growth quality and unit economics are the main interpretation anchors.'
      ),
    },
  ];
}

function buildSpecializedTemplateSections(context: ReportContext): GeneratedReportSection[] {
  const label = formatModelLabel(context.modelType);
  return [
    {
      title: 'Model Overview',
      body: buildBulletBody(
        [
          `${label} outputs were generated from the current assumptions and supporting inputs.`,
          'The model should be read as a decision framework anchored in the assumptions provided, not as an autonomous live-data conclusion.',
        ],
        `${label} outputs were generated from the current assumptions.`
      ),
    },
    {
      title: 'Interpretation',
      body: buildBulletBody(
        [
          'The main read-through depends on whether the current assumptions are complete enough to support a decision-useful conclusion.',
          'The next step is to pressure-test the assumptions that most directly drive the model’s headline output and sensitivity.',
        ],
        'Interpret the output through its key assumptions and sensitivity to incomplete inputs.'
      ),
    },
  ];
}

function buildThreeStatementSections(context: ReportContext): GeneratedReportSection[] {
  const summary =
    context.data?.threeStatementSummary && typeof context.data.threeStatementSummary === 'object'
      ? (context.data.threeStatementSummary as Record<string, any>)
      : null;
  const revenueSeries = Array.isArray(summary?.incomeStatement?.revenue) ? summary.incomeStatement.revenue : [];
  const ebitdaSeries = Array.isArray(summary?.incomeStatement?.ebitda) ? summary.incomeStatement.ebitda : [];
  const netIncomeSeries = Array.isArray(summary?.incomeStatement?.netIncome) ? summary.incomeStatement.netIncome : [];
  const endingCashSeries = Array.isArray(summary?.cashFlow?.endingCash) ? summary.cashFlow.endingCash : [];
  const endingDebtSeries = Array.isArray(summary?.balanceSheet?.debt) ? summary.balanceSheet.debt : [];

  const revenueStart = revenueSeries.length ? firstFinite(revenueSeries[0]) : null;
  const revenueEnd = revenueSeries.length ? firstFinite(revenueSeries[revenueSeries.length - 1]) : null;
  const ebitdaEnd = ebitdaSeries.length ? firstFinite(ebitdaSeries[ebitdaSeries.length - 1]) : null;
  const netIncomeEnd = netIncomeSeries.length ? firstFinite(netIncomeSeries[netIncomeSeries.length - 1]) : null;
  const endingCash = endingCashSeries.length ? firstFinite(endingCashSeries[endingCashSeries.length - 1]) : null;
  const endingDebt = endingDebtSeries.length ? firstFinite(endingDebtSeries[endingDebtSeries.length - 1]) : null;
  const years = Array.isArray(summary?.years) ? summary.years : [];
  const revenueCagrPct =
    revenueStart !== null &&
    revenueEnd !== null &&
    revenueStart > 0 &&
    revenueSeries.length > 1
      ? (Math.pow(revenueEnd / revenueStart, 1 / (revenueSeries.length - 1)) - 1) * 100
      : null;
  const ebitdaMarginPct =
    revenueEnd !== null && revenueEnd !== 0 && ebitdaEnd !== null ? (ebitdaEnd / revenueEnd) * 100 : null;

  if (!revenueSeries.length && !ebitdaSeries.length && !endingCashSeries.length && !endingDebtSeries.length) {
    return [
      {
        title: 'Forecast Snapshot',
        body: buildBulletBody(
          [
            'The three-statement build reflects the current revenue, margin, and reinvestment assumptions.',
            'Interpret the output through cash conversion and balance-sheet flexibility, not headline growth alone.',
          ],
          'The three-statement build reflects the current operating assumptions.'
        ),
      },
      {
        title: 'Monitoring Points',
        body: buildBulletBody(
          [
            'Watch the durability of operating margin, working-capital intensity, and financing assumptions.',
            'Small changes in these inputs can materially change cash build and balance-sheet outcomes.',
          ],
          'Cash conversion and financing assumptions are the main monitoring points.'
        ),
      },
    ];
  }

  return [
    {
      title: 'Forecast Snapshot',
      body: buildBulletBody(
        [
          years.length ? `Projection years: ${years.join(', ')}.` : null,
          revenueCagrPct !== null ? `Projected revenue CAGR: ${fmtPct(revenueCagrPct)}.` : null,
          revenueEnd !== null ? `Ending revenue: ${fmtNumber(revenueEnd)}.` : null,
          ebitdaEnd !== null ? `Ending EBITDA: ${fmtNumber(ebitdaEnd)}.` : null,
          ebitdaMarginPct !== null ? `Ending EBITDA margin: ${fmtPct(ebitdaMarginPct)}.` : null,
          netIncomeEnd !== null ? `Ending net income: ${fmtNumber(netIncomeEnd)}.` : null,
        ],
        'The three-statement build reflects the current revenue, margin, and reinvestment assumptions.'
      ),
    },
    {
      title: 'Cash Conversion And Balance Sheet',
      body: buildBulletBody(
        [
          endingCash !== null ? `Ending cash balance: ${fmtNumber(endingCash)}.` : null,
          endingDebt !== null ? `Ending debt balance: ${fmtNumber(endingDebt)}.` : null,
          endingCash !== null && endingDebt !== null
            ? `Net cash / (debt) at the end of the run: ${fmtNumber(endingCash - endingDebt)}.`
            : null,
          'The main read-through is whether projected operating profit is converting into durable cash build rather than just accounting earnings.',
          'Working capital, capex, and financing assumptions are the main variables that can materially change the end-state balance sheet.',
        ],
        'Cash conversion and financing assumptions are the main monitoring points.'
      ),
    },
  ];
}

function buildScorecardSections(_context: ReportContext): GeneratedReportSection[] {
  return [
    {
      title: 'Scorecard Interpretation',
      body: buildBulletBody(
        [
          'The scorecard summarizes quality, profitability, leverage, and durability on a rules-based basis.',
          'It is best used as a screening and framing tool, not a standalone valuation decision.',
        ],
        'The scorecard is a framing tool, not a standalone decision.'
      ),
    },
    {
      title: 'What To Check Next',
      body: buildBulletBody(
        [
          'Validate the ratios behind the score.',
          'Compare them with sector peers.',
          'Test whether weak areas are cyclical, structural, or data-quality driven.',
        ],
        'Validate the ratios behind the score before using it as a decision input.'
      ),
    },
  ];
}

function buildDebtCapacitySections(context: ReportContext): GeneratedReportSection[] {
  const analysis = analyzeDebtCapacityReport(context);
  if (!analysis.ok) {
    return [
      {
        title: 'Run Status',
        body: analysis.message,
      },
    ];
  }

  const leverageCap = fmtNumber(analysis.leverageCap);
  const coverageCap = fmtNumber(analysis.coverageCap);
  const maxDebt = fmtNumber(analysis.maxDebt);
  const netDebt = fmtNumber(analysis.netDebt);
  const netLeverage = analysis.currentNetLeverage !== null ? `${analysis.currentNetLeverage.toFixed(2)}x` : null;
  const coverage = analysis.currentInterestCoverage !== null ? `${analysis.currentInterestCoverage.toFixed(2)}x` : null;
  const incrementalCapacity = fmtNumber(analysis.incrementalCapacity);

  return [
    {
      title: 'Key Metrics',
      body: buildBulletBody(
        [
          analysis.ebitda !== null ? `EBITDA: ${fmtNumber(analysis.ebitda)}.` : null,
          analysis.grossDebt !== null ? `Gross debt: ${fmtNumber(analysis.grossDebt)}.` : null,
          analysis.cash !== null ? `Cash: ${fmtNumber(analysis.cash)}.` : null,
          netDebt ? `Net debt: ${netDebt}.` : null,
          netLeverage ? `Net leverage: ${netLeverage}.` : null,
          coverage ? `Interest coverage: ${coverage}.` : null,
        ],
        'Debt capacity inputs were captured for this run.'
      ),
    },
    {
      title: 'Debt Capacity Summary',
      body: buildBulletBody(
        [
          leverageCap ? `Implied max debt under the leverage constraint: ${leverageCap}.` : null,
          coverageCap ? `Implied max debt under the coverage constraint: ${coverageCap}.` : null,
          maxDebt ? `Selected max debt: ${maxDebt}.` : null,
          incrementalCapacity ? `Incremental capacity: ${incrementalCapacity}.` : null,
          analysis.bindingConstraint ? `Binding constraint: ${analysis.bindingConstraint}.` : null,
        ],
        'Debt capacity was estimated under the current leverage and coverage tests.'
      ),
    },
    {
      title: 'Capacity Interpretation',
      body: buildBulletBody(
        [
          analysis.bindingConstraint
            ? `${analysis.bindingConstraint} is the limiting factor under the current assumptions.`
            : null,
          analysis.sensitivityEbitdaDown10 !== null
            ? `A 10% EBITDA decline would reduce implied debt capacity to approximately ${fmtNumber(analysis.sensitivityEbitdaDown10)}.`
            : null,
          analysis.sensitivityRateUp100bps !== null
            ? `A 100 bps increase in borrowing cost would reduce the coverage-based capacity to approximately ${fmtNumber(analysis.sensitivityRateUp100bps)}.`
            : null,
          analysis.missingFields.length
            ? `The run is usable, but missing fields still reduce precision: ${analysis.missingFields.join(', ')}.`
            : null,
        ],
        'Capacity should be stress-tested under lower EBITDA and higher borrowing cost.'
      ),
    },
  ];
}

function buildMergerSections(_context: ReportContext): GeneratedReportSection[] {
  return [
    {
      title: 'Transaction Snapshot',
      body: buildBulletBody(
        [
          'The merger model summarizes the current deal structure, financing mix, and pro forma impact.',
          'The key question is whether expected synergies outweigh purchase price, financing drag, and integration costs.',
        ],
        'The merger model summarizes deal structure and pro forma impact.'
      ),
    },
    {
      title: 'Execution Risks',
      body: buildBulletBody(
        [
          'The main swing factors are synergy timing, financing terms, and integration friction.',
          'Accretion or dilution can move quickly if these assumptions change.',
        ],
        'Accretion and dilution are sensitive to execution assumptions.'
      ),
    },
  ];
}

function buildOperatingSections(_context: ReportContext): GeneratedReportSection[] {
  return [
    {
      title: 'Operating Snapshot',
      body: buildBulletBody(
        [
          'The operating model translates current revenue, margin, and spending assumptions into a forward operating view.',
          'The central focus is whether execution supports the planned cash and profitability path.',
        ],
        'The operating model ties current assumptions to forward profitability.'
      ),
    },
    {
      title: 'Key Dependencies',
      body: buildBulletBody(
        [
          'Monitor revenue conversion, cost discipline, and working-capital behavior.',
          'These are the main variables that can widen the gap between plan and realized cash performance.',
        ],
        'Revenue conversion and cost control are the key dependencies.'
      ),
    },
  ];
}

type DebtCapacityReportAnalysis =
  | {
      ok: false;
      missingFields: string[];
      message: string;
    }
  | {
      ok: true;
      ebitda: number | null;
      ebit: number | null;
      grossDebt: number | null;
      cash: number | null;
      netDebt: number | null;
      interestExpense: number | null;
      targetNetLeverage: number | null;
      coverageThreshold: number | null;
      minimumLiquidityBuffer: number | null;
      blendedInterestRate: number | null;
      leverageCap: number | null;
      coverageCap: number | null;
      maxDebt: number | null;
      bindingConstraint: 'Leverage' | 'Coverage' | 'Liquidity' | null;
      incrementalCapacity: number | null;
      currentNetLeverage: number | null;
      currentInterestCoverage: number | null;
      sensitivityEbitdaDown10: number | null;
      sensitivityRateUp100bps: number | null;
      missingFields: string[];
    };

function analyzeDebtCapacityReport(context: ReportContext): DebtCapacityReportAnalysis {
  const summary = (context.data?.debtCapacityLite && typeof context.data.debtCapacityLite === 'object'
    ? context.data.debtCapacityLite
    : {}) as Record<string, any>;
  const canonical = (context.data?.canonicalFinancials && typeof context.data.canonicalFinancials === 'object'
    ? context.data.canonicalFinancials
    : {}) as Record<string, any>;

  const ebitda = firstFinite(
    summary.inputs?.ebitda,
    canonical.ebitda,
    canonical.profitability?.ebitda,
    canonical.ltmEbitda,
    context.keyOutputs?.ltmMetrics?.ebitda
  );
  const ebit = firstFinite(
    canonical.ebit,
    canonical.operatingIncome,
    canonical.profitability?.ebit,
    canonical.incomeStatement?.ebit
  );
  const grossDebt = firstFinite(
    canonical.grossDebt,
    canonical.totalDebt,
    canonical.balanceSheet?.totalDebt,
    canonical.balanceSheet?.debt,
    canonical.debt
  );
  const cash = firstFinite(
    canonical.cash,
    canonical.cashAndEquivalents,
    canonical.balanceSheet?.cash,
    canonical.balanceSheet?.cashAndEquivalents
  );
  const interestExpense = firstFinite(
    canonical.interestExpense,
    canonical.incomeStatement?.interestExpense,
    canonical.profitability?.interestExpense
  );
  const targetNetLeverage = firstFinite(summary.inputs?.maxLeverage, context.data?.debtCapacityLiteInputs?.maxLeverage);
  const coverageThreshold = firstFinite(
    summary.inputs?.minInterestCoverage,
    context.data?.debtCapacityLiteInputs?.minInterestCoverage
  );
  const revenue = firstFinite(
    canonical.revenue,
    canonical.ltmRevenue,
    canonical.incomeStatement?.revenue,
    canonical.sales
  );
  const minimumLiquidityBuffer = firstFinite(
    canonical.minimumLiquidityBuffer,
    context.data?.minimumLiquidityBuffer,
    revenue !== null ? revenue * 0.1 : null
  );
  const blendedInterestRate = firstFinite(summary.inputs?.interestRate, context.data?.debtCapacityLiteInputs?.interestRate);

  const presentCount = [
    ebitda !== null || ebit !== null,
    grossDebt !== null,
    cash !== null,
    interestExpense !== null,
    targetNetLeverage !== null || coverageThreshold !== null,
    minimumLiquidityBuffer !== null,
  ].filter(Boolean).length;

  const missingFields: string[] = [];
  if (ebitda === null && ebit === null) missingFields.push('EBITDA or EBIT');
  if (grossDebt === null) missingFields.push('Gross Debt');
  if (cash === null) missingFields.push('Cash');
  if (interestExpense === null) missingFields.push('Interest Expense');
  if (targetNetLeverage === null && coverageThreshold === null) missingFields.push('Target Net Leverage or Coverage Threshold');
  if (minimumLiquidityBuffer === null) missingFields.push('Minimum Liquidity Buffer');

  if (presentCount < 4) {
    const message = [
      'RUN STATUS: INSUFFICIENT INPUTS',
      'Missing Fields:',
      ...missingFields.map((field) => `- ${field}`),
      '',
      'This run cannot compute debt capacity.',
    ].join('\n');

    return {
      ok: false,
      missingFields,
      message,
    };
  }

  const resolvedEbitda = ebitda;
  const netDebt = grossDebt !== null && cash !== null ? grossDebt - cash : null;
  const currentNetLeverage =
    netDebt !== null && resolvedEbitda !== null && resolvedEbitda > 0 ? netDebt / resolvedEbitda : null;
  const currentInterestCoverage =
    resolvedEbitda !== null && interestExpense !== null && interestExpense > 0 ? resolvedEbitda / interestExpense : null;
  const leverageCap =
    resolvedEbitda !== null && targetNetLeverage !== null ? resolvedEbitda * targetNetLeverage : firstFinite(summary.leverageCap);
  const coverageCap =
    resolvedEbitda !== null && coverageThreshold !== null && blendedInterestRate !== null && blendedInterestRate > 0
      ? (resolvedEbitda / coverageThreshold) * (1 / blendedInterestRate)
      : firstFinite(summary.coverageCap);
  const maxDebt = firstFinite(summary.maxDebt, leverageCap !== null && coverageCap !== null ? Math.min(leverageCap, coverageCap) : null);
  const incrementalFromLeverage = grossDebt !== null && leverageCap !== null ? leverageCap - grossDebt : null;
  const incrementalFromCoverage = grossDebt !== null && coverageCap !== null ? coverageCap - grossDebt : null;
  const liquidityHeadroom = grossDebt !== null && cash !== null && minimumLiquidityBuffer !== null ? cash - minimumLiquidityBuffer : null;

  const candidateConstraints = [
    { key: 'Leverage' as const, value: incrementalFromLeverage },
    { key: 'Coverage' as const, value: incrementalFromCoverage },
    { key: 'Liquidity' as const, value: liquidityHeadroom },
  ].filter((item) => item.value !== null && Number.isFinite(item.value as number));

  const bindingConstraint =
    summary.bindingConstraint === 'leverage'
      ? 'Leverage'
      : summary.bindingConstraint === 'coverage'
        ? 'Coverage'
        : candidateConstraints.length
          ? candidateConstraints.reduce((lowest, current) =>
              (current.value as number) < (lowest.value as number) ? current : lowest
            ).key
          : null;

  const incrementalCapacity =
    candidateConstraints.length > 0
      ? candidateConstraints.reduce((lowest, current) =>
          (current.value as number) < (lowest.value as number) ? current : lowest
        ).value
      : null;

  const sensitivityEbitdaDown10 =
    resolvedEbitda !== null
      ? firstFinite(
          targetNetLeverage !== null ? resolvedEbitda * 0.9 * targetNetLeverage : null,
          coverageThreshold !== null && blendedInterestRate !== null && blendedInterestRate > 0
            ? ((resolvedEbitda * 0.9) / coverageThreshold) * (1 / blendedInterestRate)
            : null
        )
      : null;
  const sensitivityRateUp100bps =
    resolvedEbitda !== null && coverageThreshold !== null && blendedInterestRate !== null
      ? ((resolvedEbitda / coverageThreshold) * (1 / (blendedInterestRate + 0.01)))
      : null;

  return {
    ok: true,
    ebitda,
    ebit,
    grossDebt,
    cash,
    netDebt,
    interestExpense,
    targetNetLeverage,
    coverageThreshold,
    minimumLiquidityBuffer,
    blendedInterestRate,
    leverageCap,
    coverageCap,
    maxDebt,
    bindingConstraint,
    incrementalCapacity,
    currentNetLeverage,
    currentInterestCoverage,
    sensitivityEbitdaDown10,
    sensitivityRateUp100bps,
    missingFields,
  };
}

function buildReverseDcfSections(context: ReportContext): GeneratedReportSection[] {
  const dcfSummary = context.data?.dcfSummary;
  const reverseDcf = dcfSummary?.reverseDcf ?? context.data?.reverseDcf;
  const lines: string[] = [];

  const impliedGrowth = toFinite(reverseDcf?.impliedRevenueGrowth ?? reverseDcf?.impliedGrowth);
  const targetPrice = toFinite(reverseDcf?.targetPrice ?? dcfSummary?.reverseDcf?.targetPrice);
  const wacc = toFinite(reverseDcf?.wacc ?? dcfSummary?.wacc);
  const terminalGrowth = toFinite(reverseDcf?.terminalGrowth);
  const marketPrice = toFinite(dcfSummary?.marketContext?.sharePrice);
  const ev = toFinite(dcfSummary?.results?.enterpriseValue);
  const equityValue = toFinite(dcfSummary?.results?.equityValue);

  pushLine(lines, impliedGrowth !== null ? `Implied revenue CAGR: ${fmtPct(impliedGrowth * 100)}.` : null);
  pushLine(lines, targetPrice !== null ? `Target price used: ${fmtNumber(targetPrice)}.` : null);
  pushLine(lines, marketPrice !== null ? `Current market price: ${fmtNumber(marketPrice)}.` : null);
  pushLine(lines, wacc !== null ? `WACC assumption: ${fmtPct(wacc * 100)}.` : null);
  pushLine(lines, terminalGrowth !== null ? `Terminal growth assumption: ${fmtPct(terminalGrowth * 100)}.` : null);
  pushLine(lines, ev !== null ? `Enterprise value: ${fmtNumber(ev)}.` : null);
  pushLine(lines, equityValue !== null ? `Equity value: ${fmtNumber(equityValue)}.` : null);

  return [
    {
      title: 'Reverse DCF Snapshot',
      body: buildBulletBody(lines, 'Reverse DCF output: implied revenue growth rate embedded in the current valuation anchor.'),
    },
    {
      title: 'Interpretation',
      body: buildBulletBody(
        [
          impliedGrowth !== null && impliedGrowth > 0.15
            ? 'The market is pricing in aggressive growth expectations that may be demanding.'
            : impliedGrowth !== null && impliedGrowth < 0.05
              ? 'The market is pricing in conservative growth — the bar is low if fundamentals hold.'
              : impliedGrowth !== null
                ? 'Implied growth appears moderate relative to the current valuation anchor.'
                : null,
          'The result is most sensitive to WACC and terminal growth assumptions.',
          'Small changes in the discount rate can move implied expectations materially.',
        ],
        'The reverse DCF output shows growth expectations embedded in the valuation anchor.'
      ),
    },
  ];
}

function buildSections(context: ReportContext): GeneratedReportSection[] {
  switch (context.modelType) {
    case 'dcf':
      return buildDcfSections(context);
    case 'reverse-dcf':
      return buildReverseDcfSections(context);
    case 'lbo':
      return buildLboSections(context);
    case 'comps':
      return buildCompsSections(context);
    case 'precedents':
      return buildPrecedentsSections(context);
    case 'three-statement':
      return buildThreeStatementSections(context);
    case 'scorecard':
      return buildScorecardSections(context);
    case 'debt-capacity-lite':
      return buildDebtCapacitySections(context);
    case 'merger':
    case 'ma-accretion-dilution':
      return buildMergerSections(context);
    case 'operating':
      return buildOperatingSections(context);
    case 'cap-table':
      return buildCapTableSections(context);
    case 'saas-operating-model':
      return buildSaasOperatingSections(context);
    case 'dividend-discount-model':
    case 'residual-income-model':
    case 'debt-amortization-refi':
    case 'buyback-eps-accretion':
    case 'purchase-price-allocation':
    case 'working-capital-schedule':
    case 'ppe-depreciation-schedule':
    case 'runway-burn':
    case 'vc-returns-irr':
    case 'inventory-cogs':
    case 'revenue-recognition-asc606':
      return buildSpecializedTemplateSections(context);
    default:
      return [
        {
          title: 'Summary',
          body: `${formatModelLabel(context.modelType)} outputs were generated successfully.`,
        },
      ];
  }
}

function buildSummaryFallback(context: ReportContext): string {
  const company = context.companyName || context.ticker || 'Company';
  switch (context.modelType) {
    case 'debt-capacity-lite': {
      const analysis = analyzeDebtCapacityReport(context);
      if (!analysis.ok) {
        return 'RUN STATUS: INSUFFICIENT INPUTS. The current debt-capacity run is not complete enough to support a borrowing-capacity conclusion.';
      }
      const incrementalCapacity = fmtNumber(analysis.incrementalCapacity);
      const netLeverage = analysis.currentNetLeverage !== null ? `${analysis.currentNetLeverage.toFixed(2)}x` : null;
      const binding = analysis.bindingConstraint ? analysis.bindingConstraint.toLowerCase() : 'current';
      return `${company} screens to ${incrementalCapacity || 'an unreported'} incremental debt capacity under the current debt-capacity framework, with ${binding} as the binding constraint. Current net leverage is ${netLeverage || 'not available'}, and the borrowing envelope remains most sensitive to EBITDA durability and funding cost.`;
    }
    case 'scorecard':
      return `${company} has been assessed through a rules-based scorecard that emphasizes business quality, profitability, leverage, and resilience. The output is a screening view rather than a standalone investment conclusion. The most important follow-up is to test whether weaker sub-scores are cyclical, structural, or driven by incomplete inputs.`;
    case 'merger':
    case 'ma-accretion-dilution':
      return `${company} has been framed through a merger model focused on transaction structure, financing mix, and pro forma impact. The main issue is whether strategic logic and synergies offset deal friction and financing drag. Sensitivity remains highest around synergy realization, purchase price, and integration execution.`;
    case 'operating':
      return `${company} has been modeled through an operating framework centered on revenue build, margin shape, and cash consequences. The key question is whether the current plan converts topline assumptions into durable operating leverage. Forecast quality depends most on execution against revenue and spending assumptions.`;
    case 'lbo':
      return `${company} has been evaluated under an LBO framework where returns are driven by entry price, leverage, deleveraging, and exit valuation. The investment case is most exposed to cash conversion and multiple discipline. Small changes in operating execution or exit assumptions can move sponsor returns materially.`;
    case 'comps':
      return `${company} has been evaluated on a relative basis against a comparable set. The implied range is useful for framing, but it remains highly sensitive to peer selection and market multiple stability. The output should be treated as a relative valuation reference rather than intrinsic value.`;
    case 'precedents':
      return `${company} has been evaluated against a precedent transaction set to frame control-value support and transaction context. The output is only as good as the deal set, premium normalization, and strategic comparability of the selected transactions. This should be treated as transaction framing, not a substitute for full live precedents coverage.`;
    case 'three-statement': {
      const three = (context.data?.threeStatementSummary ?? {}) as Record<string, any>;
      const revenueSeries = Array.isArray(three?.incomeStatement?.revenue) ? three.incomeStatement.revenue : [];
      const ebitdaSeries = Array.isArray(three?.incomeStatement?.ebitda) ? three.incomeStatement.ebitda : [];
      const endingCashSeries = Array.isArray(three?.cashFlow?.endingCash) ? three.cashFlow.endingCash : [];
      const debtSeries = Array.isArray(three?.balanceSheet?.debt) ? three.balanceSheet.debt : [];
      const revenueStart = revenueSeries.length ? firstFinite(revenueSeries[0]) : null;
      const revenueEnd = revenueSeries.length ? firstFinite(revenueSeries[revenueSeries.length - 1]) : null;
      const ebitdaEnd = ebitdaSeries.length ? firstFinite(ebitdaSeries[ebitdaSeries.length - 1]) : null;
      const endingCash = endingCashSeries.length ? firstFinite(endingCashSeries[endingCashSeries.length - 1]) : null;
      const endingDebt = debtSeries.length ? firstFinite(debtSeries[debtSeries.length - 1]) : null;
      const cagr =
        revenueStart !== null &&
        revenueEnd !== null &&
        revenueStart > 0 &&
        revenueSeries.length > 1
          ? (Math.pow(revenueEnd / revenueStart, 1 / (revenueSeries.length - 1)) - 1) * 100
          : null;
      const margin =
        revenueEnd !== null && revenueEnd !== 0 && ebitdaEnd !== null ? (ebitdaEnd / revenueEnd) * 100 : null;

      if (revenueSeries.length || ebitdaSeries.length || endingCashSeries.length || debtSeries.length) {
        return `${company} has been modeled through an integrated three-statement framework with a projected revenue CAGR of ${cagr !== null ? fmtPct(cagr) : 'an unreported rate'} and an ending EBITDA margin of ${margin !== null ? fmtPct(margin) : 'an unreported level'}. The current run exits with ending cash of ${endingCash !== null ? fmtNumber(endingCash) : 'an unreported amount'} and ending debt of ${endingDebt !== null ? fmtNumber(endingDebt) : 'an unreported amount'}, so the main question is whether operating growth is converting into durable balance-sheet capacity rather than just accounting earnings.`;
      }

      return `${company} has been modeled through an integrated three-statement framework that ties operating assumptions to cash generation and balance-sheet outcomes. The most important sensitivities are revenue durability, margin progression, and cash conversion. Changes in working capital or financing assumptions can materially alter the end-state balance sheet.`;
    }
    case 'reverse-dcf':
      return `${company} has been evaluated through a Reverse DCF framework that solves for the implied revenue growth embedded in the current valuation anchor. This approach asks what the market is pricing in, rather than what the company is worth. The result is most sensitive to WACC and terminal growth assumptions — small changes in these inputs can materially shift the implied expectations.`;
    case 'cap-table':
      return `${company} has been framed through a cap table model focused on ownership, dilution, and post-money structure. The output is most useful for understanding how valuation, raise size, and option pool decisions reallocate control and economic ownership. Small changes in financing terms can move stakeholder outcomes materially.`;
    case 'saas-operating-model':
      return `${company} has been modeled through a SaaS operating framework centered on ARR growth, churn, gross margin, and unit economics. The key question is whether growth quality remains durable after customer attrition and acquisition cost are properly reflected. The output is most sensitive to churn discipline, CAC efficiency, and gross margin durability.`;
    case 'dividend-discount-model':
      return `${company} has been evaluated through a dividend discount framework where value is anchored to the projected payout stream and cost of equity. The conclusion is most sensitive to dividend growth durability and terminal payout assumptions. This model is most decision-useful for mature businesses with credible cash-return policies.`;
    case 'residual-income-model':
      return `${company} has been evaluated through a residual income framework that starts from book value and adds the present value of excess earnings over the equity charge. The conclusion is most sensitive to return-on-equity durability and cost-of-equity assumptions. The model is most useful when balance-sheet quality and accounting returns matter as much as terminal cash-flow assumptions.`;
    case 'debt-amortization-refi':
      return `${company} has been evaluated through a debt amortization and refinancing framework focused on paydown, maturity management, and funding-cost sensitivity. The central question is whether the current capital structure can de-risk over time without creating refinancing pressure. The output is most sensitive to amortization pace, coupon assumptions, and operating cash support.`;
    case 'buyback-eps-accretion':
      return `${company} has been evaluated through a buyback and EPS accretion framework focused on repurchase size, financing mix, and share-count reduction. The key issue is whether EPS accretion reflects real value creation or only financial engineering. The output is most sensitive to repurchase price, funding cost, and the durability of the earnings base.`;
    case 'purchase-price-allocation':
      return `${company} has been framed through a purchase price allocation model that decomposes the consideration into identifiable assets, liabilities, deferred tax effects, and residual goodwill. The main read-through is how the transaction changes future amortization and reported returns rather than just headline purchase price. The output is most sensitive to intangible valuation assumptions and deferred tax treatment.`;
    case 'working-capital-schedule':
      return `${company} has been modeled through a working capital schedule focused on receivables, inventory, payables, and cash-conversion intensity. The central question is whether growth is consuming or releasing cash through operating working capital. The output is most sensitive to DSO, DIO, and DPO assumptions.`;
    case 'ppe-depreciation-schedule':
      return `${company} has been modeled through a PP&E and depreciation schedule focused on capex cadence, asset-base growth, and depreciation burden. The main issue is how aggressively reinvestment needs consume cash relative to accounting profitability. The output is most sensitive to capex intensity and depreciation policy.`;
    case 'runway-burn':
      return `${company} has been evaluated through a runway and burn framework focused on liquidity duration under the current spend and funding assumptions. The key question is how quickly the cash balance compresses if revenue or funding assumptions disappoint. The output is most sensitive to burn discipline and any near-term financing requirement.`;
    case 'vc-returns-irr':
      return `${company} has been modeled through a venture returns framework focused on ownership at exit, MOIC, and IRR. The main issue is how much exit value and dilution are required to support target return thresholds. The output is most sensitive to entry ownership, follow-on dilution, and exit valuation.`;
    case 'inventory-cogs':
      return `${company} has been modeled through an inventory and COGS framework focused on turns, absorption, and the cash and margin consequences of inventory policy. The main question is whether inventory build supports demand or creates working-capital drag and margin risk. The output is most sensitive to turnover and purchasing assumptions.`;
    case 'revenue-recognition-asc606':
      return `${company} has been modeled through a revenue recognition framework focused on timing, deferred revenue, and contract accounting treatment. The key issue is how recognition policy changes the pattern of reported revenue and margin without changing underlying economics. The output is most sensitive to contract timing and recognition assumptions.`;
    case 'dcf':
    default:
      return `${company} has been evaluated through a DCF framework with value driven by the operating forecast, discount rate, and terminal assumptions. The output is most sensitive to long-duration assumptions, so small changes in growth or WACC can move the valuation range materially. This model should be read as a decision framework, not a single-point answer.`;
  }
}

async function maybeGenerateStructuredPayloadWithOpenAI(
  context: ReportContext,
  fallbackSections: GeneratedReportSection[],
  fallbackTitle: string,
  fallbackSubtitle: string
): Promise<StructuredReportPayload | null> {
  const apiKey = getOpenAIKey('service');
  if (!apiKey) return null;

  const models = getOpenAIModelCandidates(process.env.OPENAI_MODEL, 'gpt-5.4-pro', 'gpt-5.4');
  if (!models.length) return null;

  const fallbackSummary = buildSummaryFallback(context);

  for (const model of models) {
    try {
      const client = new OpenAI({ apiKey });
      const response = await client.chat.completions.create({
        model,
        temperature: 0.2,
        max_tokens: 900,
        messages: [
          { role: 'system', content: getReportWriterSystemPrompt(context) },
          {
            role: 'user',
            content: buildReportWriterUserPrompt(context),
          },
        ],
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) continue;
      const jsonText = extractJsonObject(content);
      if (!jsonText) continue;
      const parsed = JSON.parse(jsonText) as AiReportResponse;
      const payload = coerceAiReportPayload(parsed, fallbackTitle, fallbackSubtitle, fallbackSummary);
      if (payload) return payload;
    } catch {
      continue;
    }
  }

  return null;
}

export async function generateModelReport(context: ReportContext): Promise<GeneratedModelReport> {
  if (context.modelType === 'debt-capacity-lite') {
    const analysis = analyzeDebtCapacityReport(context);
    if (!analysis.ok) {
      const companyLabel = context.companyName || context.ticker || 'Company';
      const title = `${companyLabel} Debt Capacity Lite Report`;
      const subtitle = `Debt Capacity Lite • ${context.asOfDate || new Date().toISOString().slice(0, 10)}`;
      const sections = buildDebtCapacitySections(context);
      const summaryText = analysis.message;
      return {
        title,
        summaryText,
        markdownBody: [`# ${title}`, '', summaryText, '', ...sections.flatMap(s => [`## ${s.title}`, s.body, ''])].join('\n').trim(),
        reportPayload: {
          title,
          summaryText,
          generatedAt: new Date().toISOString(),
          subtitle,
          oneLineSummary: 'Insufficient inputs for a full debt-capacity conclusion. See missing fields below.',
          keyTakeaways: analysis.missingFields.slice(0, 3).map(f => `Missing: ${f}`),
          sections,
        },
      };
    }
  }

  const companyLabel = context.companyName || context.ticker || 'Company';
  const title = `${companyLabel} ${formatModelLabel(context.modelType)} Report`;
  const sections = buildSections(context);
  const generatedAt = new Date().toISOString();
  const subtitle = `${formatModelLabel(context.modelType)} • ${context.asOfDate || generatedAt.slice(0, 10)}`;
  const aiPayload = await maybeGenerateStructuredPayloadWithOpenAI(context, sections, title, subtitle);
  const summaryText = aiPayload?.summaryText || buildSummaryFallback(context);
  const finalSections = aiPayload?.sections || sections;
  const keyTakeaways = aiPayload?.keyTakeaways?.length ? aiPayload.keyTakeaways : extractKeyTakeaways(finalSections);

  const markdownBody = [
    `# ${title}`,
    '',
    `As of: ${context.asOfDate || new Date().toISOString().slice(0, 10)}`,
    '',
    summaryText,
    '',
    ...finalSections.flatMap((section) => [`## ${section.title}`, section.body, '']),
  ].join('\n').trim();

  return {
    title,
    summaryText,
    markdownBody,
    reportPayload: {
      title: aiPayload?.title || title,
      summaryText,
      generatedAt,
      subtitle: aiPayload?.subtitle || subtitle,
      oneLineSummary: aiPayload?.oneLineSummary || summaryText,
      keyTakeaways,
      sections: finalSections,
    },
  };
}
