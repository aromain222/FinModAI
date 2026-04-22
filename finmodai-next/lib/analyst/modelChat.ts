import { classifyPrompt, type ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';
import type { AttachmentStatementSnapshot } from '@/lib/analyst/pdfFinancialStatements';
import type { AttachmentModelExtractionContext } from '@/lib/analyst/claudeModelExtraction';
import type {
  AnalystFieldDisplayMap,
  AttachmentScaleValidation,
} from '@/lib/analyst/attachmentScaleValidation';
import { analystModelChatDeps } from '@/lib/analyst/modelChatDeps';
import {
  buildAnalystGeneratedModelExportSeed,
  buildAnalystGeneratedModelRecentRun,
  isAnalystGeneratedModelExportSeed,
  rebuildAnalystGeneratedModelPayloadFromSeed,
} from '@/lib/analyst/export/exportSeed';
import {
  buildReasoningReply,
  derivePersistentModelReasoningResponse,
  translateFinancialReasoningToOverrides,
} from '@/lib/analyst/revision/persistentModelReasoning';
import type {
  AnalystGeneratedModelExportSeed,
  AnalystGeneratedModelPayload,
  AnalystGeneratedModelRecentRun,
  AnalystStructuredModelAdjustment,
  AnalystStructuredModelResult,
  ModelNarrativeBlock,
} from '@/lib/analyst/types';
import type { EventLinkedModelEventSource } from '@/lib/model-events/types';
import {
  extractInputs,
  type CompsPeerInputs,
  type ExtractedModelInputs,
  type PrecedentTransactionInputs,
} from '@/lib/model-generator/extractInputs';
import type { ComparisonSummary, PromptRunRecord, ProvenanceSummary } from '@/lib/model-generator/runHistory';
import * as dcfTemplate from '@/lib/model-generator/templates/dcf';
import * as compsTemplate from '@/lib/model-generator/templates/comps';
import { calculateDebtCapacityPreview } from '@/lib/model-generator/debtCapacitySummary';
import * as debtCapacityLiteTemplate from '@/lib/model-generator/templates/debtCapacityLite';
import * as footballFieldTemplate from '@/lib/model-generator/templates/footballField';
import { calculateMergerSummary } from '@/lib/model-generator/mergerSummary';
import * as mergerTemplate from '@/lib/model-generator/templates/merger';
import * as precedentsTemplate from '@/lib/model-generator/templates/precedents';
import * as lboTemplate from '@/lib/model-generator/templates/lbo';
import * as threeStatementTemplate from '@/lib/model-generator/templates/threeStatement';
import * as capTableTemplate from '@/lib/model-generator/templates/capTable';
import * as saasOperatingTemplate from '@/lib/model-generator/templates/saasOperating';
import { DEMO_COMPANY_META } from '@/lib/demo/demoUniverse';
import { loadDemoSnapshots, type DemoCompanySnapshot } from '@/lib/demo/demoSnapshotStore';

export { analystModelChatDeps } from '@/lib/analyst/modelChatDeps';
export {
  buildAnalystGeneratedModelExportSeed,
  buildAnalystGeneratedModelRecentRun,
  isAnalystGeneratedModelExportSeed,
  rebuildAnalystGeneratedModelPayloadFromSeed,
};
export type {
  AnalystGeneratedModelExportSeed,
  AnalystGeneratedModelRecentRun,
};
export type {
  AnalystGeneratedModelPayload,
  AnalystStructuredModelAdjustment,
  AnalystStructuredModelResult,
  ModelNarrativeBlock,
} from '@/lib/analyst/types';

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;
  return text.slice(firstBrace, lastBrace + 1);
}

type AnalystModelRevisionResult = {
  reply: string;
  payload: AnalystGeneratedModelPayload;
  modelChanged: boolean;
};

type StructuredModelType = ModelGeneratorType;

type PreviewBuilder = {
  getPreview: (inputs: ExtractedModelInputs) => { title: string; tabs: string[] };
};

const TEMPLATE_MAP: Record<StructuredModelType, PreviewBuilder> = {
  DCF: dcfTemplate as PreviewBuilder,
  COMPS: compsTemplate as PreviewBuilder,
  DEBT_CAPACITY_LITE: debtCapacityLiteTemplate as PreviewBuilder,
  FOOTBALL_FIELD: footballFieldTemplate as PreviewBuilder,
  MERGER: mergerTemplate as PreviewBuilder,
  PRECEDENTS: precedentsTemplate as PreviewBuilder,
  LBO: lboTemplate as PreviewBuilder,
  THREE_STATEMENT: threeStatementTemplate as PreviewBuilder,
  CAP_TABLE: capTableTemplate as PreviewBuilder,
  SAAS_OPERATING_MODEL: saasOperatingTemplate as PreviewBuilder,
};

const KEY_OUTPUTS: Record<StructuredModelType, string[]> = {
  DCF: ['Enterprise Value', 'Equity Value', 'Implied Share Price', 'Sensitivity Table'],
  COMPS: ['Peer Trading Multiples', 'Implied Valuation Range', 'Premium / Discount View', 'Peer Set Summary'],
  DEBT_CAPACITY_LITE: ['Leverage-Based Cap', 'Coverage-Based Cap', 'Selected Max Debt', 'Headroom vs Current Net Debt'],
  FOOTBALL_FIELD: ['Trading Range', 'Precedent Range', 'Equity Value Bridge', 'Implied Share Price Range'],
  MERGER: ['Deal Consideration Mix', 'Pro Forma EPS', 'EPS Accretion / Dilution', 'Sensitivity Framing'],
  PRECEDENTS: ['Transaction Multiples', 'Control Premium', 'Implied Valuation Range', 'Pitch Summary'],
  LBO: ['MOIC', 'IRR', 'Exit Equity Value', 'Debt Paydown'],
  THREE_STATEMENT: ['Revenue CAGR', 'EBITDA Margin', 'Ending Cash', 'Debt Balance'],
  CAP_TABLE: ['Post-Money Valuation', 'Founder Dilution', 'New Investor Ownership', 'Option Pool Impact'],
  SAAS_OPERATING_MODEL: ['ARR Growth', 'Gross Margin', 'CAC Payback', 'LTV:CAC'],
};

