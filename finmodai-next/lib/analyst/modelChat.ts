import { classifyPrompt, type ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';
import { extractInputs, type ExtractedModelInputs } from '@/lib/model-generator/extractInputs';
import type { ComparisonSummary, PromptRunRecord, ProvenanceSummary } from '@/lib/model-generator/runHistory';
import { getLatestComparableRun } from '@/lib/model-generator/runHistory';
import * as compsTemplate from '@/lib/model-generator/templates/comps';
import * as precedentsTemplate from '@/lib/model-generator/templates/precedents';
import * as lboTemplate from '@/lib/model-generator/templates/lbo';
import * as threeStatementTemplate from '@/lib/model-generator/templates/threeStatement';
import * as capTableTemplate from '@/lib/model-generator/templates/capTable';
import * as saasOperatingTemplate from '@/lib/model-generator/templates/saasOperating';

type ModelNarrativeBlock = {
  title: string;
  body: string;
};

export type AnalystGeneratedModelPayload = {
  prompt: string;
  modelType: Exclude<ModelGeneratorType, 'DCF'>;
  title: string;
  tabs: string[];
  keyOutputs: string[];
  extractedInputs: ExtractedModelInputs;
  defaultsUsed: Record<string, unknown>;
  provenanceSummary: ProvenanceSummary;
  comparisonSummary: ComparisonSummary | null;
  recentRun: {
    runId: string;
    versionNumber: number | null;
    createdAt: string;
    status: string;
  } | null;
  narrativeBlocks: ModelNarrativeBlock[];
};

type PreviewBuilder = {
  getPreview: (inputs: ExtractedModelInputs) => { title: string; tabs: string[] };
};

const TEMPLATE_MAP: Record<Exclude<ModelGeneratorType, 'DCF'>, PreviewBuilder> = {
  COMPS: compsTemplate as PreviewBuilder,
  PRECEDENTS: precedentsTemplate as PreviewBuilder,
  LBO: lboTemplate as PreviewBuilder,
  THREE_STATEMENT: threeStatementTemplate as PreviewBuilder,
  CAP_TABLE: capTableTemplate as PreviewBuilder,
  SAAS_OPERATING_MODEL: saasOperatingTemplate as PreviewBuilder,
};

const KEY_OUTPUTS: Record<Exclude<ModelGeneratorType, 'DCF'>, string[]> = {
  COMPS: ['Peer Trading Multiples', 'Implied Valuation Range', 'Premium / Discount View', 'Peer Set Summary'],
  PRECEDENTS: ['Transaction Multiples', 'Control Premium', 'Implied Valuation Range', 'Pitch Summary'],
  LBO: ['MOIC', 'IRR', 'Exit Equity Value', 'Debt Paydown'],
  THREE_STATEMENT: ['Revenue CAGR', 'EBITDA Margin', 'Ending Cash', 'Debt Balance'],
  CAP_TABLE: ['Post-Money Valuation', 'Founder Dilution', 'New Investor Ownership', 'Option Pool Impact'],
  SAAS_OPERATING_MODEL: ['ARR Growth', 'Gross Margin', 'CAC Payback', 'LTV:CAC'],
};

function labelForModelType(modelType: Exclude<ModelGeneratorType, 'DCF'>): string {
  switch (modelType) {
    case 'COMPS':
      return 'comparable company analysis';
    case 'PRECEDENTS':
      return 'precedent transactions';
    case 'LBO':
      return 'LBO';
    case 'THREE_STATEMENT':
      return 'three-statement';
    case 'CAP_TABLE':
      return 'cap table';
    case 'SAAS_OPERATING_MODEL':
      return 'SaaS operating';
  }
}

function summarizeDefaults(defaultsUsed: Record<string, unknown>): string {
  const keys = Object.keys(defaultsUsed);
  if (keys.length === 0) return 'No default assumptions were required.';
  const preview = keys.slice(0, 4).join(', ');
  return keys.length > 4
    ? `Default assumptions were applied for ${preview}, and ${keys.length - 4} additional fields.`
    : `Default assumptions were applied for ${preview}.`;
}

function fmtCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  if (Math.abs(value) >= 1000) return `$${value.toLocaleString('en-US')}M`;
  return `$${value.toFixed(1)}M`;
}

function fmtPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `${(value * 100).toFixed(1)}%`;
}

function extractComparableAssumptions(inputs: Record<string, unknown>): Record<string, unknown> {
  const skip = new Set(['modelType', 'source', 'companyName', 'ticker', 'companyType', 'peerSetLabel', 'subject', 'peers', 'transactions']);
  return Object.fromEntries(Object.entries(inputs).filter(([key]) => !skip.has(key)));
}

