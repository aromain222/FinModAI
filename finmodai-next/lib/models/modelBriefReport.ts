import ExcelJS from 'exceljs';
import OpenAI from 'openai';
import { getOpenAIKey } from '@/lib/openaiKey';

export type BriefModelType = 'dcf' | 'reverse-dcf' | 'comps' | 'three-statement';

export type CompanySnapshot = {
  companyName: string;
  ticker: string;
  sector: string | null;
  asOfDate: string;
  revenueLtm: number | null;
  ebitdaLtm: number | null;
  netIncomeLtm: number | null;
  netDebt: number | null;
  netDebtSource: 'Reported' | 'Estimated' | 'Unavailable';
};

type DisplayFormat = 'money' | 'percent' | 'text';

type BriefRow = {
  label: string;
  value: number | string | null;
  format?: DisplayFormat;
};

type BriefSection = {
  title: string;
  rows: BriefRow[];
};

export type ModelBriefReport = {
  modelType: BriefModelType;
  companySnapshot: CompanySnapshot;
  sections: BriefSection[];
  summary: string;
};

type DcfSummary = {
  results?: {
    enterpriseValue?: number;
    equityValue?: number;
    pricePerShare?: number;
    pvTerminalValue?: number;
  };
  marketContext?: {
    sharePrice?: number;
  };
};

type CompsSummary = {
  medianMultiples?: {
    evToRevenue?: number;
    evToEbitda?: number;
    peRatio?: number;
  };
  impliedValuation?: {
    pricePerShareByEvEbitda?: number;
    pricePerShareByEvRevenue?: number;
    pricePerShareByPe?: number;
    blendedPricePerShare?: number;
  };
  peers?: unknown[];
  warnings?: string[];
};

type ThreeStatementSummary = {
  years?: number[];
  incomeStatement?: {
    revenue?: number[];
    ebitda?: number[];
    netIncome?: number[];
  };
};

type ModelOutputs = {
  dcfSummary?: DcfSummary | null;
  compsSummary?: CompsSummary | null;
  threeStatementSummary?: ThreeStatementSummary | null;
};

type ReportAssumptions = {
  debt?: number;
  interestRate?: number;
};

const MODEL_BRIEF_SUMMARY_PROMPTS: Record<BriefModelType, string> = {
  dcf: `
You are writing the executive summary for a CapitalBase DCF workbook used by an investment team.
Requirements:
- one paragraph only
- 4-6 sentences
- lead with the valuation conclusion using implied value versus market price if both are available
- explain what is doing the work in the valuation, especially operating scale, leverage context, and terminal-value dependence
- state whether the setup looks supported, stretched, or highly sensitive based on the data provided
- use actual figures and percentages where available
- avoid generic phrasing, hype, or promotional language
- sound like a sharp buy-side or banking associate
`,
  'reverse-dcf': `
You are writing the executive summary for a CapitalBase reverse DCF workbook used by an investment team.
Requirements:
- one paragraph only
- 4-6 sentences
- focus on what growth or return expectations the market price appears to embed
- explain whether the implied expectations look demanding, reasonable, or conservative based on the operating context provided
- use actual figures and percentages where available
- avoid generic phrasing, hype, or promotional language
- sound like a sharp buy-side or banking associate
`,
  comps: `
You are writing the executive summary for a CapitalBase comparable companies workbook used by an investment team.
Requirements:
- one paragraph only
- 4-6 sentences
- lead with the relative valuation conclusion using implied price or valuation range if available
- explain what the peer set suggests about premium or discount versus the subject company
- note peer-set quality or multiple-dispersion risk if the inputs imply it
- use actual figures and percentages where available
- avoid generic phrasing, hype, or promotional language
- sound like a sharp buy-side or banking associate
`,
  'three-statement': `
You are writing the executive summary for a CapitalBase three-statement workbook used by an investment team.
Requirements:
- one paragraph only
- 4-6 sentences
- lead with the operating forecast conclusion, not a valuation statement
- explain the revenue, margin, and cash-generation path in practical investor language
- note any balance-sheet or financing sensitivity if the inputs imply it
- use actual figures and percentages where available
- avoid generic phrasing, hype, or promotional language
- sound like a sharp buy-side or banking associate
`,
};

function asFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatMoney(value: number | null): string {
  if (value === null) return 'N/A';
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}mm`;
  return `$${abs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })}mm`;
}

function formatSignedMoney(value: number | null): string {
  if (value === null) return 'N/A';
  const prefix = value < 0 ? '-' : '';
  return `${prefix}${formatMoney(Math.abs(value))}`;
}

function formatPercent(value: number | null, digits = 1): string {
  if (value === null) return 'N/A';
  return `${(value * 100).toFixed(digits)}%`;
}

function formatRowValue(row: BriefRow): string {
  if (row.value === null || row.value === undefined || row.value === '') return 'N/A';
  if (typeof row.value === 'number') {
    if (row.format === 'money') return formatSignedMoney(row.value);
    if (row.format === 'percent') return formatPercent(row.value);
    return row.value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return row.value;
}

function describeValuationGap(impliedUpside: number | null): string {
  if (impliedUpside === null) return 'valuation sensitivity';
  if (impliedUpside >= 0.15) return 'meaningful upside';
  if (impliedUpside >= 0.03) return 'modest upside';
  if (impliedUpside <= -0.15) return 'material downside';
  if (impliedUpside <= -0.03) return 'modest downside';
  return 'roughly fair value';
}

function buildSummaryFallback(
  modelType: BriefModelType,
  snapshot: CompanySnapshot,
  modelOutputs: ModelOutputs
): string {
  if (modelType === 'dcf') {
    const enterpriseValue = asFinite(modelOutputs?.dcfSummary?.results?.enterpriseValue);
    const equityValue = asFinite(modelOutputs?.dcfSummary?.results?.equityValue);
    const impliedPrice = asFinite(modelOutputs?.dcfSummary?.results?.pricePerShare);
    const marketPrice = asFinite(modelOutputs?.dcfSummary?.marketContext?.sharePrice);
    const pvTerminal = asFinite(modelOutputs?.dcfSummary?.results?.pvTerminalValue);
    const impliedUpside =
      impliedPrice !== null && marketPrice !== null && marketPrice !== 0
        ? impliedPrice / marketPrice - 1
        : null;
    const terminalShare =
      enterpriseValue !== null && enterpriseValue !== 0 && pvTerminal !== null
        ? pvTerminal / enterpriseValue
        : null;
    const valuationRead = describeValuationGap(impliedUpside);
    const terminalRead =
      terminalShare === null
        ? 'Terminal-value dependence cannot be cleanly assessed from the available output.'
        : terminalShare >= 0.75
        ? `Terminal value represents ${formatPercent(terminalShare)} of enterprise value, so the result is heavily long-duration and discount-rate sensitive.`
        : terminalShare >= 0.6
        ? `Terminal value accounts for ${formatPercent(terminalShare)} of enterprise value, leaving the output meaningfully exposed to long-term assumptions.`
        : `Terminal value contributes ${formatPercent(terminalShare)} of enterprise value, so the setup is driven by both the explicit forecast and the back end of the model.`;

    return `As of ${snapshot.asOfDate}, ${snapshot.companyName} (${snapshot.ticker}) screens at ${valuationRead} in this DCF, with implied enterprise value of ${formatMoney(enterpriseValue)}, implied equity value of ${formatMoney(equityValue)}, and implied value per share of ${formatMoney(impliedPrice)}${marketPrice !== null ? ` versus a market price of ${formatMoney(marketPrice)}` : ''}. The valuation is anchored by a business currently generating ${formatMoney(snapshot.revenueLtm)} of LTM revenue and ${formatMoney(snapshot.ebitdaLtm)} of LTM EBITDA${snapshot.netDebt !== null ? `, with net debt of ${formatSignedMoney(snapshot.netDebt)}` : ''}. ${terminalRead} The key judgment is whether ${snapshot.companyName}'s operating durability and cash generation can support that implied value without relying too heavily on favorable terminal assumptions.`;
  }

  if (modelType === 'reverse-dcf') {
    const reverseDcf = (modelOutputs?.dcfSummary as any)?.reverseDcf;
    const impliedGrowth = asFinite(reverseDcf?.impliedRevenueGrowth ?? reverseDcf?.impliedGrowth);
    const marketPrice = asFinite(modelOutputs?.dcfSummary?.marketContext?.sharePrice);
    return `As of ${snapshot.asOfDate}, the reverse DCF on ${snapshot.companyName} (${snapshot.ticker}) suggests the current price${marketPrice !== null ? ` of ${formatMoney(marketPrice)}` : ''} implies roughly ${formatPercent(impliedGrowth)} revenue growth expectations through the modeled period. The key question is not headline valuation, but whether that embedded growth bar is realistic for a business with ${formatMoney(snapshot.revenueLtm)} of LTM revenue and ${formatMoney(snapshot.ebitdaLtm)} of LTM EBITDA. The result is highly sensitive to the pricing anchor and discount-rate assumptions, so modest changes in those inputs can materially change the implied expectation set. The setup should be read as an expectations test, not a precise intrinsic-value call.`;
  }

  if (modelType === 'comps') {
    const peerCount = asFinite(modelOutputs?.compsSummary?.peers?.length);
    const blendedImplied = asFinite(modelOutputs?.compsSummary?.impliedValuation?.blendedPricePerShare);
    const evRev = asFinite(modelOutputs?.compsSummary?.medianMultiples?.evToRevenue);
    const evEbitda = asFinite(modelOutputs?.compsSummary?.medianMultiples?.evToEbitda);
    const pe = asFinite(modelOutputs?.compsSummary?.medianMultiples?.peRatio);
    return `As of ${snapshot.asOfDate}, the comps view on ${snapshot.companyName} (${snapshot.ticker}) frames valuation off a peer set of ${peerCount !== null ? `${peerCount.toFixed(0)} companies` : 'public peers'}, with median reference points of ${evRev !== null ? `${evRev.toFixed(1)}x EV / Revenue` : 'N/A EV / Revenue'}, ${evEbitda !== null ? `${evEbitda.toFixed(1)}x EV / EBITDA` : 'N/A EV / EBITDA'}, and ${pe !== null ? `${pe.toFixed(1)}x P / E` : 'N/A P / E'}. The blended implied value per share is ${formatMoney(blendedImplied)}, but the read-through depends on how well the peer set matches the subject company's growth, margin profile, and business quality. With ${formatMoney(snapshot.revenueLtm)} of LTM revenue and ${formatMoney(snapshot.ebitdaLtm)} of LTM EBITDA, the central question is whether the company deserves a premium, discount, or in-line multiple versus peers. This output should be treated as relative valuation evidence rather than a standalone intrinsic-value conclusion.`;
  }

  return `As of ${snapshot.asOfDate}, the three-statement forecast for ${snapshot.companyName} (${snapshot.ticker}) points to an operating path built around ${formatMoney(snapshot.revenueLtm)} of current LTM revenue and ${formatMoney(snapshot.ebitdaLtm)} of LTM EBITDA. The core read-through is whether forecast growth, margin progression, and cash conversion remain internally consistent as the balance sheet evolves. This model should be judged less on headline valuation and more on whether the income statement, cash flow statement, and financing assumptions work together coherently. The main risk remains that seemingly modest changes in revenue growth, margins, or working capital assumptions can materially alter the equity trajectory.`;
}

