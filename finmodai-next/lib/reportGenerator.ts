import { generateTextWithProviderFallback } from '@/lib/llm/generateText';
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

type NarrativeSectionId = 'decision' | 'risks' | 'next';

type ModelNarrativeConfig = {
  decisionTitle: string;
  riskTitle: string;
  nextTitle: string;
  decisionToMake: string;
  riskLens: string;
  order: NarrativeSectionId[];
};

const MODEL_NARRATIVE_CONFIG: Record<ReportModelType, ModelNarrativeConfig> = {
  dcf: {
    decisionTitle: 'Valuation Framing',
    riskTitle: 'Valuation Risks And Constraints',
    nextTitle: 'Valuation Workplan',
    decisionToMake: 'Decide whether intrinsic value versus the current price supports action or only a watch list stance.',
    riskLens: 'Focus on discount-rate sensitivity, terminal-value concentration, and whether the forecast is doing too much work.',
    order: ['decision', 'risks', 'next'],
  },
  'reverse-dcf': {
    decisionTitle: 'Expectation Framing',
    riskTitle: 'Expectation Risks And Constraints',
    nextTitle: 'Expectation Workplan',
    decisionToMake: 'Decide whether the market is already pricing in expectations that are too demanding or too conservative.',
    riskLens: 'Focus on the price anchor, implied-growth sensitivity, and false precision from reverse-engineered assumptions.',
    order: ['decision', 'risks', 'next'],
  },
  lbo: {
    decisionTitle: 'Underwriting Framing',
    riskTitle: 'Underwriting Risks',
    nextTitle: 'Underwriting Workplan',
    decisionToMake: 'Decide whether the deal clears return thresholds with enough downside protection.',
    riskLens: 'Focus on entry valuation, deleveraging realism, cash conversion, and exit-multiple compression.',
    order: ['decision', 'risks', 'next'],
  },
  comps: {
    decisionTitle: 'Relative Valuation Framing',
    riskTitle: 'Peer Set Risks',
    nextTitle: 'Peer Workplan',
    decisionToMake: 'Decide where the company should trade relative to peers and whether the current multiple is misframed.',
    riskLens: 'Focus on peer-set quality, multiple regime change, and weak comparability.',
    order: ['decision', 'risks', 'next'],
  },
  'football-field': {
    decisionTitle: 'Range Framing',
    riskTitle: 'Range Risks',
    nextTitle: 'Range Workplan',
    decisionToMake: 'Decide whether the valuation methods cluster tightly enough to support a usable market-value frame.',
    riskLens: 'Focus on method dispersion, denominator quality, and whether the field is being driven by weak peer or transaction anchors.',
    order: ['decision', 'risks', 'next'],
  },
  precedents: {
    decisionTitle: 'Transaction Framing',
    riskTitle: 'Precedent Risks',
    nextTitle: 'Precedent Workplan',
    decisionToMake: 'Decide whether precedent transactions genuinely support the control-value frame being discussed.',
    riskLens: 'Focus on deal comparability, premium distortion, and cycle mismatch.',
    order: ['decision', 'risks', 'next'],
  },
  merger: {
    decisionTitle: 'Transaction Decision Framing',
    riskTitle: 'Transaction Risks',
    nextTitle: 'Transaction Workplan',
    decisionToMake: 'Decide whether the transaction makes strategic and per-share sense after financing and execution risk.',
    riskLens: 'Focus on synergy timing, financing drag, integration friction, and scenario fragility.',
    order: ['decision', 'risks', 'next'],
  },
  'ma-accretion-dilution': {
    decisionTitle: 'Accretion Decision Framing',
    riskTitle: 'Accretion Risks',
    nextTitle: 'Accretion Workplan',
    decisionToMake: 'Decide whether accretion survives realistic financing and integration assumptions.',
    riskLens: 'Focus on synergy slippage, financing mix, one-time costs, and whether accretion is only optical.',
    order: ['decision', 'risks', 'next'],
  },
  operating: {
    decisionTitle: 'Operating Plan Framing',
    riskTitle: 'Execution Risks',
    nextTitle: 'Operating Workplan',
    decisionToMake: 'Decide whether the operating plan is credible enough to use for planning or investor communication.',
    riskLens: 'Focus on revenue conversion, cost control, working-capital drift, and cash consequences.',
    order: ['decision', 'risks', 'next'],
  },
  'three-statement': {
    decisionTitle: 'Forecast Framing',
    riskTitle: 'Forecast Risks',
    nextTitle: 'Forecast Workplan',
    decisionToMake: 'Decide whether the integrated forecast is internally consistent enough to rely on for valuation or planning.',
    riskLens: 'Focus on cash conversion, working capital, capex burden, and balance-sheet stress.',
    order: ['decision', 'risks', 'next'],
  },
  scorecard: {
    decisionTitle: 'Screening Framing',
    riskTitle: 'Screening Risks',
    nextTitle: 'Screening Workplan',
    decisionToMake: 'Decide whether the company merits deeper work rather than whether it is fully underwritten.',
    riskLens: 'Focus on incomplete inputs, sector context, and the limits of rules-based screening.',
    order: ['decision', 'risks', 'next'],
  },
  'debt-capacity-lite': {
    decisionTitle: 'Financing Framing',
    riskTitle: 'Financing Risks',
    nextTitle: 'Financing Workplan',
    decisionToMake: 'Decide how much debt the business can support and which constraint binds first.',
    riskLens: 'Focus on EBITDA quality, borrowing cost sensitivity, covenant pressure, and missing debt inputs.',
    order: ['decision', 'risks', 'next'],
  },
  'cap-table': {
    decisionTitle: 'Dilution Framing',
    riskTitle: 'Ownership Risks',
    nextTitle: 'Capital Structure Workplan',
    decisionToMake: 'Decide whether the financing structure creates acceptable dilution and control outcomes.',
    riskLens: 'Focus on valuation sensitivity, option-pool changes, and hidden control effects.',
    order: ['decision', 'risks', 'next'],
  },
  'saas-operating-model': {
    decisionTitle: 'ARR Quality Framing',
    riskTitle: 'Unit-Economic Risks',
    nextTitle: 'KPI Workplan',
    decisionToMake: 'Decide whether recurring-revenue quality and unit economics support the plan.',
    riskLens: 'Focus on churn, CAC inflation, margin durability, and cash burn hidden beneath ARR growth.',
    order: ['decision', 'risks', 'next'],
  },
  'dividend-discount-model': {
    decisionTitle: 'Payout Valuation Framing',
    riskTitle: 'Payout Risks',
    nextTitle: 'Payout Workplan',
    decisionToMake: 'Decide whether the payout stream supports current value under a defensible dividend path.',
    riskLens: 'Focus on payout durability, cost of equity, and terminal-growth sensitivity.',
    order: ['decision', 'risks', 'next'],
  },
  'residual-income-model': {
    decisionTitle: 'Franchise Return Framing',
    riskTitle: 'Residual Income Risks',
    nextTitle: 'Residual Income Workplan',
    decisionToMake: 'Decide whether excess returns above the equity charge justify the valuation frame.',
    riskLens: 'Focus on opening book value, ROE fade, and accounting distortions.',
    order: ['decision', 'risks', 'next'],
  },
  'debt-amortization-refi': {
    decisionTitle: 'Capital Structure Framing',
    riskTitle: 'Refinancing Risks',
    nextTitle: 'Refinancing Workplan',
    decisionToMake: 'Decide whether the debt stack can be managed through maturity and refinancing windows.',
    riskLens: 'Focus on maturity walls, rate resets, liquidity drawdown, and refinancing feasibility.',
    order: ['decision', 'risks', 'next'],
  },
  'buyback-eps-accretion': {
    decisionTitle: 'Capital Allocation Framing',
    riskTitle: 'Repurchase Risks',
    nextTitle: 'Capital Allocation Workplan',
    decisionToMake: 'Decide whether repurchases create real value rather than only EPS optics.',
    riskLens: 'Focus on repurchase price, financing cost, leverage effects, and opportunity cost.',
    order: ['decision', 'risks', 'next'],
  },
  'purchase-price-allocation': {
    decisionTitle: 'Purchase Accounting Framing',
    riskTitle: 'Accounting Risks',
    nextTitle: 'Purchase Accounting Workplan',
    decisionToMake: 'Decide whether the proposed allocation creates acceptable post-close accounting consequences.',
    riskLens: 'Focus on goodwill reliance, intangible valuation, deferred taxes, and amortization drag.',
    order: ['decision', 'risks', 'next'],
  },
  'working-capital-schedule': {
    decisionTitle: 'Cash Conversion Framing',
    riskTitle: 'Working Capital Risks',
    nextTitle: 'Cash Conversion Workplan',
    decisionToMake: 'Decide whether working-capital intensity supports the broader liquidity and forecast case.',
    riskLens: 'Focus on DSO, DIO, DPO, seasonality, and hidden cash drag.',
    order: ['decision', 'risks', 'next'],
  },
  'ppe-depreciation-schedule': {
    decisionTitle: 'Reinvestment Framing',
    riskTitle: 'Reinvestment Risks',
    nextTitle: 'Reinvestment Workplan',
    decisionToMake: 'Decide whether capex and depreciation assumptions support the modeled cash profile.',
    riskLens: 'Focus on capex understatement, useful-life errors, and distorted cash conversion.',
    order: ['decision', 'risks', 'next'],
  },
  'runway-burn': {
    decisionTitle: 'Liquidity Framing',
    riskTitle: 'Runway Risks',
    nextTitle: 'Liquidity Workplan',
    decisionToMake: 'Decide when capital must be raised and what actions extend survival.',
    riskLens: 'Focus on burn acceleration, slower revenue, and financing-window risk.',
    order: ['decision', 'risks', 'next'],
  },
  'vc-returns-irr': {
    decisionTitle: 'Return Framing',
    riskTitle: 'Venture Return Risks',
    nextTitle: 'Return Workplan',
    decisionToMake: 'Decide whether ownership and exit assumptions clear the required venture hurdle.',
    riskLens: 'Focus on dilution, exit compression, and ownership assumptions that are too generous.',
    order: ['decision', 'risks', 'next'],
  },
  'inventory-cogs': {
    decisionTitle: 'Operations Framing',
    riskTitle: 'Inventory Risks',
    nextTitle: 'Inventory Workplan',
    decisionToMake: 'Decide whether inventory policy supports margins and cash conversion without creating balance-sheet risk.',
    riskLens: 'Focus on turnover miss, markdown risk, and inventory that traps cash.',
    order: ['decision', 'risks', 'next'],
  },
  'revenue-recognition-asc606': {
    decisionTitle: 'Accounting Policy Framing',
    riskTitle: 'Recognition Risks',
    nextTitle: 'Recognition Workplan',
    decisionToMake: 'Decide whether revenue timing assumptions are defensible and comparable across periods.',
    riskLens: 'Focus on timing distortions, comparability risk, and confusing accounting effects with economic change.',
    order: ['decision', 'risks', 'next'],
  },
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
  pushLine(lines, fmtNumber(key.moic) ? `Base MOIC: ${fmtNumber(key.moic)}x.` : null);

  return [
    {
      title: 'Underwriting Snapshot',
      body: buildBulletBody(lines, 'LBO return outputs were generated from the current case assumptions.'),
    },
    {
      title: 'Memo Read-Through',
      body: buildBulletBody(
        [
          'The first question is whether the deal clears target returns without relying on multiple expansion.',
          'Return sensitivity is primarily driven by entry price, leverage, debt paydown, and exit discipline.',
          'Execution risk rises quickly if cash conversion underperforms the EBITDA case.',
        ],
        'Return sensitivity is concentrated in the underwriting assumptions.'
      ),
    },
  ];
}