function labelForModelType(modelType: StructuredModelType): string {
  switch (modelType) {
    case 'DCF':
      return 'discounted cash flow';
    case 'COMPS':
      return 'trading comparables';
    case 'DEBT_CAPACITY_LITE':
      return 'debt capacity';
    case 'FOOTBALL_FIELD':
      return 'valuation football field';
    case 'MERGER':
      return 'merger / accretion-dilution';
    case 'PRECEDENTS':
      return 'precedent transactions';
    case 'LBO':
      return 'LBO underwriting';
    case 'THREE_STATEMENT':
      return 'forecast model';
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

function fmtAbsoluteCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmtModelCurrencyFromMillions(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return fmtAbsoluteCurrency(value * 1_000_000);
}

function fmtModelSharesFromMillions(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  const actualShares = value * 1_000_000;
  if (Math.abs(actualShares) >= 1_000_000_000) return `${(actualShares / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(actualShares) >= 1_000_000) return `${(actualShares / 1_000_000).toFixed(1)}M`;
  return actualShares.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `${(value * 100).toFixed(1)}%`;
}

function describeCompsSubjectMetrics(subject: {
  revenue: number | null;
  ebitda: number | null;
}): string {
  const revenue = fmtCurrency(subject.revenue);
  const ebitda = fmtCurrency(subject.ebitda);
  if (revenue !== 'n/a' && ebitda !== 'n/a') {
    return `The subject profile is seeded with revenue of ${revenue} and EBITDA of ${ebitda}`;
  }
  if (revenue !== 'n/a') {
    return `The subject profile is seeded with revenue of ${revenue}`;
  }
  if (ebitda !== 'n/a') {
    return `The subject profile is seeded with EBITDA of ${ebitda}`;
  }
  return 'Subject revenue and EBITDA are still missing, so the initial view is driven more by peer multiples than by a complete operating snapshot';
}

function normalizeScenarioContext(value: string): string {
  const cleaned = value
    .replace(/\s+/g, ' ')
    .replace(/^[,.:;\-\s]+/, '')
    .replace(/[.]+$/, '')
    .trim();
  if (!cleaned) return '';
  return cleaned.endsWith('.') ? cleaned : `${cleaned}.`;
}

function extractScenarioContext(prompt: string): string | null {
  const patterns = [
    /\bassuming\s+(.+)$/i,
    /\bunder\s+(.+?)\s+scenario$/i,
    /\bunder\s+(.+)$/i,
    /\bknowing\s+(.+)$/i,
    /\bif\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const candidate = normalizeScenarioContext(match?.[1] ?? '');
    if (candidate) return candidate;
  }

  return null;
}

function buildCompsFoundationParagraph(inputs: {
  companyName: string;
  subject: CompsPeerInputs;
  peers: CompsPeerInputs[];
  scenarioContext: string | null;
}): string {
  const leadPeer = inputs.peers[0] ?? null;
  const scenarioLead = inputs.scenarioContext ? `Under the scenario that ${inputs.scenarioContext.toLowerCase()} ` : '';
  if (!leadPeer) {
    return `${scenarioLead}${inputs.companyName} is being framed through a peer-relative lens first. The immediate question is whether the current subject profile justifies a premium, discount, or neutral valuation stance versus the chosen peer set.`;
  }

  const subjectRevenue = typeof inputs.subject.revenue === 'number' ? inputs.subject.revenue : null;
  const peerRevenue = typeof leadPeer.revenue === 'number' ? leadPeer.revenue : null;
  const subjectEbitda = typeof inputs.subject.ebitda === 'number' ? inputs.subject.ebitda : null;
  const peerEbitda = typeof leadPeer.ebitda === 'number' ? leadPeer.ebitda : null;

  const scaleLeader =
    subjectRevenue !== null && peerRevenue !== null
      ? subjectRevenue >= peerRevenue
        ? inputs.companyName
        : leadPeer.name
      : null;
  const profitabilityLeader =
    subjectEbitda !== null && peerEbitda !== null
      ? subjectEbitda >= peerEbitda
        ? inputs.companyName
        : leadPeer.name
      : null;

  if (scaleLeader && profitabilityLeader && scaleLeader === profitabilityLeader) {
    return `${scenarioLead}${scaleLeader} starts from the stronger operating base in this comparison, so the first question is whether the current market price already captures that scale and earnings advantage or still leaves room for relative upside.`;
  }

  if (scaleLeader && profitabilityLeader && scaleLeader !== profitabilityLeader) {
    return `${scenarioLead}${scaleLeader} screens larger on revenue while ${profitabilityLeader} screens stronger on EBITDA, so this comparison is really about whether investors should pay for scale, profitability, or the possibility of convergence between the two.`;
  }

  return `${scenarioLead}${inputs.companyName} should be judged here through relative scale, profitability, and trading multiples rather than a standalone narrative. The main job of the comps view is to show whether the current price is asking investors to underwrite too much or too little versus ${leadPeer.name}.`;
}

function extractComparableAssumptions(inputs: Record<string, unknown>): Record<string, unknown> {
  const skip = new Set(['modelType', 'source', 'companyName', 'ticker', 'companyType', 'peerSetLabel', 'subject', 'peers', 'transactions', 'ranges']);
  return Object.fromEntries(Object.entries(inputs).filter(([key]) => !skip.has(key)));
}

function computeChangedKeys(previous: Record<string, unknown>, current: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  return Array.from(keys).filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(current[key]));
}

function removeOverriddenDefaults(
  defaultsUsed: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...defaultsUsed };
  for (const key of Object.keys(overrides)) {
    delete next[key];
  }
  return next;
}

function promptExplicitlySetsCompanyType(prompt: string): boolean {
  return /\b(company type|sector|business type|classified as)\b/i.test(prompt);
}

function stripUngroundedAttachmentMetadata(
  inputs: ExtractedModelInputs,
  keepCompanyType: boolean,
): ExtractedModelInputs {
  if (keepCompanyType || !('companyType' in inputs)) return inputs;
  const next = { ...(inputs as Record<string, unknown>) };
  delete next.companyType;
  return next as ExtractedModelInputs;
}

function buildRecentRunSummary(recentRun: PromptRunRecord | null) {
  if (!recentRun) return null;
  return buildAnalystGeneratedModelRecentRun({
    runId: recentRun.id,
    versionNumber: recentRun.latestVersion?.versionNumber ?? null,
    createdAt: recentRun.createdAt,
    status: recentRun.status,
  });
}

function buildNarrativeBlocks(
  modelType: StructuredModelType,
  inputs: ExtractedModelInputs,
  scenarioContext: string | null,
): ModelNarrativeBlock[] {
  const scenarioBlock = scenarioContext
    ? [{
        title: 'SCENARIO CONTEXT',
        body: `This run is framed under the scenario that ${scenarioContext.toLowerCase()}`,
      }]
    : [];

  switch (modelType) {
    case 'DCF': {
      const dcfInputs = inputs as ExtractedModelInputs & {
        companyName: string;
        baseRevenue: number;
        cash: number;
        debt: number;
        sharesOutstanding: number;
        wacc: number;
        terminalGrowth: number;
      };
      return [
        ...scenarioBlock,
        {
          title: 'VALUATION FRAME',
          body: `${dcfInputs.companyName} is being framed through a canonical DCF with base revenue of ${fmtModelCurrencyFromMillions(dcfInputs.baseRevenue)}, cash of ${fmtModelCurrencyFromMillions(dcfInputs.cash)}, debt of ${fmtModelCurrencyFromMillions(dcfInputs.debt)}, and ${fmtModelSharesFromMillions(dcfInputs.sharesOutstanding)} diluted shares.`,
        },
        {
          title: 'KEY ASSUMPTIONS',
          body: `The current case discounts cash flow at a WACC of ${fmtPercent(dcfInputs.wacc)} with terminal growth of ${fmtPercent(dcfInputs.terminalGrowth)}. Use the workbook to pressure-test operating drivers, discount rate sensitivity, and per-share value.`,
        },
      ];
    }
    case 'COMPS': {
      const compsInputs = inputs as ExtractedModelInputs & {
        companyName: string;
        peers: CompsPeerInputs[];
        subject: CompsPeerInputs;
      };
      return [
        ...scenarioBlock,
        {
          title: 'FOUNDATIONAL VIEW',
          body: buildCompsFoundationParagraph({
            companyName: compsInputs.companyName,
            subject: compsInputs.subject,
            peers: compsInputs.peers,
            scenarioContext,
          }),
        },
        {
          title: 'COMPANY OVERVIEW',
          body: `${compsInputs.companyName} is being framed through a peer-relative valuation lens. ${describeCompsSubjectMetrics(compsInputs.subject)} across ${compsInputs.peers.length} selected peers.`,
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
    case 'DEBT_CAPACITY_LITE': {
      const debtInputs = inputs as ExtractedModelInputs & {
        companyName: string;
        ebitda: number | null;
        currentNetDebt: number | null;
        maxLeverage: number;
        minInterestCoverage: number;
        interestRate: number;
      };
      const summary = calculateDebtCapacityPreview(debtInputs as any);
      return [
        ...scenarioBlock,
        {
          title: 'CREDIT FRAME',
          body: `${debtInputs.companyName} is being screened through a debt-capacity lens to see whether leverage or coverage sets the tighter ceiling on incremental debt.`,
        },
        {
          title: 'UNDERWRITING ASSUMPTIONS',
          body: `The current case uses EBITDA of ${fmtCurrency(debtInputs.ebitda)}, max leverage of ${debtInputs.maxLeverage.toFixed(1)}x, minimum interest coverage of ${debtInputs.minInterestCoverage.toFixed(1)}x, and an interest rate of ${fmtPercent(debtInputs.interestRate)}.`,
        },
        {
          title: 'CAPACITY READ',
          body: summary
            ? `The model selects max debt of ${fmtCurrency(summary.maxDebt)}, with ${summary.bindingConstraint} currently binding. Headroom versus current net debt is ${fmtCurrency(summary.headroomVsNetDebt)}.`
            : 'The current company snapshot does not yet provide enough EBITDA to support a usable debt-capacity conclusion.',
        },
      ];
    }
    case 'FOOTBALL_FIELD': {
      const footballInputs = inputs as ExtractedModelInputs & {
        companyName: string;
        ranges: Array<{ label: string; midValue: number | null; midPrice: number | null }>;
      };
      const populatedCount = footballInputs.ranges.filter((range) => typeof range.midValue === 'number').length;
      return [
        ...scenarioBlock,
        {
          title: 'VALUATION FRAME',
          body: `${footballInputs.companyName} is being framed through a banker-style football field with ${populatedCount} populated valuation methods. The output is designed to compare where trading and transaction ranges overlap, not to collapse everything into one blended answer.`,
        },
        {
          title: 'METHOD READ',
          body: 'Use the field to show spread and overlap between methods, then challenge the weakest underlying method first. Large gaps usually mean peer selection, control-value framing, or subject denominators need to be revisited.',
        },
      ];
    }
    case 'MERGER': {
      const mergerInputs = inputs as ExtractedModelInputs & {
        acquirerName: string;
        targetName: string;
        purchasePrice: number | null;
        cashPct: number;
        stockPct: number;
        debtPct: number;
        synergies: number;
        newDebtRate: number;
      };
      const summary = calculateMergerSummary(mergerInputs as any);
      return [
        ...scenarioBlock,
        {
          title: 'FOUNDATIONAL VIEW',
          body: `${mergerInputs.acquirerName} acquiring ${mergerInputs.targetName} is being framed as an EPS accretion / dilution problem first. The immediate question is whether the purchase price and financing mix preserve pro forma earnings power or simply manufacture optical accretion.`,
        },
        {
          title: 'DEAL STRUCTURE',
          body: `The current case assumes a purchase price of ${fmtAbsoluteCurrency(mergerInputs.purchasePrice)}, funded ${fmtPercent(mergerInputs.cashPct)} cash, ${fmtPercent(mergerInputs.stockPct)} stock, and ${fmtPercent(mergerInputs.debtPct)} debt, with incremental debt priced at ${fmtPercent(mergerInputs.newDebtRate)}.`,
        },
        {
          title: 'ACCRETION READ',
          body: `On the current inputs, pro forma EPS screens at ${summary.proFormaEps.toFixed(2)} versus standalone EPS of ${summary.standaloneEps.toFixed(2)}, implying ${fmtPercent(summary.epsAccretionPct)} accretion / dilution before any deeper integration work. Modeled synergies are ${fmtAbsoluteCurrency(mergerInputs.synergies)}.`,
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
        ...scenarioBlock,
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
        ...scenarioBlock,
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
        ...scenarioBlock,
        {
          title: 'FORECAST FRAME',
          body: 'This three-statement forecast model links the income statement, balance sheet, and cash flow statement into a reusable operating case. The card is built to show yearly revenue, EBITDA, EBIT, net income, capex, working capital, debt, and ending cash in one rerunnable artifact.',
        },
      ];
    case 'CAP_TABLE':
      return [
        ...scenarioBlock,
        {
          title: 'ROUND SUMMARY',
          body: 'This cap table frames a financing round with dilution, post-money ownership, and option pool effects laid out for board or investor review.',
        },
      ];
    case 'SAAS_OPERATING_MODEL':
      return [
        ...scenarioBlock,
        {
          title: 'OPERATING MODEL',
          body: 'This SaaS model organizes ARR growth, churn, gross margin, and unit economics into a repeatable operating forecast with editable assumptions.',
        },
      ];
  }
}

function normalizeEntityLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function toPeerInputs(ticker: string, snapshot: DemoCompanySnapshot): CompsPeerInputs {
  const marketCap = snapshot.marketCap ?? (snapshot.sharePrice && snapshot.sharesOutstanding ? snapshot.sharePrice * snapshot.sharesOutstanding : null);
  return {
    ticker,
    name: snapshot.companyName || ticker,
    marketCap,
    price: snapshot.sharePrice ?? null,
    sharesOutstanding: snapshot.sharesOutstanding ?? null,
    totalDebt: snapshot.totalDebt ?? null,
    cash: snapshot.cash ?? null,
    revenue: snapshot.revenueLtm ?? null,
    ebitda: snapshot.ebitdaLtm ?? null,
    netIncome: snapshot.netIncomeLtm ?? null,
  };
}

function buildPrecedentTransaction(ticker: string, snapshot: DemoCompanySnapshot, index: number): PrecedentTransactionInputs {
  const enterpriseValue = (snapshot.marketCap ?? 0) + (snapshot.totalDebt ?? 0) - (snapshot.cash ?? 0);
  return {
    transaction: `${snapshot.companyName || ticker} strategic sale`,
    target: snapshot.companyName || ticker,
    acquirer: ['Strategic buyer', 'Sponsor buyer', 'Infrastructure buyer', 'Global platform', 'Financial sponsor'][index % 5],
    announcementYear: new Date().getFullYear() - (index % 3),
    enterpriseValue: enterpriseValue > 0 ? enterpriseValue : (snapshot.marketCap ?? 0),
    revenueMultiple: 4.5 + index * 0.4,
    ebitdaMultiple: 13 + index * 0.6,
    premium: 0.18 + index * 0.02,
  };
}

function extractEntityList(raw: string): string[] {
  return raw
    .split(/\band\b|,|;/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveDemoTickersFromList(raw: string, snapshots: Record<string, DemoCompanySnapshot>): string[] {
  const candidates = extractEntityList(raw);
  const resolved = new Set<string>();

  for (const candidate of candidates) {
    const upper = candidate.toUpperCase();
    if (snapshots[upper]) {
      resolved.add(upper);
      continue;
    }

    const normalizedCandidate = normalizeEntityLabel(candidate);
    for (const [ticker, snapshot] of Object.entries(snapshots)) {
      const normalizedName = normalizeEntityLabel(snapshot.companyName || '');
      if (normalizedName && (normalizedName.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedName))) {
        resolved.add(ticker);
        break;
      }
    }
  }

  return Array.from(resolved);
}

const MODEL_COMPANY_RESOLUTION_NOISE = new Set([
  'a',
  'an',
  'the',
  'build',
  'create',
  'generate',
  'make',
  'for',
  'using',
  'with',
  'forecast',
  'model',
  'three',
  'statement',
  'three-statement',
  'dcf',
  'lbo',
  'comps',
  'precedents',
  'precedent',
  'transactions',
  'football',
  'field',
  'merger',
  'debt',
  'capacity',
  'cap',
  'table',
  'saas',
  'operating',
  'output',
  'structured',
  'include',
  'yearly',
  'not',
  'narrative',
  'prose',
]);

function cleanCompanyResolutionCandidate(value: string): string {
  return normalizeEntityLabel(value)
    .split(' ')
    .map((token) => {
      if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
      if (token.endsWith('s') && token.length > 4 && !token.endsWith('ss')) return token.slice(0, -1);
      return token;
    })
    .filter((token) => token.length >= 2 && !MODEL_COMPANY_RESOLUTION_NOISE.has(token))
    .join(' ')
    .trim();
}

function resolveSingleDemoCompanyFromPrompt(
  prompt: string,
  snapshots: Record<string, DemoCompanySnapshot>,
): { ticker: string; snapshot: DemoCompanySnapshot } | null {
  const explicitTickers = Array.from(
    new Set((prompt.match(/\b[A-Z]{1,5}(?:\.[A-Z])?\b/g) ?? []).filter((ticker) => snapshots[ticker])),
  );
  if (explicitTickers.length === 1) {
    const ticker = explicitTickers[0];
    return { ticker, snapshot: snapshots[ticker] };
  }

  const candidatePhrases = [
    prompt.match(/\bfor\b\s+(.+?)(?:\b(?:forecast|three[\s-]?statement|dcf|lbo|comps|precedent|football|merger|cap\s+table|saas|debt\s+capacity|model)\b|$)/i)?.[1] ?? null,
    prompt.match(/\b(?:about|on)\b\s+(.+?)(?:\b(?:forecast|three[\s-]?statement|dcf|lbo|comps|precedent|football|merger|cap\s+table|saas|debt\s+capacity|model)\b|$)/i)?.[1] ?? null,
    cleanCompanyResolutionCandidate(prompt),
  ].filter((value): value is string => Boolean(value && value.trim().length > 0));

  for (const candidate of candidatePhrases) {
    const resolved = resolveDemoTickersFromList(candidate, snapshots);
    if (resolved.length === 1) {
      const ticker = resolved[0];
      return { ticker, snapshot: snapshots[ticker] };
    }
  }

  const cleanedPrompt = cleanCompanyResolutionCandidate(prompt);
  if (!cleanedPrompt) return null;
  const cleanedTokens = cleanedPrompt.split(' ').filter((token) => token.length >= 2);
  if (cleanedTokens.length === 0) return null;

  let best: { ticker: string; snapshot: DemoCompanySnapshot; score: number } | null = null;
  for (const [ticker, snapshot] of Object.entries(snapshots)) {
    const cleanedName = cleanCompanyResolutionCandidate(snapshot.companyName || ticker);
    if (!cleanedName) continue;
    const matches = cleanedTokens.filter((token) => cleanedName.includes(token));
    if (matches.length === 0) continue;
    const score = matches.length * 100 + cleanedName.length;
    if (!best || score > best.score) {
      best = { ticker, snapshot, score };
    }
  }

  return best ? { ticker: best.ticker, snapshot: best.snapshot } : null;
}

function applyResolvedDemoCompanyToInputs(
  modelType: StructuredModelType,
  extractedInputs: ExtractedModelInputs,
  resolved: { ticker: string; snapshot: DemoCompanySnapshot },
): ExtractedModelInputs {
  const next = { ...extractedInputs } as Record<string, unknown>;

  next.companyName = resolved.snapshot.companyName || resolved.ticker;
  next.ticker = resolved.ticker;
  if (resolved.snapshot.sector) {
    next.companyType = resolved.snapshot.sector;
  }
  next.source = 'demo_company_snapshots';

  if (modelType === 'THREE_STATEMENT') {
    if (resolved.snapshot.revenueLtm != null) next.baseRevenue = resolved.snapshot.revenueLtm;
    if (resolved.snapshot.cash != null) next.cash = resolved.snapshot.cash;
    if (resolved.snapshot.totalDebt != null) next.debt = resolved.snapshot.totalDebt;
  }

  if (modelType === 'DCF') {
    if (resolved.snapshot.revenueLtm != null) next.baseRevenue = resolved.snapshot.revenueLtm;
    if (resolved.snapshot.cash != null) next.cash = resolved.snapshot.cash;
    if (resolved.snapshot.totalDebt != null) next.debt = resolved.snapshot.totalDebt;
    if (resolved.snapshot.sharesOutstanding != null) next.sharesOutstanding = resolved.snapshot.sharesOutstanding;
    if (resolved.snapshot.sharePrice != null) next.sharePrice = resolved.snapshot.sharePrice;
    if (resolved.snapshot.marketCap != null) next.marketCap = resolved.snapshot.marketCap;
  }

  return next as ExtractedModelInputs;
}

function applyResolvedDemoCompanyProvenance(
  provenanceSummary: ProvenanceSummary,
  resolved: { ticker: string; snapshot: DemoCompanySnapshot },
): ProvenanceSummary {
  return {
    ...provenanceSummary,
    sourceType: 'demo_fallback',
    sources: Array.from(new Set([...provenanceSummary.sources, 'demo_company_snapshots'])),
    asOfDate: provenanceSummary.asOfDate ?? resolved.snapshot.updatedAt ?? null,
    lastSynced: provenanceSummary.lastSynced ?? resolved.snapshot.updatedAt ?? null,
    fallbackUsed: Array.from(new Set([...provenanceSummary.fallbackUsed, 'analyst_company_resolution'])),
  };
}

function withUniverseBackfill(
  snapshots: Record<string, DemoCompanySnapshot>,
): Record<string, DemoCompanySnapshot> {
  const next = { ...snapshots };
  for (const [ticker, meta] of Object.entries(DEMO_COMPANY_META)) {
    if (next[ticker]) continue;
    next[ticker] = {
      ticker,
      companyName: meta.name,
      sector: meta.sector,
      updatedAt: null,
    };
  }
  return next;
}

function extractNestedScalarOverride(prompt: string, aliases: string[], type: 'percent' | 'money' | 'number'): number | undefined {
  for (const alias of aliases) {
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const patterns = [
      new RegExp(`(?:set|make|change|adjust|update|increase|decrease|raise|lower|reduce|cut|bump|trim)\\s+(?:the\\s+)?${escapedAlias}\\s+(?:to\\s+)?([^,.;\\n]+)`, 'i'),
      new RegExp(`${escapedAlias}\\s+(?:to\\s+)?([^,.;\\n]+)`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      const value = normalizeOverrideValue(match?.[1] ?? '', type);
      if (typeof value === 'number') return value;
    }
  }
  return undefined;
}

async function applyNestedModelOverrides(
  prompt: string,
  payload: AnalystGeneratedModelPayload,
): Promise<Record<string, unknown>> {
  const snapshots = await loadDemoSnapshots();

  if (payload.modelType === 'COMPS') {
    const inputs = payload.extractedInputs as ExtractedModelInputs & {
      subject: CompsPeerInputs;
      peers: CompsPeerInputs[];
      peerSetLabel: string;
      companyType?: string;
      ticker?: string;
    };
    const subjectOverrides: Partial<CompsPeerInputs> = {};
    const subjectRevenue = extractNestedScalarOverride(prompt, ['subject revenue'], 'money');
    const subjectEbitda = extractNestedScalarOverride(prompt, ['subject ebitda', 'subject EBITDA'], 'money');
    const subjectPrice = extractNestedScalarOverride(prompt, ['subject price', 'subject share price'], 'money');
    const subjectMarketCap = extractNestedScalarOverride(prompt, ['subject market cap', 'subject market value'], 'money');
    const subjectShares = extractNestedScalarOverride(prompt, ['subject shares', 'subject shares outstanding'], 'number');

    if (subjectRevenue !== undefined) subjectOverrides.revenue = subjectRevenue;
    if (subjectEbitda !== undefined) subjectOverrides.ebitda = subjectEbitda;
    if (subjectPrice !== undefined) subjectOverrides.price = subjectPrice;
    if (subjectMarketCap !== undefined) subjectOverrides.marketCap = subjectMarketCap;
    if (subjectShares !== undefined) subjectOverrides.sharesOutstanding = subjectShares;

    let peers = inputs.peers;
    const replacePeersMatch = prompt.match(/(?:set|replace|change|update)\s+(?:the\s+)?peers?\s+(?:to|with)\s+([^.\n]+)/i);
    if (replacePeersMatch?.[1]) {
      const tickers = resolveDemoTickersFromList(replacePeersMatch[1], snapshots).filter((ticker) => ticker !== inputs.ticker);
      const nextPeers = tickers.map((ticker) => toPeerInputs(ticker, snapshots[ticker])).filter((peer) => peer.name);
      if (nextPeers.length > 0) peers = nextPeers;
    }

    const addPeersMatch = prompt.match(/add\s+([^.\n]+?)\s+to\s+(?:the\s+)?peers?/i);
    if (addPeersMatch?.[1]) {
      const additions = resolveDemoTickersFromList(addPeersMatch[1], snapshots)
        .filter((ticker) => ticker !== inputs.ticker && !peers.some((peer) => peer.ticker === ticker))
        .map((ticker) => toPeerInputs(ticker, snapshots[ticker]));
      if (additions.length > 0) peers = [...peers, ...additions];
    }

    const removePeersMatch = prompt.match(/remove\s+([^.\n]+?)\s+from\s+(?:the\s+)?peers?/i);
    if (removePeersMatch?.[1]) {
      const removals = new Set(resolveDemoTickersFromList(removePeersMatch[1], snapshots));
      peers = peers.filter((peer) => !removals.has(peer.ticker));
    }

    const result: Record<string, unknown> = {};
    if (Object.keys(subjectOverrides).length > 0) {
      result.subject = { ...inputs.subject, ...subjectOverrides };
    }
    if (peers !== inputs.peers) {
      result.peers = peers;
      result.peerSetLabel = `${peers.length} selected peers`;
    }
    return result;
  }

  if (payload.modelType === 'PRECEDENTS') {
    const inputs = payload.extractedInputs as ExtractedModelInputs & {
      transactions: PrecedentTransactionInputs[];
      transactionCount: number;
      companyType?: string;
      ticker?: string;
    };
    const result: Record<string, unknown> = {};
    const subjectRevenue = extractNestedScalarOverride(prompt, ['subject revenue'], 'money');
    const subjectEbitda = extractNestedScalarOverride(prompt, ['subject ebitda', 'subject EBITDA'], 'money');
    if (subjectRevenue !== undefined) {
      result.subjectRevenue = subjectRevenue;
    }
    if (subjectEbitda !== undefined) {
      result.subjectEbitda = subjectEbitda;
    }

    let transactions = inputs.transactions;

    const replaceTransactionsMatch = prompt.match(/(?:set|replace|change|update)\s+(?:the\s+)?transactions?\s+(?:to|with)\s+([^.\n]+)/i);
    if (replaceTransactionsMatch?.[1]) {
      const tickers = resolveDemoTickersFromList(replaceTransactionsMatch[1], snapshots).filter((ticker) => ticker !== inputs.ticker);
      const nextTransactions = tickers.map((ticker, index) => buildPrecedentTransaction(ticker, snapshots[ticker], index));
      if (nextTransactions.length > 0) transactions = nextTransactions;
    }

    const addTransactionsMatch = prompt.match(/add\s+([^.\n]+?)\s+to\s+(?:the\s+)?transactions?/i);
    if (addTransactionsMatch?.[1]) {
      const existingTargets = new Set(transactions.map((item) => normalizeEntityLabel(item.target)));
      const additions = resolveDemoTickersFromList(addTransactionsMatch[1], snapshots)
        .filter((ticker) => ticker !== inputs.ticker)
        .filter((ticker) => !existingTargets.has(normalizeEntityLabel(snapshots[ticker].companyName || ticker)))
        .map((ticker, index) => buildPrecedentTransaction(ticker, snapshots[ticker], transactions.length + index));
      if (additions.length > 0) transactions = [...transactions, ...additions];
    }

    const removeTransactionsMatch = prompt.match(/remove\s+([^.\n]+?)\s+from\s+(?:the\s+)?transactions?/i);
    if (removeTransactionsMatch?.[1]) {
      const removals = new Set(resolveDemoTickersFromList(removeTransactionsMatch[1], snapshots).map((ticker) => normalizeEntityLabel(snapshots[ticker].companyName || ticker)));
      transactions = transactions.filter((item) => !removals.has(normalizeEntityLabel(item.target)));
    }

    const transactionCountMatch = prompt.match(/(?:set|change|update|make)\s+(?:the\s+)?transaction count\s+(?:to\s+)?(\d+)/i);
    if (transactionCountMatch?.[1]) {
      const requestedCount = Math.max(1, Number(transactionCountMatch[1]));
      if (transactions.length >= requestedCount) {
        transactions = transactions.slice(0, requestedCount);
      } else {
        const universe = Object.entries(snapshots)
          .filter(([ticker, snapshot]) => ticker !== inputs.ticker && (!inputs.companyType || snapshot.sector === inputs.companyType))
          .sort(([, left], [, right]) => (right.marketCap ?? 0) - (left.marketCap ?? 0))
          .map(([ticker]) => ticker)
          .filter((ticker) => !transactions.some((item) => normalizeEntityLabel(item.target) === normalizeEntityLabel(snapshots[ticker].companyName || ticker)))
          .slice(0, requestedCount - transactions.length);
        transactions = [
          ...transactions,
          ...universe.map((ticker, index) => buildPrecedentTransaction(ticker, snapshots[ticker], transactions.length + index)),
        ];
      }
    }

    if (transactions !== inputs.transactions) {
      result.transactions = transactions;
      result.transactionCount = transactions.length;
    }

    return result;
  }

  return {};
}

function toPercentString(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${(value * 100).toFixed(1)}%`;
}

function toMoneyString(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
  });
}