function buildCompanyOverview(snapshot: CompanySnapshot): BriefSection {
  return {
    title: 'Company Overview',
    rows: [
      { label: 'Name', value: snapshot.companyName, format: 'text' },
      { label: 'Ticker', value: snapshot.ticker, format: 'text' },
      { label: 'Sector', value: snapshot.sector || 'N/A', format: 'text' },
      { label: 'As of Date', value: snapshot.asOfDate, format: 'text' },
      { label: 'Revenue (LTM)', value: snapshot.revenueLtm, format: 'money' },
      { label: 'EBITDA (LTM)', value: snapshot.ebitdaLtm, format: 'money' },
      { label: 'Net Income (LTM)', value: snapshot.netIncomeLtm, format: 'money' },
      {
        label: `Net Debt (${snapshot.netDebtSource})`,
        value: snapshot.netDebt,
        format: 'money',
      },
    ],
  };
}

function buildDcfSnapshot(modelOutputs: ModelOutputs): BriefSection {
  const enterpriseValue = asFinite(modelOutputs?.dcfSummary?.results?.enterpriseValue);
  const equityValue = asFinite(modelOutputs?.dcfSummary?.results?.equityValue);
  const impliedPrice = asFinite(modelOutputs?.dcfSummary?.results?.pricePerShare);
  const marketPrice = asFinite(modelOutputs?.dcfSummary?.marketContext?.sharePrice);
  const impliedUpside =
    impliedPrice !== null && marketPrice !== null && marketPrice !== 0
      ? impliedPrice / marketPrice - 1
      : null;

  return {
    title: 'Model Snapshot',
    rows: [
      { label: 'Enterprise Value', value: enterpriseValue, format: 'money' },
      { label: 'Equity Value', value: equityValue, format: 'money' },
      { label: 'Implied Price per Share', value: impliedPrice, format: 'money' },
      { label: 'Market Price', value: marketPrice, format: 'money' },
      { label: 'Implied Upside %', value: impliedUpside, format: 'percent' },
    ],
  };
}