function computeChangedKeys(previous: Record<string, unknown>, current: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  return Array.from(keys).filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(current[key]));
}

function buildRecentRunSummary(recentRun: PromptRunRecord | null) {
  if (!recentRun) return null;
  return {
    runId: recentRun.id,
    versionNumber: recentRun.latestVersion?.versionNumber ?? null,
    createdAt: recentRun.createdAt,
    status: recentRun.status,
  };
}

function buildNarrativeBlocks(modelType: Exclude<ModelGeneratorType, 'DCF'>, inputs: ExtractedModelInputs): ModelNarrativeBlock[] {
  switch (modelType) {
    case 'COMPS': {
      const compsInputs = inputs as ExtractedModelInputs & {
        companyName: string;
        peers: Array<{ ticker: string; revenue: number | null; ebitda: number | null }>;
        subject: { revenue: number | null; ebitda: number | null; price: number | null };
      };
      return [
        {
          title: 'COMPANY OVERVIEW',
          body: `${compsInputs.companyName} is being framed through a peer-relative valuation lens. The subject profile is seeded with revenue of ${fmtCurrency(compsInputs.subject.revenue)} and EBITDA of ${fmtCurrency(compsInputs.subject.ebitda)} across ${compsInputs.peers.length} selected peers.`,
        },
        {
          title: 'VALUATION VIEW',
          body: `This output is designed for equity research and banking comps work: use the peer table to pressure-test trading multiples, then frame premium or discount versus the current price and operating profile.`,
        },
        {
          title: 'WATCH NEXT',
          body: 'Refine the peer set, pressure-test outliers, and rerun the workbook after adjusting multiples or replacing low-quality peers.',
        },
      ];
    }
    case 'PRECEDENTS': {
      const precedentsInputs = inputs as ExtractedModelInputs & {
        companyName: string;
        subjectRevenue: number | null;
        subjectEbitda: number | null;
        transactions: Array<{ target: string; acquirer: string; premium: number; revenueMultiple: number; ebitdaMultiple: number }>;
      };
      const medianPremium =
        precedentsInputs.transactions.length > 0
          ? precedentsInputs.transactions.reduce((sum, transaction) => sum + transaction.premium, 0) / precedentsInputs.transactions.length
          : null;
      return [
        {
          title: 'COMPANY SNAPSHOT',
          body: `${precedentsInputs.companyName} is being benchmarked against precedent transactions using subject revenue of ${fmtCurrency(precedentsInputs.subjectRevenue)} and EBITDA of ${fmtCurrency(precedentsInputs.subjectEbitda)}.`,
        },
        {
          title: 'TRANSACTION CONTEXT',
          body: `The selected set emphasizes control valuations and bid premiums. Average announced premium across the demo set is ${fmtPercent(medianPremium)}, which gives banking-style context for buyer appetite and valuation support.`,
        },
        {
          title: 'COMPARABLE / PRECEDENT FRAMING',
          body: 'Use this workbook as the transaction-side counterpart to trading comps: it is useful for pitch framing, valuation range support, and acquisition-context discussion, not as a substitute for a full live precedents database.',
        },
      ];
    }
    case 'LBO': {
      const lboInputs = inputs as ExtractedModelInputs & {
        companyName: string;
        revenue: number;
        ebitda: number;
        entryMultiple: number;
        exitMultiple: number;
        debtPercent: number;
        ebitdaMargin: number;
        holdingPeriodYears: number;
        revenueGrowth: number[];
        capexPctRevenue: number;
        deltaNwcPctRevenue: number;
      };
      const avgGrowth = lboInputs.revenueGrowth.reduce((sum, value) => sum + value, 0) / lboInputs.revenueGrowth.length;
      const leverageMultiple = lboInputs.entryMultiple * lboInputs.debtPercent;
      const cashConversion = lboInputs.ebitdaMargin - lboInputs.capexPctRevenue - lboInputs.deltaNwcPctRevenue;
      const scoreComponents = [
        Math.min(20, Math.max(0, avgGrowth * 100 * 0.6)),
        Math.min(20, Math.max(0, lboInputs.ebitdaMargin * 40)),
        Math.min(20, Math.max(0, (8 - leverageMultiple) * 4)),
        Math.min(20, Math.max(0, cashConversion * 80)),
        Math.min(20, Math.max(0, (lboInputs.exitMultiple - (lboInputs.entryMultiple - 2)) * 5)),
      ];
      const score = Math.round(scoreComponents.reduce((sum, value) => sum + value, 0));
      return [
        {
          title: 'ASSET OVERVIEW',
          body: `${lboInputs.companyName} is seeded with revenue of ${fmtCurrency(lboInputs.revenue)} and EBITDA of ${fmtCurrency(lboInputs.ebitda)}. The base case assumes entry at ${lboInputs.entryMultiple.toFixed(1)}x EBITDA, exit at ${lboInputs.exitMultiple.toFixed(1)}x, and a ${lboInputs.holdingPeriodYears}-year hold.`,
        },
        {
          title: 'DEAL SCORE',
          body: `Estimate: ${score} / 100. The score blends revenue growth (${fmtPercent(avgGrowth)} average), margin quality (${fmtPercent(lboInputs.ebitdaMargin)} EBITDA margin), leverage load (${leverageMultiple.toFixed(1)}x debt / EBITDA equivalent), and cash conversion (${fmtPercent(cashConversion)} before interest).`,
        },
        {
          title: 'ENTRY / EXIT FRAMING',
          body: 'Use this LBO as a first-pass sponsor screen. The next diligence step is to stress-test leverage, capex, and exit multiple sensitivity rather than relying on the base case alone.',
        },
      ];
    }
    case 'THREE_STATEMENT':
      return [
        {
          title: 'MODEL FRAME',
          body: 'This three-statement model links the income statement, balance sheet, and cash flow statement into a reusable operating case that can be rerun as assumptions change.',
        },
      ];
    case 'CAP_TABLE':
      return [
        {
          title: 'ROUND SUMMARY',
          body: 'This cap table frames a financing round with dilution, post-money ownership, and option pool effects laid out for board or investor review.',
        },
      ];
    case 'SAAS_OPERATING_MODEL':
      return [
        {
          title: 'OPERATING MODEL',
          body: 'This SaaS model organizes ARR growth, churn, gross margin, and unit economics into a repeatable operating forecast with editable assumptions.',
        },
      ];
  }
}