function toNumberString(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return String(value);
}

function normalizeOverrideValue(raw: string, typeHint: 'percent' | 'money' | 'number' | 'text'): unknown {
  const cleaned = raw.trim().replace(/[.,]+$/, '');
  if (!cleaned) return undefined;

  if (typeHint === 'text') return cleaned;

  const normalizedPercentWords = cleaned.replace(/\bpercent(age)?\b/gi, '%');
  const compact = normalizedPercentWords.replace(/,/g, '').replace(/\$/g, '').trim();
  const match = compact.match(/^(-?\d*\.?\d+)([kmb])?\s*(%)?$/i);
  if (!match) return undefined;

  let numeric = Number(match[1]);
  if (!Number.isFinite(numeric)) return undefined;

  const suffix = match[2]?.toLowerCase();
  if (suffix === 'k') numeric *= 1e3;
  if (suffix === 'm') numeric *= 1e6;
  if (suffix === 'b') numeric *= 1e9;

  const hasPercent = Boolean(match[3]) || typeHint === 'percent';
  if (hasPercent) numeric = numeric > 1 ? numeric / 100 : numeric;

  return numeric;
}

function normalizeRelativeDeltaValue(raw: string, typeHint: 'percent' | 'money' | 'number'): number | undefined {
  const basisPointMatch = raw.trim().match(/^(-?\d*\.?\d+)\s*(?:bp|bps|basis points?)$/i);
  if (basisPointMatch) {
    const parsed = Number(basisPointMatch[1]);
    return Number.isFinite(parsed) ? parsed / 10000 : undefined;
  }

  const normalized = normalizeOverrideValue(raw, typeHint);
  return typeof normalized === 'number' ? normalized : undefined;
}