function buildCompsSnapshot(modelOutputs: ModelOutputs): BriefSection {
  const evRev = asFinite(modelOutputs?.compsSummary?.medianMultiples?.evToRevenue);
  const evEbitda = asFinite(modelOutputs?.compsSummary?.medianMultiples?.evToEbitda);
  const pe = asFinite(modelOutputs?.compsSummary?.medianMultiples?.peRatio);
  const impliedByEvEbitda = asFinite(modelOutputs?.compsSummary?.impliedValuation?.pricePerShareByEvEbitda);
  const impliedByEvRevenue = asFinite(modelOutputs?.compsSummary?.impliedValuation?.pricePerShareByEvRevenue);
  const impliedByPe = asFinite(modelOutputs?.compsSummary?.impliedValuation?.pricePerShareByPe);
  const blendedImplied = asFinite(modelOutputs?.compsSummary?.impliedValuation?.blendedPricePerShare);
  const impliedCandidates = [impliedByEvEbitda, impliedByEvRevenue, impliedByPe].filter(
    (v): v is number => v !== null
  );
  const impliedPrice = blendedImplied !== null
    ? blendedImplied
    : impliedCandidates.length > 0
    ? impliedCandidates.reduce((acc, v) => acc + v, 0) / impliedCandidates.length
    : null;

  return {
    title: 'Model Snapshot',
    rows: [
      { label: 'Median EV / Revenue', value: evRev, format: 'text' },
      { label: 'Median EV / EBITDA', value: evEbitda, format: 'text' },
      { label: 'Median P / E', value: pe, format: 'text' },
      { label: 'Implied Price per Share', value: impliedPrice, format: 'money' },
    ],
  };
}

