import type { StructuredReportPayload } from '@/lib/reportTypes';
import type { AssumptionItem, ModelRunReportData, ReportTable, SnapshotItem } from '@/lib/reports/modelRunReport';

type NarrativeSection = {
  title: string;
  kind: 'paragraph' | 'bullets' | 'numbered';
  items: string[];
};

function formatMoney(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return `$${value.toLocaleString('en-US')}mm`;
}

function formatPercent(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return `${(value * 100).toFixed(1)}%`;
}

function formatMultiple(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return `${value.toFixed(2)}x`;
}

function formatValue(item: SnapshotItem | AssumptionItem | undefined): string | null {
  if (!item) return null;
  if (item.value === null) return null;
  if (typeof item.value === 'string') return item.value;
  if (item.format === 'money') return formatMoney(item.value);
  if (item.format === 'percent') return formatPercent(item.value);
  if (item.format === 'multiple') return formatMultiple(item.value);
  return item.value.toLocaleString('en-US');
}

function findItem<T extends SnapshotItem | AssumptionItem>(items: T[], matcher: RegExp): T | undefined {
  return items.find((item) => matcher.test(item.label));
}

function toFinite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,%xX,\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function findTableValue(tables: ReportTable[], matcher: RegExp): number | null {
  for (const table of tables) {
    for (const row of table.rows) {
      const label = typeof row[0] === 'string' ? row[0] : '';
      if (!matcher.test(label)) continue;

      for (let i = row.length - 1; i >= 1; i -= 1) {
        const value = toFinite(row[i]);
        if (value !== null) return value;
      }
    }
  }

  return null;
}

function humanModelLabel(modelType: string): string {
  const map: Record<string, string> = {
    DCF: 'DCF',
    COMPS: 'Comparable Company Analysis',
    FOOTBALL_FIELD: 'Football Field',
    PRECEDENTS: 'Precedent Transactions Analysis',
    LBO: 'LBO',
    MERGER: 'Merger Model',
    THREE_STATEMENT: 'Three-Statement Model',
    SCORECARD: 'Fundamentals Scorecard',
    DEBT_CAPACITY_LITE: 'Debt Capacity Review',
  };

  return map[modelType] ?? modelType.replace(/_/g, ' ');
}

function buildTitle(data: ModelRunReportData): string {
  const company = data.companyName || data.ticker;
  const map: Record<string, string> = {
    THREE_STATEMENT: `${company} Integrated Forecast Review`,
    DCF: `${company} Valuation Review`,
    COMPS: `${company} Comparable Valuation Review`,
    FOOTBALL_FIELD: `${company} Football Field Review`,
    PRECEDENTS: `${company} Transaction Benchmark Review`,
    LBO: `${company} LBO Underwriting Review`,
    MERGER: `${company} Merger Model Review`,
    SCORECARD: `${company} Fundamentals Review`,
    DEBT_CAPACITY_LITE: `${company} Debt Capacity Review`,
  };

  return map[data.modelType] ?? `${company} ${humanModelLabel(data.modelType)} Review`;
}

function buildSubtitle(data: ModelRunReportData): string {
  return `${humanModelLabel(data.modelType)} • As of ${data.asOfDate}`;
}