const OVERRIDE_CONFIG: Record<string, { aliases: string[]; type: 'percent' | 'money' | 'number' | 'text' }> = {
  companyName: { aliases: ['company name', 'name'], type: 'text' },
  ticker: { aliases: ['ticker'], type: 'text' },
  churn: { aliases: ['churn', 'churn rate'], type: 'percent' },
  growthRate: { aliases: ['growth rate', 'arr growth', 'annual growth'], type: 'percent' },
  grossMargin: { aliases: ['gross margin'], type: 'percent' },
  startingArr: { aliases: ['starting arr', 'arr'], type: 'money' },
  cac: { aliases: ['cac'], type: 'money' },
  arpu: { aliases: ['arpu'], type: 'money' },
  years: { aliases: ['years', 'forecast years'], type: 'number' },
  taxRate: { aliases: ['tax rate'], type: 'percent' },
  capexPctRevenue: { aliases: ['capex', 'capex percent', 'capex pct revenue'], type: 'percent' },
  daPctRevenue: { aliases: ['d&a', 'depreciation', 'amortization'], type: 'percent' },
  opexPctRevenue: { aliases: ['opex', 'operating expense'], type: 'percent' },
  entryMultiple: { aliases: ['entry multiple'], type: 'number' },
  exitMultiple: { aliases: ['exit multiple'], type: 'number' },
  debtPercent: { aliases: ['debt percent', 'debt percentage', 'debt'], type: 'percent' },
  equityPercent: { aliases: ['equity percent', 'equity percentage', 'equity'], type: 'percent' },
  interestRate: { aliases: ['interest rate'], type: 'percent' },
  amortizationPercent: { aliases: ['amortization percent', 'amortization'], type: 'percent' },
  cashSweepPercent: { aliases: ['cash sweep', 'cash sweep percent'], type: 'percent' },
  holdingPeriodYears: { aliases: ['holding period', 'hold period'], type: 'number' },
  preMoney: { aliases: ['pre money', 'pre-money'], type: 'money' },
  raiseAmount: { aliases: ['raise amount', 'raise'], type: 'money' },
  founderShares: { aliases: ['founder shares'], type: 'number' },
  optionPoolRefresh: { aliases: ['option pool', 'option pool refresh'], type: 'percent' },
  revenueMultiple: { aliases: ['revenue multiple'], type: 'number' },
  ebitdaMultiple: { aliases: ['ebitda multiple'], type: 'number' },
};

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/Pct/g, ' Percent ')
    .replace(/\bda\b/gi, 'D&A')
    .replace(/\bnwc\b/gi, 'NWC')
    .replace(/\bebitda\b/gi, 'EBITDA')
    .replace(/\bebit\b/gi, 'EBIT')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function looksPercentKey(key: string): boolean {
  return /(margin|growth|rate|tax|churn|percent|pct|wacc)/i.test(key);
}