function buildThreeStatementSnapshot(modelOutputs: ModelOutputs): BriefSection {
  const years: number[] = Array.isArray(modelOutputs?.threeStatementSummary?.years)
    ? modelOutputs.threeStatementSummary.years
    : [];
  const revenueSeries: number[] = Array.isArray(modelOutputs?.threeStatementSummary?.incomeStatement?.revenue)
    ? modelOutputs.threeStatementSummary.incomeStatement.revenue
    : [];
  const ebitdaSeries: number[] = Array.isArray(modelOutputs?.threeStatementSummary?.incomeStatement?.ebitda)
    ? modelOutputs.threeStatementSummary.incomeStatement.ebitda
    : [];
  const netIncomeSeries: number[] = Array.isArray(modelOutputs?.threeStatementSummary?.incomeStatement?.netIncome)
    ? modelOutputs.threeStatementSummary.incomeStatement.netIncome
    : [];

  const firstRevenue = revenueSeries.length > 0 ? asFinite(revenueSeries[0]) : null;
  const lastRevenue = revenueSeries.length > 0 ? asFinite(revenueSeries[revenueSeries.length - 1]) : null;
  const n = years.length > 1 ? years.length - 1 : revenueSeries.length > 1 ? revenueSeries.length - 1 : 0;
  const revenueCagr =
    firstRevenue !== null && lastRevenue !== null && firstRevenue > 0 && n > 0
      ? Math.pow(lastRevenue / firstRevenue, 1 / n) - 1
      : null;

  const finalEbitdaMargin =
    revenueSeries.length > 0 && ebitdaSeries.length > 0
      ? (() => {
          const rev = asFinite(revenueSeries[revenueSeries.length - 1]);
          const ebitda = asFinite(ebitdaSeries[ebitdaSeries.length - 1]);
          return rev !== null && rev !== 0 && ebitda !== null ? ebitda / rev : null;
        })()
      : null;

  const finalNetIncomeMargin =
    revenueSeries.length > 0 && netIncomeSeries.length > 0
      ? (() => {
          const rev = asFinite(revenueSeries[revenueSeries.length - 1]);
          const ni = asFinite(netIncomeSeries[netIncomeSeries.length - 1]);
          return rev !== null && rev !== 0 && ni !== null ? ni / rev : null;
        })()
      : null;

  return {
    title: 'Model Snapshot',
    rows: [
      { label: 'Revenue CAGR', value: revenueCagr, format: 'percent' },
      { label: 'Final-Year EBITDA Margin', value: finalEbitdaMargin, format: 'percent' },
      { label: 'Final-Year Net Income Margin', value: finalNetIncomeMargin, format: 'percent' },
    ],
  };
}

function buildReverseDcfSnapshot(modelOutputs: ModelOutputs): BriefSection {
  const reverseDcf = (modelOutputs?.dcfSummary as any)?.reverseDcf;
  const impliedGrowth = asFinite(reverseDcf?.impliedRevenueGrowth ?? reverseDcf?.impliedGrowth);
  const targetPrice = asFinite(reverseDcf?.targetPrice);
  const wacc = asFinite(reverseDcf?.wacc ?? (modelOutputs?.dcfSummary as any)?.wacc);
  const marketPrice = asFinite(modelOutputs?.dcfSummary?.marketContext?.sharePrice);

  return {
    title: 'Reverse DCF Snapshot',
    rows: [
      { label: 'Implied Revenue CAGR', value: impliedGrowth, format: 'percent' },
      { label: 'Target Price', value: targetPrice, format: 'money' },
      { label: 'WACC', value: wacc, format: 'percent' },
      { label: 'Market Price', value: marketPrice, format: 'money' },
    ],
  };
}

function buildModelSnapshot(modelType: BriefModelType, modelOutputs: ModelOutputs): BriefSection {
  if (modelType === 'dcf') return buildDcfSnapshot(modelOutputs);
  if (modelType === 'reverse-dcf') return buildReverseDcfSnapshot(modelOutputs);
  if (modelType === 'comps') return buildCompsSnapshot(modelOutputs);
  return buildThreeStatementSnapshot(modelOutputs);
}