function buildThreeStatementNarrative(data: ModelRunReportData): {
  paragraphs: string[];
  keyTakeaways: string[];
  sections: NarrativeSection[];
} {
  const startRevenue = findItem(data.snapshotItems, /start revenue/i);
  const endRevenue = findItem(data.snapshotItems, /end revenue/i);
  const revenueCagr = findItem(data.snapshotItems, /revenue cagr/i);
  const endMargin = findItem(data.snapshotItems, /ebitda margin/i);
  const grossMargin = findItem(data.assumptions, /gross margin/i);
  const opexRatio = findItem(data.assumptions, /operating expenses.*revenue|opex.*revenue/i);
  const growthRate = findItem(data.assumptions, /growth rate/i);
  const endingCash = findTableValue(data.keyTables, /ending cash|cash\b/i);
  const endingDebt = findTableValue(data.keyTables, /\bdebt\b/i);

  const startRevenueText = formatValue(startRevenue);
  const endRevenueText = formatValue(endRevenue);
  const revenueCagrText = formatValue(revenueCagr);
  const endMarginText = formatValue(endMargin);
  const grossMarginText = formatValue(grossMargin);
  const opexRatioText = formatValue(opexRatio);
  const growthRateText = formatValue(growthRate);
  const endingCashText = formatMoney(endingCash);
  const endingDebtText = formatMoney(endingDebt);

  const paragraph1 = [
    startRevenueText && endRevenueText && revenueCagrText
      ? `${data.companyName} is being underwritten on a revenue path from ${startRevenueText} to ${endRevenueText}, which implies ${revenueCagrText} growth across the modeled period.`
      : `${data.companyName} is being framed through an integrated forecast that links growth, profitability, cash flow, and the balance sheet over the full model horizon.`,
    endMarginText
      ? `The run exits at an EBITDA margin of ${endMarginText}, so the core question is whether that operating profile is realistic for a company of this scale.`
      : 'The quality of the run depends on whether the modeled operating profile is realistic, not just internally linked.',
  ].join(' ');

  const paragraph2 = [
    endingCashText || endingDebtText
      ? `The balance-sheet outcome matters as much as the income statement: the run ends with ${endingCashText ? `cash of ${endingCashText}` : 'an unreported cash balance'}${endingDebtText ? ` and debt of ${endingDebtText}` : ''}.`
      : 'Cash conversion is the main gating item because small changes in working capital, capex, or financing assumptions will move the balance-sheet outcome quickly.',
    grossMarginText || opexRatioText
      ? `Gross margin of ${grossMarginText || 'an unreported level'} and operating expenses at ${opexRatioText || 'an unreported ratio'} of revenue imply the model is leaning on stable cost discipline rather than margin expansion alone.`
      : 'This run should be used for planning only if the cost structure and cash-conversion assumptions hold together under a slower-growth case.',
  ].join(' ');

  const paragraph3 = [
    `The next review should focus on the assumptions that actually move ending cash and funding capacity, not just the topline build.`,
    growthRateText ? `Current growth assumptions start at ${growthRateText}, so the sensitivity work should show how quickly the balance sheet weakens if that trajectory slips.` : 'The sensitivity work should make clear how fast the balance sheet weakens if revenue growth or margins disappoint.',
  ].join(' ');

  const keyTakeaways = [
    revenueCagrText ? `Revenue CAGR: ${revenueCagrText}` : null,
    endMarginText ? `Ending EBITDA margin: ${endMarginText}` : null,
    endingCashText ? `Ending cash: ${endingCashText}` : null,
    endingDebtText ? `Ending debt: ${endingDebtText}` : null,
  ].filter((item): item is string => Boolean(item));

  const sections: NarrativeSection[] = [
    {
      title: 'Forecast Call',
      kind: 'paragraph',
      items: [
        `${data.companyName} screens as a usable planning model only if the cash build and balance-sheet path hold under more conservative working-capital and capex assumptions.`,
      ],
    },
    {
      title: 'What The Model Shows',
      kind: 'bullets',
      items: [
        startRevenueText && endRevenueText ? `Revenue moves from ${startRevenueText} to ${endRevenueText} over the model horizon.` : null,
        revenueCagrText ? `Revenue CAGR is ${revenueCagrText}.` : null,
        endMarginText ? `Ending EBITDA margin is ${endMarginText}.` : null,
        endingCashText ? `Ending cash lands at ${endingCashText}.` : null,
        endingDebtText ? `Ending debt lands at ${endingDebtText}.` : null,
      ].filter((item): item is string => Boolean(item)),
    },
    {
      title: 'What Drives The Outcome',
      kind: 'bullets',
      items: [
        growthRateText ? `Growth assumptions begin at ${growthRateText}, so topline durability remains the first-order driver.` : 'Topline durability remains the first-order driver of the forecast.',
        grossMarginText ? `Gross margin is held at ${grossMarginText}, which leaves limited room to rescue the case through incremental mix improvement.` : 'Margin durability matters because the run does not have much room for operational miss.',
        opexRatioText ? `Operating expenses run at ${opexRatioText} of revenue, so cost discipline is a key determinant of conversion into cash.` : 'Expense control and reinvestment pacing will determine whether revenue growth converts into cash.',
      ],
    },
    {
      title: 'Key Risks And Constraints',
      kind: 'bullets',
      items: [
        'Working-capital assumptions can swing ending cash more than the headline income statement suggests.',
        'Capex or reinvestment needs can compress free cash flow even if operating margins look stable.',
        'A formally linked model can still be decision-weak if financing and balance-sheet assumptions are too static.',
      ],
    },
    {
      title: 'What To Check Next',
      kind: 'numbered',
      items: [
        'Stress working capital and capex together and recheck ending cash.',
        'Test a slower-revenue case and measure the impact on liquidity rather than only on earnings.',
        'Reconcile financing assumptions to the balance-sheet end state before using the run in planning or valuation work.',
      ],
    },
  ];

  return { paragraphs: [paragraph1, paragraph2, paragraph3], keyTakeaways, sections };
}