function looksMoneyKey(key: string): boolean {
  return /(revenue|arr|cash|debt|price|capex|cac|arpu|pre money|raise|value|shares|income)/i.test(key);
}

function inferOverrideType(key: string, currentValue: unknown): 'percent' | 'money' | 'number' | 'text' | 'percent_array' | 'number_array' | 'text_array' | null {
  if (Array.isArray(currentValue)) {
    if (currentValue.every((item) => typeof item === 'number')) {
      return looksPercentKey(key) ? 'percent_array' : 'number_array';
    }
    if (currentValue.every((item) => typeof item === 'string')) {
      return 'text_array';
    }
    return null;
  }

  if (typeof currentValue === 'string') return 'text';
  if (typeof currentValue === 'number') {
    if (looksPercentKey(key) || (currentValue > 0 && currentValue <= 1)) return 'percent';
    if (looksMoneyKey(key)) return 'money';
    return 'number';
  }

  return null;
}

function extraAliasesForKey(key: string): string[] {
  const map: Record<string, string[]> = {
    companyName: ['company name', 'name'],
    companyType: ['company type', 'sector', 'business type'],
    companyScale: ['company scale', 'scale', 'stage'],
    roundType: ['round type', 'financing round'],
    baseRevenue: ['base revenue', 'starting revenue', 'revenue base', 'ltm revenue'],
    revenue: ['revenue', 'sales'],
    ebitda: ['ebitda'],
    netDebt: ['net debt'],
    sharePrice: ['share price', 'price'],
    sharesOutstanding: ['shares outstanding', 'share count', 'shares'],
    cash: ['cash', 'opening cash'],
    debt: ['debt', 'opening debt'],
    startingArr: ['starting arr', 'arr'],
    growthRate: ['growth rate', 'arr growth', 'annual growth'],
    grossMargin: ['gross margin'],
    churn: ['churn', 'churn rate'],
    cac: ['cac'],
    arpu: ['arpu'],
    revenueGrowth: ['revenue growth', 'growth'],
    ebitMargin: ['ebit margin', 'operating margin'],
    ebitdaMargin: ['ebitda margin'],
    opexPctRevenue: ['opex', 'operating expense', 'opex percent'],
    daPctRevenue: ['d&a', 'depreciation', 'amortization'],
    capexPctRevenue: ['capex', 'capex percent'],
    nwcPctRevenue: ['nwc', 'working capital', 'working capital percent'],
    deltaNwcPctRevenue: ['delta nwc', 'change in working capital'],
    optionPoolRefresh: ['option pool', 'option pool refresh'],
    entryMultiple: ['entry multiple'],
    exitMultiple: ['exit multiple'],
    debtPercent: ['debt percent', 'debt percentage', 'debt'],
    equityPercent: ['equity percent', 'equity percentage', 'equity'],
    interestRate: ['interest rate'],
    amortizationPercent: ['amortization percent', 'amortization'],
    cashSweepPercent: ['cash sweep', 'cash sweep percent'],
    holdingPeriodYears: ['holding period', 'hold period'],
    valuationMultiples: ['valuation multiples', 'multiples'],
  };

  return map[key] ?? [];
}