export async function generateAnalystStructuredModel(prompt: string, sessionId?: string | null): Promise<{
  reply: string;
  payload: AnalystGeneratedModelPayload;
} | null> {
  const modelType = classifyPrompt(prompt);
  if (!modelType || modelType === 'DCF') return null;

  const extraction = await extractInputs(prompt, modelType);
  const preview = TEMPLATE_MAP[modelType].getPreview(extraction.extractedInputs);
  const modelLabel = labelForModelType(modelType);
  const defaultsSummary = summarizeDefaults(extraction.defaultsUsed);
  const recentRun = await getLatestComparableRun({
    surface: 'analyst_chat',
    sessionId: sessionId ?? null,
    modelType,
    companyName: 'companyName' in extraction.extractedInputs ? extraction.extractedInputs.companyName : null,
    ticker: 'ticker' in extraction.extractedInputs ? extraction.extractedInputs.ticker ?? null : null,
  });
  const currentAssumptions = extractComparableAssumptions(extraction.extractedInputs as Record<string, unknown>);
  const comparisonSummary =
    recentRun?.latestVersion
      ? {
          previousVersionNumber: recentRun.latestVersion.versionNumber,
          currentVersionNumber: recentRun.latestVersion.versionNumber + 1,
          changedKeys: computeChangedKeys(recentRun.latestVersion.assumptions, currentAssumptions),
        }
      : null;
  const narrativeBlocks = buildNarrativeBlocks(modelType, extraction.extractedInputs);

  return {
    reply: [
      `Built a demo-ready ${modelLabel} model from your prompt. The workbook includes ${preview.tabs.join(', ')} so the output is immediately downloadable and reviewable in Excel.`,
      `${defaultsSummary} Key outputs in the workbook are ${KEY_OUTPUTS[modelType].join(', ')}. Use the attached card to download the model file.`,
      narrativeBlocks.map((block) => `${block.title}\n${block.body}`).join('\n\n'),
    ].join('\n\n'),
    payload: {
      prompt,
      modelType,
      title: preview.title,
      tabs: preview.tabs,
      keyOutputs: KEY_OUTPUTS[modelType],
      extractedInputs: extraction.extractedInputs,
      defaultsUsed: extraction.defaultsUsed,
      provenanceSummary: extraction.provenanceSummary,
      comparisonSummary,
      recentRun: buildRecentRunSummary(recentRun),
      narrativeBlocks,
    },
  };
}