function buildRiskNotes(
  modelType: BriefModelType,
  modelOutputs: ModelOutputs,
  assumptions: ReportAssumptions
): BriefSection {
  if (modelType === 'reverse-dcf') {
    return {
      title: 'Risk & Sensitivity Notes',
      rows: [
        {
          label: 'WACC sensitivity',
          value: 'Small changes in the discount rate can materially shift the implied growth expectations.',
          format: 'text',
        },
        {
          label: 'Terminal growth sensitivity',
          value: 'Terminal value assumptions dominate the reverse solve — high sensitivity to long-duration inputs.',
          format: 'text',
        },
        {
          label: 'Anchor quality',
          value: 'The quality of the result depends on the accuracy of the market cap or price anchor used.',
          format: 'text',
        },
      ],
    };
  }
  if (modelType === 'dcf') {
    const pvTerminal = asFinite(modelOutputs?.dcfSummary?.results?.pvTerminalValue);
    const ev = asFinite(modelOutputs?.dcfSummary?.results?.enterpriseValue);
    const tvShare = pvTerminal !== null && ev !== null && ev !== 0 ? pvTerminal / ev : null;
    return {
      title: 'Risk & Sensitivity Notes',
      rows: [
        { label: '% of EV from Terminal Value', value: tvShare, format: 'percent' },
        {
          label: 'Leverage sensitivity note',
          value: 'Higher net debt increases equity volatility versus enterprise-value changes.',
          format: 'text',
        },
        {
          label: 'WACC sensitivity note',
          value: 'Discount-rate movements remain a primary driver of valuation dispersion.',
          format: 'text',
        },
      ],
    };
  }
  if (modelType === 'comps') {
    const peerCount = asFinite(modelOutputs?.compsSummary?.peers?.length);
    const warning = Array.isArray(modelOutputs?.compsSummary?.warnings) && modelOutputs.compsSummary.warnings.length > 0
      ? modelOutputs.compsSummary.warnings[0]
      : 'Relative valuation depends on peer-set quality and multiple stability.';
    return {
      title: 'Risk & Sensitivity Notes',
      rows: [
        { label: 'Peer set breadth', value: peerCount !== null ? `${peerCount} peers` : 'N/A', format: 'text' },
        { label: 'Multiple dispersion note', value: warning, format: 'text' },
        {
          label: 'Market regime note',
          value: 'Comparable multiples can re-rate quickly with changes in rates, growth, and risk appetite.',
          format: 'text',
        },
      ],
    };
  }
  const debt = asFinite(assumptions?.debt);
  const interestRate = asFinite(assumptions?.interestRate);
  return {
    title: 'Risk & Sensitivity Notes',
    rows: [
      {
        label: 'Operating leverage note',
        value: 'Forecast outcomes are sensitive to revenue growth persistence and margin execution.',
        format: 'text',
      },
      {
        label: 'Working capital note',
        value: 'Cash conversion assumptions materially affect free-cash-flow trajectory.',
        format: 'text',
      },
      {
        label: 'Financing note',
        value:
          debt !== null || interestRate !== null
            ? `Debt and interest assumptions (debt: ${debt ?? 'N/A'}, rate: ${interestRate !== null ? `${(interestRate * 100).toFixed(1)}%` : 'N/A'}) influence earnings and cash outcomes.`
            : 'Financing assumptions should be monitored as they can materially alter projected equity trajectory.',
        format: 'text',
      },
    ],
  };
}