function aliasesForKey(key: string): string[] {
  return Array.from(new Set([humanizeKey(key), ...extraAliasesForKey(key)]));
}

function parseArrayOverrideValue(raw: string, baseType: 'percent' | 'number' | 'text'): unknown[] | undefined {
  const parts = raw
    .split(/[\/,]/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return undefined;
  if (baseType === 'text') return parts;

  const parsed = parts
    .map((part) => normalizeOverrideValue(part, baseType))
    .filter((value) => value !== undefined);
  return parsed.length > 0 ? parsed as unknown[] : undefined;
}

function replaceArrayAtIndex(values: unknown[], index: number, nextValue: unknown): unknown[] {
  return values.map((value, currentIndex) => (currentIndex === index ? nextValue : value));
}

function applyPercentArrayDelta(values: unknown, delta: number, floor: number, ceiling: number): number[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const next = values
    .map((value) => (typeof value === 'number' ? Math.min(ceiling, Math.max(floor, Number(value) + delta)) : null))
    .filter((value): value is number => typeof value === 'number');
  return next.length > 0 ? next : undefined;
}

function applyPercentScalarDelta(value: unknown, delta: number, floor: number, ceiling: number): number | undefined {
  if (typeof value !== 'number') return undefined;
  return Math.min(ceiling, Math.max(floor, Number(value) + delta));
}

function inferStructuredModelEventShock(
  prompt: string,
  payload: AnalystGeneratedModelPayload,
): Record<string, unknown> {
  if (payload.modelType !== 'THREE_STATEMENT') return {};

  const normalized = prompt.toLowerCase();
  const inputs = payload.extractedInputs as Record<string, unknown>;
  const companyType = typeof inputs.companyType === 'string' ? inputs.companyType.toLowerCase() : '';
  const isEnergyLike = /(energy|oil|gas|materials|mining)/i.test(companyType);
  const isDurationSensitive = /(technology|software|internet|semiconductor|saas)/i.test(companyType);

  if (/(ceo|chief executive|founder).*(retire|retirement|step down|leave|departure)|management transition|leadership change/i.test(normalized)) {
    return {
      revenueGrowth: applyPercentArrayDelta(inputs.revenueGrowth, -0.015, -0.05, 0.3),
      grossMargin: applyPercentScalarDelta(inputs.grossMargin, -0.005, 0.1, 0.95),
      opexPctRevenue: applyPercentScalarDelta(inputs.opexPctRevenue, 0.005, 0.01, 0.9),
    };
  }

  if (/(higher for longer|rates stay higher|rate shock|higher rates|fed stays hawkish)/i.test(normalized)) {
    return {
      revenueGrowth: applyPercentArrayDelta(inputs.revenueGrowth, isDurationSensitive ? -0.01 : -0.005, -0.05, 0.3),
      opexPctRevenue: applyPercentScalarDelta(inputs.opexPctRevenue, 0.0025, 0.01, 0.9),
    };
  }

  if (/(oil shock|oil spike|crude spike|energy shock)/i.test(normalized)) {
    if (isEnergyLike) {
      return {
        revenueGrowth: applyPercentArrayDelta(inputs.revenueGrowth, 0.01, -0.05, 0.3),
        grossMargin: applyPercentScalarDelta(inputs.grossMargin, 0.01, 0.1, 0.95),
      };
    }

    return {
      revenueGrowth: applyPercentArrayDelta(inputs.revenueGrowth, -0.01, -0.05, 0.3),
      grossMargin: applyPercentScalarDelta(inputs.grossMargin, -0.01, 0.1, 0.95),
      opexPctRevenue: applyPercentScalarDelta(inputs.opexPctRevenue, 0.005, 0.01, 0.9),
    };
  }

  if (/(tariff|trade war|trade shock|trade policy)/i.test(normalized)) {
    return {
      revenueGrowth: applyPercentArrayDelta(inputs.revenueGrowth, -0.01, -0.05, 0.3),
      grossMargin: applyPercentScalarDelta(inputs.grossMargin, -0.015, 0.1, 0.95),
      opexPctRevenue: applyPercentScalarDelta(inputs.opexPctRevenue, 0.005, 0.01, 0.9),
    };
  }

  return {};
}

function extractOverrideForKey(key: string, currentValue: unknown, prompt: string): unknown {
  const type = inferOverrideType(key, currentValue);
  if (!type) return undefined;

  for (const alias of aliasesForKey(key)) {
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');

    if (Array.isArray(currentValue)) {
      const yearMatch = prompt.match(new RegExp(`(?:year|yr)\\s*(\\d+)\\s+${escapedAlias}\\s+(?:to\\s+)?([^,.;\\n]+)`, 'i'));
      if (yearMatch) {
        const yearIndex = Number(yearMatch[1]) - 1;
        if (Number.isInteger(yearIndex) && yearIndex >= 0 && yearIndex < currentValue.length) {
          const nextValue = normalizeOverrideValue(yearMatch[2], type === 'percent_array' ? 'percent' : type === 'number_array' ? 'number' : 'text');
          if (nextValue !== undefined) return replaceArrayAtIndex(currentValue, yearIndex, nextValue);
        }
      }

      const yearRelativeMatch = prompt.match(
        new RegExp(`(?:increase|raise|bump|lift|decrease|lower|reduce|cut|trim)\\s+(?:year|yr)\\s*(\\d+)\\s+${escapedAlias}\\s+by\\s+([^,.;\\n]+)`, 'i')
      ) ?? prompt.match(
        new RegExp(`(?:year|yr)\\s*(\\d+)\\s+${escapedAlias}\\s+(?:up|down)\\s+([^,.;\\n]+)`, 'i')
      );
      if (yearRelativeMatch) {
        const yearIndex = Number(yearRelativeMatch[1]) - 1;
        if (Number.isInteger(yearIndex) && yearIndex >= 0 && yearIndex < currentValue.length) {
          const currentItem = currentValue[yearIndex];
          if (typeof currentItem === 'number') {
            const delta = normalizeRelativeDeltaValue(
              yearRelativeMatch[2],
              type === 'percent_array' ? 'percent' : 'number'
            );
            if (delta !== undefined) {
              const signedDelta =
                /\b(?:decrease|lower|reduce|cut|trim|down)\b/i.test(yearRelativeMatch[0]) ? -delta : delta;
              return replaceArrayAtIndex(currentValue, yearIndex, currentItem + signedDelta);
            }
          }
        }
      }

      const fullArrayPatterns = [
        new RegExp(`(?:set|make|change|adjust|update|increase|decrease|raise|lower|reduce|cut|bump|trim)\\s+(?:the\\s+)?${escapedAlias}\\s+(?:to\\s+)?([^.;\\n]+)`, 'i'),
        new RegExp(`${escapedAlias}\\s+(?:to\\s+)?([^.;\\n]+)`, 'i'),
      ];

      for (const pattern of fullArrayPatterns) {
        const match = prompt.match(pattern);
        if (!match?.[1]) continue;
        const parsed = parseArrayOverrideValue(match[1], type === 'percent_array' ? 'percent' : type === 'number_array' ? 'number' : 'text');
        if (parsed && parsed.length > 1) return parsed;
        if (parsed && parsed.length === 1) return currentValue.map(() => parsed[0]);
      }

      continue;
    }

    const patterns = [
      new RegExp(`(?:set|make|change|adjust|update|revise|increase|decrease|raise|lower|reduce|cut|bump|trim)\\s+(?:the\\s+)?${escapedAlias}\\s+(?:to\\s+)?([^,.;\\n]+)`, 'i'),
      new RegExp(`${escapedAlias}\\s+(?:to\\s+)?([^,.;\\n]+)`, 'i'),
    ];
    const scalarType: 'percent' | 'money' | 'number' | 'text' =
      type === 'percent' || type === 'money' || type === 'number' || type === 'text'
        ? type
        : 'text';
    const relativePatterns = scalarType !== 'text'
      ? [
          new RegExp(`(?:increase|raise|bump|lift)\\s+(?:the\\s+)?${escapedAlias}\\s+by\\s+([^,.;\\n]+)`, 'i'),
          new RegExp(`(?:decrease|lower|reduce|cut|trim)\\s+(?:the\\s+)?${escapedAlias}\\s+by\\s+([^,.;\\n]+)`, 'i'),
          new RegExp(`${escapedAlias}\\s+(?:up|down)\\s+([^,.;\\n]+)`, 'i'),
        ]
      : [];
    if (scalarType !== 'text' && typeof currentValue === 'number') {
      for (const pattern of relativePatterns) {
        const match = prompt.match(pattern);
        if (!match?.[1]) continue;
        const delta = normalizeRelativeDeltaValue(match[1], scalarType);
        if (delta === undefined) continue;
        const signedDelta =
          /\b(?:decrease|lower|reduce|cut|trim|down)\b/i.test(match[0]) ? -delta : delta;
        return currentValue + signedDelta;
      }
    }
    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      const value = normalizeOverrideValue(match?.[1] ?? '', scalarType);
      if (value !== undefined) return value;
    }
  }

  return undefined;
}