function buildCompsSections(context: ReportContext): GeneratedReportSection[] {
  const key = context.keyOutputs || {};
  const base = fmtNumber(key.baseValuePerShare);
  const currentPrice = fmtNumber(firstFinite(key.currentPrice, context.data?.extractedInputs?.subject?.price, context.data?.currentPrice));

  return [
    {
      title: 'Relative Valuation Snapshot',
      body: base
        ? buildBulletBody(
            [
              `Implied blended value per share: ${base}.`,
              currentPrice ? `Current price anchor: ${currentPrice}.` : null,
              'The output should be used to frame whether the subject deserves a premium, discount, or in-line multiple versus peers.',
            ],
            'Comparable valuation outputs were generated from the current peer set.'
          )
        : 'Comparable valuation outputs were generated from the current peer set.',
    },
    {
      title: 'Memo Read-Through',
      body: buildBulletBody(
        [
          'Use the memo to explain why the current premium or discount is earned, not just where the range lands.',
          'Multiple compression, peer outliers, and changing market regimes can move the range quickly.',
          'If the peer set is weak, say that the output is directional rather than decision-grade.',
        ],
        'Relative valuation needs to be read against current peer-set stability.'
      ),
    },
  ];
}

function buildFootballFieldSections(context: ReportContext): GeneratedReportSection[] {
  const extractedInputs = (context.data?.extractedInputs ?? {}) as Record<string, any>;
  const ranges = Array.isArray(extractedInputs.ranges) ? extractedInputs.ranges : [];
  const subjectRevenue = fmtNumber(firstFinite(extractedInputs.revenue));
  const subjectEbitda = fmtNumber(firstFinite(extractedInputs.ebitda));

  const methodLines = ranges
    .map((range) => {
      const label = normalizeString(range?.label) || 'Method';
      const midValue = fmtNumber(firstFinite(range?.midValue));
      const midPrice = fmtNumber(firstFinite(range?.midPrice));
      if (!midValue && !midPrice) return null;
      return `${label}: ${midValue ? `mid EV ${midValue}` : 'mid EV unavailable'}${midPrice ? `; mid price ${midPrice}` : ''}.`;
    })
    .filter((item): item is string => Boolean(item));

  return [
    {
      title: 'Range Snapshot',
      body: buildBulletBody(
        [
          subjectRevenue ? `Subject revenue anchor: ${subjectRevenue}.` : null,
          subjectEbitda ? `Subject EBITDA anchor: ${subjectEbitda}.` : null,
          ...methodLines.slice(0, 4),
        ],
        'Football field ranges were generated from the current trading and transaction-style methods.'
      ),
    },
    {
      title: 'Memo Read-Through',
      body: buildBulletBody(
        [
          'The football field is a banker range-framing tool, not a single-point valuation answer.',
          'Wide dispersion across methods usually means the peer framing, transaction uplift, or subject denominators need to be challenged before using the output externally.',
          'The cleanest read comes when trading and transaction-style methods cluster around a similar mid-point.',
        ],
        'Read the football field as a market-value framing tool rather than a standalone valuation conclusion.'
      ),
    },
  ];
}