function buildDcfNarrative(data: ModelRunReportData): {
  paragraphs: string[];
  keyTakeaways: string[];
  sections: NarrativeSection[];
} {
  const implied = findItem(data.snapshotItems, /implied price/i);
  const ev = findItem(data.snapshotItems, /enterprise value/i);
  const wacc = findItem(data.snapshotItems, /\bwacc\b/i);
  const terminalPct = findItem(data.snapshotItems, /terminal value/i);
  const impliedText = formatValue(implied);
  const evText = formatValue(ev);
  const waccText = formatValue(wacc);
  const terminalPctText = formatValue(terminalPct);

  const paragraphs = [
    `${data.companyName} is being framed through a DCF where the base valuation is anchored by the operating forecast and the discounting assumptions rather than by current trading levels alone.`,
    `${impliedText ? `The run implies ${impliedText} per share` : 'The implied share value is not clearly populated'}${evText ? ` on enterprise value of ${evText}` : ''}, and the result should be read through the sensitivity of WACC and terminal assumptions rather than as a single-point fair value.`,
    `${terminalPctText ? `Terminal value contributes ${terminalPctText} of enterprise value, which means long-duration assumptions are doing a large share of the work.` : 'The main question is whether the valuation rests too heavily on long-duration assumptions.'} ${waccText ? `Current WACC is ${waccText}.` : ''}`.trim(),
  ];

  return {
    paragraphs,
    keyTakeaways: [
      impliedText ? `Implied price: ${impliedText}` : null,
      evText ? `Enterprise value: ${evText}` : null,
      waccText ? `WACC: ${waccText}` : null,
      terminalPctText ? `Terminal value share: ${terminalPctText}` : null,
    ].filter((item): item is string => Boolean(item)),
    sections: [
      {
        title: 'Valuation Call',
        kind: 'paragraph',
        items: ['Use this run as a valuation range and sensitivity framework, not as a standalone price target without a cross-check against market expectations.'],
      },
      {
        title: 'What The Model Shows',
        kind: 'bullets',
        items: [
          impliedText ? `Implied value per share is ${impliedText}.` : null,
          evText ? `Enterprise value is ${evText}.` : null,
          waccText ? `WACC is ${waccText}.` : null,
          terminalPctText ? `Terminal value contributes ${terminalPctText} of enterprise value.` : null,
        ].filter((item): item is string => Boolean(item)),
      },
      {
        title: 'Key Risks And Constraints',
        kind: 'bullets',
        items: [
          'Small changes in WACC and terminal growth can move the valuation materially.',
          'If terminal value dominates, the run is weaker as a near-term decision anchor.',
          'Forecast quality matters more than spreadsheet precision when the valuation rests on long-duration assumptions.',
        ],
      },
      {
        title: 'What To Check Next',
        kind: 'numbered',
        items: [
          'Run a tighter WACC and terminal-growth sensitivity table.',
          'Benchmark the operating forecast against current consensus and recent results.',
          'Separate near-term execution risk from terminal assumptions before using the base case in a meeting.',
        ],
      },
    ],
  };
}

function buildCompsNarrative(data: ModelRunReportData): {
  paragraphs: string[];
  keyTakeaways: string[];
  sections: NarrativeSection[];
} {
  const evRevenue = findItem(data.snapshotItems, /ev \/ revenue/i);
  const evEbitda = findItem(data.snapshotItems, /ev \/ ebitda/i);
  const pe = findItem(data.snapshotItems, /p \/ e/i);
  const implied = findItem(data.snapshotItems, /implied price/i);
  const peerCount = findTableValue(data.keyTables, /peer count|selected peers/i);
  const impliedText = formatValue(implied);

  return {
    paragraphs: [
      `${data.companyName} is being framed on a relative basis, so the quality of the conclusion depends more on peer quality and multiple context than on spreadsheet mechanics.`,
      `${impliedText ? `The blended implied price is ${impliedText}.` : 'The implied price is not clearly populated.'} The range should be treated as a reference point for relative valuation, not a substitute for intrinsic value.`,
      `The next judgment call is whether the selected peers actually capture the subject’s growth, margin, and business-model profile, or whether the range is being distorted by weak comparability.`,
    ],
    keyTakeaways: [
      formatValue(evRevenue) ? `Median EV / Revenue: ${formatValue(evRevenue)}` : null,
      formatValue(evEbitda) ? `Median EV / EBITDA: ${formatValue(evEbitda)}` : null,
      formatValue(pe) ? `Median P / E: ${formatValue(pe)}` : null,
      impliedText ? `Blended implied price: ${impliedText}` : null,
    ].filter((item): item is string => Boolean(item)),
    sections: [
      {
        title: 'Relative Valuation Call',
        kind: 'paragraph',
        items: ['The output is only as defensible as the peer set. Use it to frame valuation and debate premium or discount, not to force a false sense of precision.'],
      },
      {
        title: 'What The Model Shows',
        kind: 'bullets',
        items: [
          formatValue(evRevenue) ? `Median EV / Revenue is ${formatValue(evRevenue)}.` : null,
          formatValue(evEbitda) ? `Median EV / EBITDA is ${formatValue(evEbitda)}.` : null,
          formatValue(pe) ? `Median P / E is ${formatValue(pe)}.` : null,
          impliedText ? `Blended implied price is ${impliedText}.` : null,
          peerCount !== null ? `Peer count in the selected set is ${peerCount.toFixed(0)}.` : null,
        ].filter((item): item is string => Boolean(item)),
      },
      {
        title: 'Key Risks And Constraints',
        kind: 'bullets',
        items: [
          'Weak peer comparability can make the range look precise while conveying little.',
          'Fast sector re-rating can stale a comps output quickly.',
          'The subject can deserve a premium or discount for reasons the raw multiple screen does not capture.',
        ],
      },
      {
        title: 'What To Check Next',
        kind: 'numbered',
        items: [
          'Tighten the peer set and remove weak comparables.',
          'Check where the subject screens on growth, margin, and balance-sheet quality versus peers.',
          'Reframe the range if the sector has re-rated or if market levels have moved since the run was built.',
        ],
      },
    ],
  };
}