function extractFollowUpOverrides(prompt: string, existingInputs: ExtractedModelInputs): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  for (const [key, currentValue] of Object.entries(existingInputs)) {
    if (['modelType', 'source', 'subject', 'peers', 'transactions'].includes(key)) continue;
    const nextValue = extractOverrideForKey(key, currentValue, prompt);
    if (nextValue !== undefined) {
      overrides[key] = nextValue;
    }
  }

  return overrides;
}

export function isModelAdjustmentPrompt(prompt: string): boolean {
  return /\b(?:adjust|update|change|set|make|rename|revise|increase|decrease|raise|lower|reduce|cut|bump|trim|stress|sensit(?:ivity|ize)|scenario|downside|upside|bear(?: case)?|bull(?: case)?|base case|what if|assume)\b/i.test(prompt);
}

function buildAdjustedReply(modelType: StructuredModelType, overrides: Record<string, unknown>): string {
  const labels = Object.keys(overrides).map((key) => {
    const value = overrides[key];
    if (Array.isArray(value) && value.every((item) => item && typeof item === 'object')) {
      const objectLabels = value
        .map((item) => {
          const row = item as Record<string, unknown>;
          return typeof row.ticker === 'string'
            ? row.ticker
            : typeof row.target === 'string'
              ? row.target
              : typeof row.name === 'string'
                ? row.name
                : null;
        })
        .filter((item): item is string => typeof item === 'string');
      return `${humanizeKey(key)} to ${objectLabels.join(', ')}`;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const row = value as Record<string, unknown>;
      const objectSummary = Object.entries(row)
        .filter(([, item]) => typeof item === 'string' || typeof item === 'number')
        .slice(0, 3)
        .map(([nestedKey, nestedValue]) => {
          if (typeof nestedValue !== 'number') return `${humanizeKey(nestedKey)} ${nestedValue}`;
          const nestedType = inferOverrideType(nestedKey, nestedValue);
          const formatted =
            nestedType === 'percent'
              ? toPercentString(nestedValue)
              : nestedType === 'money'
                ? toMoneyString(nestedValue)
                : nestedType === 'number'
                  ? toNumberString(nestedValue)
                  : String(nestedValue);
          return `${humanizeKey(nestedKey)} ${formatted ?? String(nestedValue)}`;
        })
        .join(', ');
      return `${humanizeKey(key)} updated${objectSummary ? ` (${objectSummary})` : ''}`;
    }
    const type = inferOverrideType(key, value);
    const formatted = Array.isArray(value)
      ? value.map((item) => {
          if (type === 'percent_array') return toPercentString(item) ?? String(item);
          if (type === 'number_array') return toNumberString(item) ?? String(item);
          return String(item);
        }).join(', ')
      : type === 'percent'
        ? toPercentString(value)
        : type === 'money'
          ? toMoneyString(value)
          : type === 'number'
            ? toNumberString(value)
            : String(value);
    return `${humanizeKey(key)} to ${formatted ?? String(value)}`;
  });

  return `Updated the ${labelForModelType(modelType)} model by setting ${labels.join(', ')}. The attached card now reflects the revised assumptions and remains downloadable in Excel.`;
}

async function buildClaudeNarrativeBlocks(params: {
  modelType: StructuredModelType;
  extractedInputs: ExtractedModelInputs;
  provenanceSummary: ProvenanceSummary;
}): Promise<ModelNarrativeBlock[] | null> {
  try {
    const result = await analystModelChatDeps.generateTextWithProviderFallback({
      preferredProvider: 'anthropic',
      clientType: 'service',
      temperature: 0.1,
      maxTokens: 700,
      messages: [
        {
          role: 'system',
          content:
            'You write concise buy-side model framing. Return JSON only with shape {"blocks":[{"title":"VALUATION FRAME","body":"..."},{"title":"KEY ASSUMPTIONS","body":"..."}]}. Do not invent numbers beyond the provided inputs.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            modelType: params.modelType,
            extractedInputs: params.extractedInputs,
            provenanceSummary: params.provenanceSummary,
          }),
        },
      ],
    });
    const payloadText = result?.text ? extractJsonObject(result.text) : null;
    if (!payloadText) return null;
    const parsed = JSON.parse(payloadText) as { blocks?: Array<{ title?: string; body?: string }> };
    const blocks = (parsed.blocks ?? [])
      .filter((block) => typeof block?.title === 'string' && typeof block?.body === 'string')
      .map((block) => ({ title: block.title!.trim(), body: block.body!.trim() }))
      .filter((block) => block.title.length > 0 && block.body.length > 0);
    return blocks.length > 0 ? blocks : null;
  } catch {
    return null;
  }
}

async function buildStructuredModelPayload(params: {
  prompt: string;
  modelType: StructuredModelType;
  extractedInputs: ExtractedModelInputs;
  defaultsUsed: Record<string, unknown>;
  provenanceSummary: ProvenanceSummary;
  fieldDisplayMap?: AnalystFieldDisplayMap;
  unitValidation?: AttachmentScaleValidation;
  sessionId?: string | null;
  replyPrefix?: string;
  attachmentExtractionContext?: AttachmentModelExtractionContext | null;
}): Promise<{ reply: string; payload: AnalystGeneratedModelPayload }> {
  const {
    prompt,
    modelType,
    extractedInputs,
    defaultsUsed,
    provenanceSummary,
    fieldDisplayMap,
    unitValidation,
    sessionId,
    replyPrefix,
    attachmentExtractionContext,
  } = params;
  const preview = TEMPLATE_MAP[modelType].getPreview(extractedInputs);
  const modelLabel = labelForModelType(modelType);
  const companyLabel =
    'companyName' in extractedInputs && typeof extractedInputs.companyName === 'string'
      ? extractedInputs.companyName
      : null;
  const defaultsSummary = summarizeDefaults(defaultsUsed);
  const scenarioContext = extractScenarioContext(prompt);
  const recentRun = await analystModelChatDeps.getLatestComparableRun({
    surface: 'analyst_chat',
    sessionId: sessionId ?? null,
    modelType,
    companyName: 'companyName' in extractedInputs ? extractedInputs.companyName : null,
    ticker: 'ticker' in extractedInputs ? extractedInputs.ticker ?? null : null,
  });
  const currentAssumptions = extractComparableAssumptions(extractedInputs as Record<string, unknown>);
  const comparisonSummary =
    recentRun?.latestVersion
      ? {
          previousVersionNumber: recentRun.latestVersion.versionNumber,
          currentVersionNumber: recentRun.latestVersion.versionNumber + 1,
          changedKeys: computeChangedKeys(recentRun.latestVersion.assumptions, currentAssumptions),
        }
      : null;
  const deterministicNarrativeBlocks = buildNarrativeBlocks(modelType, extractedInputs, scenarioContext);
  const narrativeBlocks =
    (await buildClaudeNarrativeBlocks({ modelType, extractedInputs, provenanceSummary })) ?? deterministicNarrativeBlocks;

  return {
    reply: [
      replyPrefix ??
        `Built ${companyLabel ? `${companyLabel}'s` : 'a'} ${modelLabel}. The workbook includes ${preview.tabs.join(', ')} so the output is immediately downloadable and reviewable in Excel.`,
      scenarioContext ? `Scenario context: ${scenarioContext}` : null,
      `${defaultsSummary} Key outputs in the workbook are ${KEY_OUTPUTS[modelType].join(', ')}. Use the attached card to download the model file.`,
      narrativeBlocks.map((block) => `${block.title}\n${block.body}`).join('\n\n'),
    ].filter((item): item is string => Boolean(item)).join('\n\n'),
    payload: {
      prompt,
      modelType,
      title: preview.title,
      tabs: preview.tabs,
      keyOutputs: KEY_OUTPUTS[modelType],
      scenarioContext,
      extractedInputs,
      defaultsUsed,
      provenanceSummary,
      comparisonSummary,
      recentRun: buildRecentRunSummary(recentRun),
      narrativeBlocks,
      fieldDisplayMap,
      unitValidationStatus: unitValidation?.ok ? 'validated' : undefined,
      unitValidationMessage: unitValidation?.ok ? unitValidation.message : null,
      attachmentExtraction: attachmentExtractionContext
        ? {
            providerTrace: attachmentExtractionContext.providerTrace,
            fieldConflicts: attachmentExtractionContext.fieldConflicts.map((conflict) => ({
              field: conflict.field,
              resolution: conflict.resolution,
              warning: conflict.warning,
            })),
          }
        : null,
    },
  };
}