async function generateExecutiveSummary(
  modelType: BriefModelType,
  snapshot: CompanySnapshot,
  sections: BriefSection[],
  modelOutputs: ModelOutputs
): Promise<string> {
  const fallback = buildSummaryFallback(modelType, snapshot, modelOutputs);

  const apiKey = getOpenAIKey('service');
  if (!apiKey) return fallback;

  const serializedSections = sections
    .map(
      (section) =>
        `${section.title}: ${section.rows.map((row) => `${row.label}=${formatRowValue(row)}`).join('; ')}`
    )
    .join('\n');

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: MODEL_BRIEF_SUMMARY_PROMPTS[modelType].trim() },
        {
          role: 'user',
          content: `Model Type: ${modelType}\nCompany: ${snapshot.companyName} (${snapshot.ticker})\nSector: ${snapshot.sector ?? 'N/A'}\nAs of Date: ${snapshot.asOfDate}\n\nData:\n${serializedSections}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 220,
    });
    const content = completion.choices[0]?.message?.content?.trim();
    return content ? content.replace(/\n+/g, ' ') : fallback;
  } catch {
    return fallback;
  }
}

export async function generateModelReport(params: {
  modelType: BriefModelType;
  companySnapshot: CompanySnapshot;
  modelOutputs: ModelOutputs;
  assumptions: ReportAssumptions;
}): Promise<ModelBriefReport> {
  const companyOverview = buildCompanyOverview(params.companySnapshot);
  const modelSnapshot = buildModelSnapshot(params.modelType, params.modelOutputs);
  const riskNotes = buildRiskNotes(params.modelType, params.modelOutputs, params.assumptions);
  const sections = [companyOverview, modelSnapshot, riskNotes];
  const summary = await generateExecutiveSummary(
    params.modelType,
    params.companySnapshot,
    sections,
    params.modelOutputs
  );
  return {
    modelType: params.modelType,
    companySnapshot: params.companySnapshot,
    sections,
    summary,
  };
}

function writeValueCell(cell: ExcelJS.Cell, row: BriefRow): void {
  if (row.value === null || row.value === undefined || row.value === '') {
    cell.value = '—';
    cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF9CA3AF' }, italic: true };
    cell.alignment = { vertical: 'middle', horizontal: 'right' };
    return;
  }

  if (typeof row.value === 'number') {
    cell.value = row.value;
    if (row.format === 'money') cell.numFmt = '#,##0;(#,##0)';
    if (row.format === 'percent') cell.numFmt = '0.0%';
    cell.alignment = { vertical: 'middle', horizontal: 'right' };
  } else {
    cell.value = row.value;
    cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  }
  cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF000000' } };
}

export async function upsertModelBriefSheet(
  workbook: ExcelJS.Workbook,
  report: ModelBriefReport
): Promise<void> {
  const existing = workbook.getWorksheet('Model Brief');
  if (existing) {
    workbook.removeWorksheet(existing.id);
  }

  const sheet = workbook.addWorksheet('Model Brief');
  (sheet as any).orderNo = 1;
  for (const ws of workbook.worksheets) {
    if (ws.name !== 'Model Brief') {
      (ws as any).orderNo = ((ws as any).orderNo || 1) + 1;
    }
  }

  sheet.properties.showGridLines = false;
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 3 }];
  sheet.getColumn(1).width = 36;
  sheet.getColumn(2).width = 42;
  sheet.getColumn(3).width = 14;
  sheet.getColumn(4).width = 14;

  sheet.getCell(1, 1).value = 'Model Brief';
  sheet.mergeCells(1, 1, 1, 4);
  sheet.getCell(1, 1).font = { name: 'Calibri', size: 17, bold: true, color: { argb: 'FF111827' } };
  sheet.getCell(1, 1).alignment = { vertical: 'middle', horizontal: 'center' };

  sheet.getCell(2, 1).value = 'All figures in USD millions unless otherwise noted.';
  sheet.mergeCells(2, 1, 2, 4);
  sheet.getCell(2, 1).font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF4B5563' } };
  sheet.getCell(2, 1).alignment = { vertical: 'middle', horizontal: 'center' };

  let row = 4;
  for (const section of report.sections) {
    sheet.getCell(row, 1).value = section.title;
    sheet.mergeCells(row, 1, row, 4);
    const sectionHeader = sheet.getCell(row, 1);
    sectionHeader.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF2C3E50' } };
    sectionHeader.alignment = { vertical: 'middle', horizontal: 'left' };
    row += 1;

    for (const item of section.rows) {
      const labelCell = sheet.getCell(row, 1);
      labelCell.value = item.label;
      labelCell.font = { name: 'Calibri', size: 11, color: { argb: 'FF000000' } };
      labelCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      writeValueCell(sheet.getCell(row, 2), item);
      row += 1;
    }

    row += 1;
  }

  sheet.getCell(row, 1).value = 'Executive Summary';
  sheet.mergeCells(row, 1, row, 4);
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF2C3E50' } };
  row += 1;

  sheet.mergeCells(row, 1, row + 4, 4);
  const summaryCell = sheet.getCell(row, 1);
  summaryCell.value = report.summary;
  summaryCell.font = { name: 'Calibri', size: 11, color: { argb: 'FF000000' } };
  summaryCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
}