function buildDefaultNarrative(data: ModelRunReportData): {
  paragraphs: string[];
  keyTakeaways: string[];
  sections: NarrativeSection[];
} {
  const metrics = data.snapshotItems.slice(0, 4).map((item) => `${item.label}: ${formatValue(item)}`).filter((item): item is string => !item.endsWith(': null'));
  const assumptions = data.assumptions.slice(0, 4).map((item) => `${item.label}: ${formatValue(item)}`).filter((item): item is string => !item.endsWith(': null'));

  return {
    paragraphs: [
      `${data.companyName} is being reviewed through a ${humanModelLabel(data.modelType).toLowerCase()} lens using the current run outputs and assumptions.`,
      `${metrics.length ? `The headline outputs are ${metrics.join('; ')}.` : 'Headline outputs were sparse in this run, so the conclusion should be treated cautiously.'}`,
      `${assumptions.length ? `The main drivers are ${assumptions.join('; ')}.` : 'The next review should identify which assumptions are actually driving the headline result.'}`,
    ],
    keyTakeaways: metrics.slice(0, 4),
    sections: [
      {
        title: 'Model Call',
        kind: 'paragraph',
        items: ['This run should be used as a structured decision aid, not as a substitute for judgment on missing fields and assumption quality.'],
      },
      {
        title: 'What The Model Shows',
        kind: 'bullets',
        items: metrics.length ? metrics : ['Headline outputs were not fully populated in this run.'],
      },
      {
        title: 'What To Check Next',
        kind: 'numbered',
        items: [
          'Validate the most important assumptions directly from the model tables.',
          'Stress the variables that drive the headline output.',
          'Confirm the run is complete enough before using it in a decision meeting.',
        ],
      },
    ],
  };
}

export function buildModelRunNarrative(data: ModelRunReportData): {
  title: string;
  subtitle: string;
  oneLineSummary: string;
  summaryParagraphs: string[];
  keyTakeaways: string[];
  sections: NarrativeSection[];
} {
  const specialized =
    data.modelType === 'THREE_STATEMENT'
      ? buildThreeStatementNarrative(data)
      : data.modelType === 'DCF'
        ? buildDcfNarrative(data)
        : data.modelType === 'COMPS'
          ? buildCompsNarrative(data)
          : buildDefaultNarrative(data);

  return {
    title: buildTitle(data),
    subtitle: buildSubtitle(data),
    oneLineSummary: specialized.paragraphs[0] ?? `${data.companyName} ${humanModelLabel(data.modelType)} review.`,
    summaryParagraphs: specialized.paragraphs,
    keyTakeaways: specialized.keyTakeaways,
    sections: specialized.sections,
  };
}

export function buildModelRunStructuredPayload(data: ModelRunReportData): StructuredReportPayload {
  const narrative = buildModelRunNarrative(data);
  return {
    title: narrative.title,
    subtitle: narrative.subtitle,
    generatedAt: data.generatedAt,
    summaryText: narrative.summaryParagraphs.join(' '),
    oneLineSummary: narrative.oneLineSummary,
    keyTakeaways: narrative.keyTakeaways,
    sections: narrative.sections.map((section) => ({
      title: section.title,
      body:
        section.kind === 'paragraph'
          ? section.items.join('\n\n')
          : section.kind === 'numbered'
            ? section.items.map((item, index) => `${index + 1}. ${item}`).join('\n')
            : section.items.map((item) => `- ${item}`).join('\n'),
    })),
  };
}