export async function reviseAnalystStructuredModel(
  prompt: string,
  existingPayload: AnalystGeneratedModelPayload,
  sessionId?: string | null,
): Promise<AnalystModelRevisionResult | null> {
  const structuredReasoning = await derivePersistentModelReasoningResponse(prompt, existingPayload);
  const structuredOverrides = structuredReasoning
    ? translateFinancialReasoningToOverrides(existingPayload, structuredReasoning)
    : {};
  const eventShockOverrides = Object.keys(structuredOverrides).length === 0
    ? inferStructuredModelEventShock(prompt, existingPayload)
    : {};
  const overrides = Object.keys(structuredOverrides).length === 0
    ? extractFollowUpOverrides(prompt, existingPayload.extractedInputs)
    : {};
  const nestedOverrides = Object.keys(structuredOverrides).length === 0
    ? await applyNestedModelOverrides(prompt, existingPayload)
    : {};
  const mergedOverrides = { ...eventShockOverrides, ...overrides, ...nestedOverrides, ...structuredOverrides };
  const modelChanged = Object.keys(mergedOverrides).length > 0;
  if (!modelChanged) {
    if (
      structuredReasoning &&
      (structuredReasoning.intent === 'explanation' || structuredReasoning.intent === 'other') &&
      (structuredReasoning.summary || structuredReasoning.detailed_reasoning)
    ) {
      return {
        reply: buildReasoningReply(labelForModelType(existingPayload.modelType), structuredReasoning, false),
        payload: existingPayload,
        modelChanged: false,
      };
    }
    return null;
  }

  const extractedInputs = {
    ...existingPayload.extractedInputs,
    ...mergedOverrides,
  } as ExtractedModelInputs;
  const defaultsUsed = removeOverriddenDefaults(existingPayload.defaultsUsed, mergedOverrides);
  const fallbackUsed = Array.from(new Set([
    ...existingPayload.provenanceSummary.fallbackUsed,
    'follow_up_adjustment',
  ]));
  const currentAssumptions = extractComparableAssumptions(extractedInputs as Record<string, unknown>);
  const previousAssumptions = extractComparableAssumptions(existingPayload.extractedInputs as Record<string, unknown>);
  const changedKeys = computeChangedKeys(previousAssumptions, currentAssumptions);
  const previousVersionNumber =
    existingPayload.comparisonSummary?.currentVersionNumber ??
    existingPayload.recentRun?.versionNumber ??
    null;
  const payloadResult = await buildStructuredModelPayload({
    prompt,
    modelType: existingPayload.modelType,
    extractedInputs,
    defaultsUsed,
    provenanceSummary: {
      ...existingPayload.provenanceSummary,
      fallbackUsed,
    },
    sessionId,
    replyPrefix: buildAdjustedReply(existingPayload.modelType, mergedOverrides),
    attachmentExtractionContext: null,
  });

  return {
    reply: structuredReasoning
      ? buildReasoningReply(labelForModelType(existingPayload.modelType), structuredReasoning, true)
      : payloadResult.reply,
    payload: {
      ...payloadResult.payload,
      comparisonSummary:
        changedKeys.length > 0
          ? {
              previousVersionNumber,
              currentVersionNumber: previousVersionNumber !== null ? previousVersionNumber + 1 : null,
              changedKeys,
            }
          : payloadResult.payload.comparisonSummary,
    },
    modelChanged: true,
  };
}

export async function reviseAnalystStructuredModelFromOverrides(
  overrides: Record<string, unknown>,
  existingPayload: AnalystGeneratedModelPayload,
  sessionId?: string | null,
): Promise<AnalystModelRevisionResult | null> {
  const safeOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([key, value]) => key in existingPayload.extractedInputs && value !== undefined),
  );
  if (Object.keys(safeOverrides).length === 0) return null;

  const extractedInputs = {
    ...existingPayload.extractedInputs,
    ...safeOverrides,
  } as ExtractedModelInputs;
  const defaultsUsed = removeOverriddenDefaults(existingPayload.defaultsUsed, safeOverrides);
  const fallbackUsed = Array.from(
    new Set([...existingPayload.provenanceSummary.fallbackUsed, 'control_panel_adjustment']),
  );
  const currentAssumptions = extractComparableAssumptions(extractedInputs as Record<string, unknown>);
  const previousAssumptions = extractComparableAssumptions(existingPayload.extractedInputs as Record<string, unknown>);
  const changedKeys = computeChangedKeys(previousAssumptions, currentAssumptions);
  const previousVersionNumber =
    existingPayload.comparisonSummary?.currentVersionNumber ??
    existingPayload.recentRun?.versionNumber ??
    null;
  const payloadResult = await buildStructuredModelPayload({
    prompt: existingPayload.prompt,
    modelType: existingPayload.modelType,
    extractedInputs,
    defaultsUsed,
    provenanceSummary: {
      ...existingPayload.provenanceSummary,
      fallbackUsed,
    },
    sessionId,
    replyPrefix: buildAdjustedReply(existingPayload.modelType, safeOverrides),
    attachmentExtractionContext: null,
  });

  return {
    reply: payloadResult.reply,
    payload: {
      ...payloadResult.payload,
      comparisonSummary:
        changedKeys.length > 0
          ? {
              previousVersionNumber,
              currentVersionNumber: previousVersionNumber !== null ? previousVersionNumber + 1 : null,
              changedKeys,
            }
          : payloadResult.payload.comparisonSummary,
    },
    modelChanged: true,
  };
}

export async function generateAnalystStructuredModel(
  prompt: string,
  sessionId?: string | null,
  options: {
    attachmentStatementSnapshot?: AttachmentStatementSnapshot | null;
    inputOverrides?: Record<string, unknown>;
    clarificationAnswer?: string;
    attachmentDriven?: boolean;
    attachmentText?: string | null;
    attachmentSummary?: string | null;
    attachmentExtractionContext?: AttachmentModelExtractionContext | null;
  } = {},
): Promise<AnalystStructuredModelResult | null> {
  const modelType = classifyPrompt(prompt);
  if (!modelType) return null;

  const extraction = await extractInputs(prompt, modelType, {
    attachmentStatementSnapshot: options.attachmentStatementSnapshot ?? null,
    inputOverrides: options.inputOverrides,
    clarificationAnswer: options.clarificationAnswer,
    attachmentDriven: options.attachmentDriven === true,
    attachmentText: options.attachmentText,
    attachmentSummary: options.attachmentSummary,
    attachmentExtractionContext: options.attachmentExtractionContext ?? null,
  });

  if (extraction.scaleValidation && !extraction.scaleValidation.ok) {
    return {
      reply: extraction.scaleValidation.message,
      validationFailed: true,
      unitValidation: extraction.scaleValidation,
    };
  }

  const keepCompanyType =
    promptExplicitlySetsCompanyType(prompt) ||
    (typeof options.inputOverrides?.companyType === 'string' && options.inputOverrides.companyType.trim().length > 0);
  let extractedInputs =
    options.attachmentDriven === true
      ? stripUngroundedAttachmentMetadata(extraction.extractedInputs, keepCompanyType)
      : extraction.extractedInputs;
  let defaultsUsed = extraction.defaultsUsed;
  let provenanceSummary = extraction.provenanceSummary;

  const extractedInputRecord = extractedInputs as Record<string, unknown>;
  const shouldForceNamedCompanyResolution =
    options.attachmentDriven !== true &&
    (extractedInputRecord.companyName === 'Demo Company' ||
      (typeof extractedInputRecord.ticker !== 'string' || extractedInputRecord.ticker.trim().length === 0));

  if (shouldForceNamedCompanyResolution) {
    const snapshots = withUniverseBackfill(await loadDemoSnapshots());
    const resolvedCompany = resolveSingleDemoCompanyFromPrompt(prompt, snapshots);
    if (resolvedCompany) {
      extractedInputs = applyResolvedDemoCompanyToInputs(modelType, extractedInputs, resolvedCompany);
      provenanceSummary = applyResolvedDemoCompanyProvenance(provenanceSummary, resolvedCompany);
      defaultsUsed = { ...defaultsUsed };
      delete defaultsUsed.companyName;
      delete defaultsUsed.baseRevenue;
      delete defaultsUsed.cash;
      delete defaultsUsed.debt;
      delete defaultsUsed.sharesOutstanding;
      delete defaultsUsed.sharePrice;
      delete defaultsUsed.marketCap;
    }
  }

  return buildStructuredModelPayload({
    prompt,
    modelType,
    extractedInputs,
    defaultsUsed,
    provenanceSummary,
    fieldDisplayMap: extraction.fieldDisplayMap,
    unitValidation: extraction.scaleValidation,
    sessionId,
    attachmentExtractionContext: options.attachmentExtractionContext ?? null,
  });
}
