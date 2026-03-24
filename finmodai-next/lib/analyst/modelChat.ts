import { classifyPrompt, type ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';
import {
  extractInputs,
  type CompsPeerInputs,
  type ExtractedModelInputs,
  type PrecedentTransactionInputs,
} from '@/lib/model-generator/extractInputs';
import type { ComparisonSummary, PromptRunRecord, ProvenanceSummary } from '@/lib/model-generator/runHistory';
import { getLatestComparableRun } from '@/lib/model-generator/runHistory';
import * as compsTemplate from '@/lib/model-generator/templates/comps';
import * as precedentsTemplate from '@/lib/model-generator/templates/precedents';
import * as lboTemplate from '@/lib/model-generator/templates/lbo';
import * as threeStatementTemplate from '@/lib/model-generator/templates/threeStatement';
import * as capTableTemplate from '@/lib/model-generator/templates/capTable';
import * as saasOperatingTemplate from '@/lib/model-generator/templates/saasOperating';
import { loadDemoSnapshots, type DemoCompanySnapshot } from '@/lib/demo/demoSnapshotStore';

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

export type AnalystStructuredModelAdjustment = {
  changes: Record<string, unknown>;
  prompt?: string;
};

type StructuredModelType = Exclude<ModelGeneratorType, 'DCF'>;

type PreviewBuilder = {
  getPreview: (inputs: ExtractedModelInputs) => { title: string; tabs: string[] };
};

const TEMPLATE_MAP: Record<StructuredModelType, PreviewBuilder> = {
  COMPS: compsTemplate as PreviewBuilder,
  PRECEDENTS: precedentsTemplate as PreviewBuilder,
  LBO: lboTemplate as PreviewBuilder,
  THREE_STATEMENT: threeStatementTemplate as PreviewBuilder,
  CAP_TABLE: capTableTemplate as PreviewBuilder,
  SAAS_OPERATING_MODEL: saasOperatingTemplate as PreviewBuilder,
};

const KEY_OUTPUTS: Record<StructuredModelType, string[]> = {
  COMPS: ['Peer Trading Multiples', 'Implied Valuation Range', 'Premium / Discount View', 'Peer Set Summary'],
  PRECEDENTS: ['Transaction Multiples', 'Control Premium', 'Implied Valuation Range', 'Pitch Summary'],
  LBO: ['MOIC', 'IRR', 'Exit Equity Value', 'Debt Paydown'],
  THREE_STATEMENT: ['Revenue CAGR', 'EBITDA Margin', 'Ending Cash', 'Debt Balance'],
  CAP_TABLE: ['Post-Money Valuation', 'Founder Dilution', 'New Investor Ownership', 'Option Pool Impact'],
  SAAS_OPERATING_MODEL: ['ARR Growth', 'Gross Margin', 'CAC Payback', 'LTV:CAC'],
};

function labelForModelType(modelType: StructuredModelType): string {
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

function buildCompsFoundationParagraph(inputs: {
  companyName: string;
  subject: CompsPeerInputs;
  peers: CompsPeerInputs[];
}): string {
  const leadPeer = inputs.peers[0] ?? null;
  if (!leadPeer) {
    return `${inputs.companyName} is being framed through a peer-relative lens first. The immediate question is whether the current subject profile justifies a premium, discount, or neutral valuation stance versus the chosen peer set.`;
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
    return `${scaleLeader} starts from the stronger operating base in this comparison, so the first question is whether the current market price already captures that scale and earnings advantage or still leaves room for relative upside.`;
  }

  if (scaleLeader && profitabilityLeader && scaleLeader !== profitabilityLeader) {
    return `${scaleLeader} screens larger on revenue while ${profitabilityLeader} screens stronger on EBITDA, so this comparison is really about whether investors should pay for scale, profitability, or the possibility of convergence between the two.`;
  }

  return `${inputs.companyName} should be judged here through relative scale, profitability, and trading multiples rather than a standalone narrative. The main job of the comps view is to show whether the current price is asking investors to underwrite too much or too little versus ${leadPeer.name}.`;
}

function extractComparableAssumptions(inputs: Record<string, unknown>): Record<string, unknown> {
  const skip = new Set(['modelType', 'source', 'companyName', 'ticker', 'companyType', 'peerSetLabel', 'subject', 'peers', 'transactions']);
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

function buildRecentRunSummary(recentRun: PromptRunRecord | null) {
  if (!recentRun) return null;
  return {
    runId: recentRun.id,
    versionNumber: recentRun.latestVersion?.versionNumber ?? null,
    createdAt: recentRun.createdAt,
    status: recentRun.status,
  };
}

function buildNarrativeBlocks(modelType: StructuredModelType, inputs: ExtractedModelInputs): ModelNarrativeBlock[] {
  switch (modelType) {
    case 'COMPS': {
      const compsInputs = inputs as ExtractedModelInputs & {
        companyName: string;
        peers: Array<{ ticker: string; revenue: number | null; ebitda: number | null }>;
        subject: { revenue: number | null; ebitda: number | null; price: number | null };
      };
      return [
        {
          title: 'FOUNDATIONAL VIEW',
          body: buildCompsFoundationParagraph({
            companyName: compsInputs.companyName,
            subject: compsInputs.subject,
            peers: compsInputs.peers,
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

async function buildStructuredModelPayload(params: {
  prompt: string;
  modelType: StructuredModelType;
  extractedInputs: ExtractedModelInputs;
  defaultsUsed: Record<string, unknown>;
  provenanceSummary: ProvenanceSummary;
  sessionId?: string | null;
  replyPrefix?: string;
}): Promise<{ reply: string; payload: AnalystGeneratedModelPayload }> {
  const { prompt, modelType, extractedInputs, defaultsUsed, provenanceSummary, sessionId, replyPrefix } = params;
  const preview = TEMPLATE_MAP[modelType].getPreview(extractedInputs);
  const modelLabel = labelForModelType(modelType);
  const defaultsSummary = summarizeDefaults(defaultsUsed);
  const recentRun = await getLatestComparableRun({
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
  const narrativeBlocks = buildNarrativeBlocks(modelType, extractedInputs);

  return {
    reply: [
      replyPrefix ?? `Built a demo-ready ${modelLabel} model from your prompt. The workbook includes ${preview.tabs.join(', ')} so the output is immediately downloadable and reviewable in Excel.`,
      `${defaultsSummary} Key outputs in the workbook are ${KEY_OUTPUTS[modelType].join(', ')}. Use the attached card to download the model file.`,
      narrativeBlocks.map((block) => `${block.title}\n${block.body}`).join('\n\n'),
    ].join('\n\n'),
    payload: {
      prompt,
      modelType,
      title: preview.title,
      tabs: preview.tabs,
      keyOutputs: KEY_OUTPUTS[modelType],
      extractedInputs,
      defaultsUsed,
      provenanceSummary,
      comparisonSummary,
      recentRun: buildRecentRunSummary(recentRun),
      narrativeBlocks,
    },
  };
}

export async function reviseAnalystStructuredModel(
  prompt: string,
  existingPayload: AnalystGeneratedModelPayload,
  sessionId?: string | null,
): Promise<{ reply: string; payload: AnalystGeneratedModelPayload } | null> {
  const eventShockOverrides = inferStructuredModelEventShock(prompt, existingPayload);
  const overrides = extractFollowUpOverrides(prompt, existingPayload.extractedInputs);
  const nestedOverrides = await applyNestedModelOverrides(prompt, existingPayload);
  const mergedOverrides = { ...eventShockOverrides, ...overrides, ...nestedOverrides };
  if (Object.keys(mergedOverrides).length === 0) return null;

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
  };
}

export async function reviseAnalystStructuredModelFromOverrides(
  overrides: Record<string, unknown>,
  existingPayload: AnalystGeneratedModelPayload,
  sessionId?: string | null,
): Promise<{ reply: string; payload: AnalystGeneratedModelPayload } | null> {
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
  };
}

export async function generateAnalystStructuredModel(prompt: string, sessionId?: string | null): Promise<{
  reply: string;
  payload: AnalystGeneratedModelPayload;
} | null> {
  const modelType = classifyPrompt(prompt);
  if (!modelType || modelType === 'DCF') return null;

  const extraction = await extractInputs(prompt, modelType);
  return buildStructuredModelPayload({
    prompt,
    modelType,
    extractedInputs: extraction.extractedInputs,
    defaultsUsed: extraction.defaultsUsed,
    provenanceSummary: extraction.provenanceSummary,
    sessionId,
  });
}