function buildScenarioContextSection(context: ReportContext): GeneratedReportSection | null {
  if (!context.scenarioContext) return null;
  return {
    title: 'Scenario Context',
    body: `This report is framed under the scenario that ${context.scenarioContext.toLowerCase()}`,
  };
}

function buildPrecedentsSections(context: ReportContext): GeneratedReportSection[] {
  const extractedInputs = (context.data?.extractedInputs ?? {}) as Record<string, any>;
  const transactionCount = fmtNumber(firstFinite(extractedInputs.transactionCount, context.keyOutputs?.transactionCount), 0);
  const subjectRevenue = fmtNumber(firstFinite(extractedInputs.subjectRevenue));
  const subjectEbitda = fmtNumber(firstFinite(extractedInputs.subjectEbitda));
  return [
    {
      title: 'Precedent Valuation Snapshot',
      body: buildBulletBody(
        [
          transactionCount ? `Selected transaction count: ${transactionCount}.` : null,
          subjectRevenue ? `Subject revenue anchor: ${subjectRevenue}.` : null,
          subjectEbitda ? `Subject EBITDA anchor: ${subjectEbitda}.` : null,
          'The precedent set should be read as a control-value framing tool rather than a direct trading mark.',
          'Outputs are most useful when the selected transactions are strategically and temporally comparable to the target.',
        ],
        'Precedent valuation outputs were generated from the current transaction set.'
      ),
    },
    {
      title: 'Memo Read-Through',
      body: buildBulletBody(
        [
          'Control premiums and deal-specific synergies can distort direct comparability.',
          'Use the range to support valuation framing, then pressure-test which transactions truly belong in the set.',
          'If the set is thin or stale, the memo should say it is directional only.',
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

function buildDecisionFramingSection(context: ReportContext): GeneratedReportSection {
  const company = context.companyName || context.ticker || 'Company';
  const label = formatModelLabel(context.modelType);
  const summary = buildSummaryFallback(context);
  const config = MODEL_NARRATIVE_CONFIG[context.modelType];

  return {
    title: config.decisionTitle,
    body: buildBulletBody(
      [
        summary,
        config.decisionToMake,
        config.riskLens,
        `${label} should be used as a decision framework for ${company}, not as a substitute for judgment on source data quality and assumption realism.`,
      ],
      `${label} should be used as a decision framework, not a single-point answer.`
    ),
  };
}

function buildRiskConstraintSection(context: ReportContext): GeneratedReportSection {
  const explicitRisks = context.risks?.trim();
  const config = MODEL_NARRATIVE_CONFIG[context.modelType];
  const genericByModel: Record<ReportModelType, string[]> = {
    dcf: [
      'Valuation can move materially with small changes in WACC, terminal growth, or steady-state margin assumptions.',
      'If terminal value dominates the result, the output is less reliable as a near-term decision anchor.',
    ],
    'reverse-dcf': [
      'Implied expectations can look precise while still being highly sensitive to the valuation anchor and discount rate.',
      'This framework is weak if the starting market price or share count is stale.',
    ],
    lbo: [
      'Returns are usually more sensitive to entry price, exit multiple, and deleveraging than to modest operating upside.',
      'If cash conversion is weaker than underwritten, headline IRR can compress quickly.',
    ],
    comps: [
      'The range is only as defensible as the peer set; weak comparability makes the output fragile.',
      'Fast multiple re-rating in the market can stale the conclusion quickly.',
    ],
    'football-field': [
      'A football field can look authoritative even when the underlying methods disagree materially.',
      'Weak subject anchors or thin peer and transaction ranges can make the spread look more precise than it really is.',
    ],
    precedents: [
      'A precedent range can mislead if the deal set mixes different cycles, strategic contexts, or premium regimes.',
      'Control values should not be treated as direct trading marks.',
    ],
    merger: [
      'Synergy timing, financing terms, and integration costs can change the accretion conclusion quickly.',
      'A mechanically accretive deal can still be strategically weak.',
    ],
    'ma-accretion-dilution': [
      'Synergy timing, financing terms, and integration costs can change the accretion conclusion quickly.',
      'A mechanically accretive deal can still be strategically weak.',
    ],
    operating: [
      'The output can overstate control if topline conversion or expense discipline are weaker than planned.',
      'Working-capital drift can pressure cash even if operating profit looks acceptable.',
    ],
    'three-statement': [
      'Balance-sheet outcomes can swing on working-capital and financing assumptions that are easy to under-specify.',
      'Modeled earnings quality matters less than modeled cash conversion and funding durability.',
    ],
    scorecard: [
      'Rules-based scores are useful screens, but they can compress nuance and miss business-model context.',
      'A strong score is not a substitute for valuation discipline.',
    ],
    'debt-capacity-lite': [
      'Debt capacity is highly sensitive to EBITDA quality, interest burden, and the chosen covenant thresholds.',
      'If required fields are stale or incomplete, the output should not drive a financing decision.',
    ],
    'cap-table': [
      'Small changes in valuation, raise size, or option pool sizing can materially alter dilution outcomes.',
      'Stakeholder control implications can be misread if the share classes are incomplete.',
    ],
    'saas-operating-model': [
      'Growth quality can look better than reality if churn or CAC assumptions are too optimistic.',
      'ARR frameworks can hide cash intensity if hiring and working-capital effects are understated.',
    ],
    'dividend-discount-model': [
      'This framework becomes unreliable if dividend policy is unstable or payout capacity is poorly anchored.',
      'Long-duration value can shift materially on small changes in cost of equity.',
    ],
    'residual-income-model': [
      'Residual income is only as good as the starting equity base and return-on-equity durability assumptions.',
      'Accounting distortions can weaken comparability across periods.',
    ],
    'debt-amortization-refi': [
      'Refinancing conclusions are highly sensitive to maturity timing, rates, and free cash generation assumptions.',
      'Liquidity pressure can emerge faster than the base schedule implies.',
    ],
    'buyback-eps-accretion': [
      'EPS accretion can overstate value creation if repurchase price or financing cost is too generous.',
      'Share-count math should not be confused with economic return quality.',
    ],
    'purchase-price-allocation': [
      'Goodwill and amortization outputs depend heavily on valuation judgments around intangible assets.',
      'Deferred tax assumptions can materially alter the post-deal accounting picture.',
    ],
    'working-capital-schedule': [
      'Small assumption changes in DSO, DIO, or DPO can create outsized cash effects.',
      'Operating seasonality can distort steady-state working-capital assumptions.',
    ],
    'ppe-depreciation-schedule': [
      'Capex intensity and useful-life assumptions can materially alter cash conversion and accounting earnings.',
      'Depreciation policy consistency matters for comparability.',
    ],
    'runway-burn': [
      'Runway is often overstated when revenue timing and hiring discipline are too optimistic.',
      'Funding risk can become the real constraint well before modeled cash reaches zero.',
    ],
    'vc-returns-irr': [
      'Venture return math is extremely sensitive to exit valuation and dilution assumptions.',
      'A high modeled IRR can still be fragile if the ownership path is unrealistic.',
    ],
    'inventory-cogs': [
      'Turns and absorption assumptions can overstate margin durability if demand weakens.',
      'Inventory build can become a cash trap even when revenue appears to support it.',
    ],
    'revenue-recognition-asc606': [
      'Accounting timing can change the pattern of reported performance without changing economics.',
      'Comparability risk is high if contract assumptions are simplified.',
    ],
  };

  return {
    title: config.riskTitle,
    body: buildBulletBody(
      [config.riskLens, explicitRisks, ...(genericByModel[context.modelType] ?? [])],
      'Model conclusions remain sensitive to input quality and assumption realism.'
    ),
  };
}

function buildNextStepsSection(context: ReportContext): GeneratedReportSection {
  const config = MODEL_NARRATIVE_CONFIG[context.modelType];
  const nextByModel: Record<ReportModelType, string[]> = {
    dcf: [
      'Re-run the valuation with a tighter WACC and terminal-growth sensitivity table.',
      'Validate the operating forecast against current consensus, management guidance, and recent quarter trends.',
      'Separate near-term execution risk from terminal assumptions before using the base case in a meeting.',
    ],
    'reverse-dcf': [
      'Pressure-test the valuation anchor and share count used in the reverse DCF.',
      'Compare implied growth against consensus and recent realized growth.',
      'Run a margin sensitivity to see whether the market is underwriting growth, margin, or both.',
    ],
    lbo: [
      'Stress leverage, exit multiple, and cash conversion in downside cases.',
      'Validate whether the entry multiple embeds enough room for operational miss.',
      'Check whether debt service still works under lower EBITDA.',
    ],
    comps: [
      'Tighten the peer set and remove weak comparables.',
      'Check where the subject screens on growth, margin, and balance-sheet quality versus the selected peers.',
      'Reframe the range under current market multiples if the sector has re-rated recently.',
    ],
    'football-field': [
      'Check whether the trading and transaction-style methods are using defensible subject denominators.',
      'Remove weak methods or outlier ranges that are widening the field without adding decision value.',
      'Use the next pass to explain why the high and low ends of the range differ before putting the output in front of management or investors.',
    ],
    precedents: [
      'Cull transactions that are temporally or strategically weak comparables.',
      'Separate control premium effects from operating comparability.',
      'Use the precedent range alongside trading comps instead of on a standalone basis.',
    ],
    merger: [
      'Validate synergy timing and one-time cost assumptions with a downside integration case.',
      'Rebuild financing mix sensitivity before relying on the accretion conclusion.',
      'Test whether the strategic rationale still holds if synergies slip.',
    ],
    'ma-accretion-dilution': [
      'Validate synergy timing and one-time cost assumptions with a downside integration case.',
      'Rebuild financing mix sensitivity before relying on the accretion conclusion.',
      'Test whether the strategic rationale still holds if synergies slip.',
    ],
    operating: [
      'Reconcile topline assumptions with current pipeline or demand visibility.',
      'Stress expense timing and hiring cadence against a slower revenue case.',
      'Focus the next review on cash conversion, not just operating margin.',
    ],
    'three-statement': [
      'Stress working-capital and capex assumptions before relying on ending cash.',
      'Check whether debt and financing assumptions are internally consistent with the cash flow statement.',
      'Use the next pass to identify which line items actually change the end-state balance sheet.',
    ],
    scorecard: [
      'Validate the weakest metrics directly from statements and current filings.',
      'Compare the score with a peer set instead of treating it as standalone judgment.',
      'Use the scorecard to prioritize deeper work, not to close the debate.',
    ],
    'debt-capacity-lite': [
      'Fill missing debt, cash, EBITDA, and interest inputs before using the result in a financing discussion.',
      'Stress EBITDA down and rates up to identify the real binding constraint.',
      'Separate leverage capacity from practical market capacity before framing a debt raise.',
    ],
    'cap-table': [
      'Re-run the round with alternative valuation and raise-size cases.',
      'Check whether the option pool and share-class assumptions match current legal documents.',
      'Use the next pass to isolate who bears the most dilution under each financing case.',
    ],
    'saas-operating-model': [
      'Pressure-test churn, CAC, and gross margin together rather than one at a time.',
      'Check whether hiring and cash burn remain supportable in a slower-growth case.',
      'Use the next review to isolate the assumptions that actually drive ARR durability.',
    ],
    'dividend-discount-model': [
      'Check whether the payout path is defensible under a weaker earnings case.',
      'Stress cost of equity and terminal dividend growth explicitly.',
      'Use a second valuation method to triangulate the conclusion.',
    ],
    'residual-income-model': [
      'Validate the opening equity base and return-on-equity assumptions.',
      'Pressure-test cost of equity and fade assumptions.',
      'Cross-check with DCF or comps before using the result in a meeting.',
    ],
    'debt-amortization-refi': [
      'Stress refinancing rates and maturity timing.',
      'Check whether cash generation is sufficient to support the amortization path.',
      'Flag any years where refinancing becomes a practical liquidity event.',
    ],
    'buyback-eps-accretion': [
      'Re-run the analysis at a higher repurchase price and higher funding cost.',
      'Separate EPS optics from value creation in the discussion.',
      'Check whether the company has better capital-allocation alternatives than repurchases.',
    ],
    'purchase-price-allocation': [
      'Validate the identifiable intangible split with a transaction-specific view.',
      'Re-check deferred tax assumptions and amortization consequences.',
      'Use the next pass to isolate what portion of value is truly going into goodwill.',
    ],
    'working-capital-schedule': [
      'Stress DSO, DIO, and DPO independently and together.',
      'Check seasonality before using the base working-capital path in a meeting.',
      'Translate the working-capital outcome into explicit cash impact for the broader model.',
    ],
    'ppe-depreciation-schedule': [
      'Stress capex cadence and useful-life assumptions.',
      'Check whether depreciation policy is distorting comparability or cash conversion.',
      'Use the next pass to tie reinvestment needs back to growth assumptions.',
    ],
    'runway-burn': [
      'Re-run the case with slower revenue and higher burn.',
      'Identify the first practical financing decision point before modeled cash reaches zero.',
      'Translate runway into management actions, not just months of cash.',
    ],
    'vc-returns-irr': [
      'Pressure-test exit valuation and dilution assumptions.',
      'Map the ownership path across follow-on rounds explicitly.',
      'Check whether the modeled return clears the fund’s required threshold after realistic dilution.',
    ],
    'inventory-cogs': [
      'Stress turnover and margin together in a softer-demand case.',
      'Check whether inventory policy is creating cash drag or markdown risk.',
      'Tie the next pass back to working-capital and cash-conversion implications.',
    ],
    'revenue-recognition-asc606': [
      'Validate contract timing assumptions against actual commercial terms.',
      'Separate accounting timing from cash economics in the discussion.',
      'Use the next pass to identify where comparability with peers breaks down.',
    ],
  };

  return {
    title: config.nextTitle,
    body: nextByModel[context.modelType]
      .map((item, idx) => `${idx + 1}. ${item}`)
      .join('\n'),
  };
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

function buildMergerSections(context: ReportContext): GeneratedReportSection[] {
  const key = context.keyOutputs || {};
  const dealValue = fmtNumber(firstFinite(key.dealValue, context.data?.extractedInputs?.purchasePrice));
  const accretion = fmtPct(firstFinite(key.epsAccretionPct, key.epsAccretion, context.data?.extractedInputs?.epsAccretionPct));
  const synergies = fmtNumber(firstFinite(key.synergies, context.data?.extractedInputs?.synergies));
  return [
    {
      title: 'Transaction Snapshot',
      body: buildBulletBody(
        [
          dealValue ? `Deal value: ${dealValue}.` : null,
          accretion ? `EPS accretion / dilution: ${accretion}.` : null,
          synergies ? `Synergy assumption: ${synergies}.` : null,
          'The key question is whether expected synergies outweigh purchase price, financing drag, and integration costs.',
        ],
        'The merger model summarizes deal structure and pro forma impact.'
      ),
    },
    {
      title: 'Memo Read-Through',
      body: buildBulletBody(
        [
          'Small accretion is not enough by itself; the deal has to work after realistic financing and execution friction.',
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
  const primarySections = (() => {
    switch (context.modelType) {
    case 'dcf':
      return buildDcfSections(context);
    case 'reverse-dcf':
      return buildReverseDcfSections(context);
    case 'lbo':
      return buildLboSections(context);
    case 'comps':
      return buildCompsSections(context);
    case 'football-field':
      return buildFootballFieldSections(context);
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
  })();
  const narrativeSections: Record<NarrativeSectionId, GeneratedReportSection> = {
    decision: buildDecisionFramingSection(context),
    risks: buildRiskConstraintSection(context),
    next: buildNextStepsSection(context),
  };

  const scenarioSection = buildScenarioContextSection(context);

  return [
    ...(scenarioSection ? [scenarioSection] : []),
    ...primarySections,
    ...MODEL_NARRATIVE_CONFIG[context.modelType].order.map((sectionId) => narrativeSections[sectionId]),
  ];
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
    case 'football-field':
      return `${company} has been evaluated through a football field that lines up multiple market-value methods into one range view. The output is most useful for seeing whether trading and transaction-style methods cluster around a defendable value frame. It should be treated as valuation framing, not as a substitute for the underlying comps, precedents, or DCF work.`;
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
  const fallbackSummary = buildSummaryFallback(context);
  try {
    const response = await generateTextWithProviderFallback({
      clientType: 'service',
      preferredProvider: 'anthropic',
      maxTokens: 900,
      temperature: 0.2,
      messages: [
        { role: 'system', content: getReportWriterSystemPrompt(context) },
        { role: 'user', content: buildReportWriterUserPrompt(context) },
      ],
    });
    const content = response?.text?.trim();
    if (!content) return null;
    const jsonText = extractJsonObject(content);
    if (!jsonText) return null;
    const parsed = JSON.parse(jsonText) as AiReportResponse;
    return coerceAiReportPayload(parsed, fallbackTitle, fallbackSubtitle, fallbackSummary);
  } catch {
    return null;
  }
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
