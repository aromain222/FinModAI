import type { DemoCompanySnapshot } from '@/lib/demo/demoSnapshotStore';
import {
  CAP_TABLE_DEFAULTS,
  DEBT_CAPACITY_LITE_DEFAULTS,
  SAAS_OPERATING_DEFAULTS,
} from '@/lib/model-generator/defaults';
import type { ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';
import type {
  ExtractInputsOptions,
  ExtractInputsResult,
} from '@/lib/model-generator/extractInputs';

type CompanyProfile = {
  saasGrowthRate?: number;
  saasGrossMargin?: number;
  saasChurn?: number;
  saasCac?: number;
  saasArpu?: number;
};

type ScaleProfile = {
  startingArr: number;
  growthRate: number;
  churn: number;
  cac: number;
  arpu: number;
};

type BasicBuilderDeps = {
  buildMissingList: (fields: Array<[key: string, isProvided: boolean]>) => string[];
  buildProvenanceSummary: (params: {
    source: string;
    asOfDate?: string | null;
    lastSynced?: string | null;
    fallbackUsed?: string[];
  }) => ExtractInputsResult['provenanceSummary'];
  deriveCompanyLabel: (companyType: string | null, fallback: string) => string;
  evaluateCriticalInputs: (modelType: ModelGeneratorType, providedInputs: Iterable<string>) => string[];
  extractCompanyName: (prompt: string) => string | null;
  extractCompanyScale: (prompt: string) => string | null;
  extractCompanyType: (prompt: string) => string | null;
  extractGrowthRate: (prompt: string) => number | undefined;
  extractMargin: (text: string, labelPattern: RegExp) => number | undefined;
  extractMultiple: (text: string, pattern: RegExp) => number | undefined;
  extractRoundType: (text: string) => string | undefined;
  getCompanyProfile: (companyType: string | null) => CompanyProfile;
  getScaleProfile: (companyScale: string | null) => ScaleProfile | null;
  parseMoneyToken: (value: string | undefined) => number | undefined;
  parsePercentToken: (value: string | undefined) => number | undefined;
  resolveDemoCompany: (
    prompt: string,
    options?: ExtractInputsOptions,
  ) => Promise<{ ticker: string; snapshot: DemoCompanySnapshot } | null>;
  resolveStoredCompany: (
    prompt: string,
  ) => Promise<{
    company: {
      name: string;
      ticker?: string | null;
      companyType?: string | null;
      isSaas?: boolean | null;
    };
    snapshot?: {
      source?: string | null;
      asOfDate?: string | null;
      createdAt?: string | null;
      ebitdaLtm?: number | null;
      cash?: number | null;
      totalDebt?: number | null;
    } | null;
    latestPrice?: { createdAt?: string | null } | null;
    kpis?: Array<{
      arr?: number | null;
      grossMargin?: number | null;
      arpu?: number | null;
      source?: string | null;
      asOfDate?: string | null;
    }> | null;
  } | null>;
};

export async function buildCapTableInputs(
  prompt: string,
  deps: BasicBuilderDeps,
): Promise<ExtractInputsResult> {
  const providedInputs = new Set<string>();
  const raiseMatch =
    prompt.match(/(?:raising|raise|round)\s+\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)/i) ||
    prompt.match(/\$([\d.,]+(?:\.\d+)?\s*[kmb]?)\s*(?:raise|financing)/i);
  const preMoneyMatch =
    prompt.match(/\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)\s*pre-money/i) ||
    prompt.match(/pre-money valuation\s+(?:of\s+)?\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)/i);
  const founderSharesMatch = prompt.match(/founder shares\s+(?:of\s+)?([\d.,]+(?:\.\d+)?\s*[kmb]?)/i);
  const optionPoolMatch = prompt.match(/option pool(?:\s+refresh)?\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*%/i);

  const parsedRoundType = deps.extractRoundType(prompt);
  const roundType = parsedRoundType ?? CAP_TABLE_DEFAULTS.roundType;
  const raiseAmount = deps.parseMoneyToken(raiseMatch?.[1]) ?? CAP_TABLE_DEFAULTS.raiseAmount;
  const preMoney = deps.parseMoneyToken(preMoneyMatch?.[1]) ?? CAP_TABLE_DEFAULTS.preMoney;
  const founderShares = deps.parseMoneyToken(founderSharesMatch?.[1]) ?? CAP_TABLE_DEFAULTS.founderShares;
  const optionPoolRefresh = deps.parsePercentToken(optionPoolMatch?.[1]) ?? CAP_TABLE_DEFAULTS.optionPoolRefresh;

  if (parsedRoundType) providedInputs.add('roundType');
  if (raiseMatch) providedInputs.add('raiseAmount');
  if (preMoneyMatch) providedInputs.add('preMoney');
  if (founderSharesMatch) providedInputs.add('founderShares');
  if (optionPoolMatch) providedInputs.add('optionPoolRefresh');

  const defaultsUsed: Record<string, unknown> = {};
  if (!parsedRoundType) defaultsUsed.roundType = CAP_TABLE_DEFAULTS.roundType;
  if (!raiseMatch) defaultsUsed.raiseAmount = CAP_TABLE_DEFAULTS.raiseAmount;
  if (!preMoneyMatch) defaultsUsed.preMoney = CAP_TABLE_DEFAULTS.preMoney;
  if (!founderSharesMatch) defaultsUsed.founderShares = CAP_TABLE_DEFAULTS.founderShares;
  if (!optionPoolMatch) defaultsUsed.optionPoolRefresh = CAP_TABLE_DEFAULTS.optionPoolRefresh;

  return {
    extractedInputs: {
      modelType: 'CAP_TABLE',
      roundType,
      preMoney,
      raiseAmount,
      founderShares,
      optionPoolRefresh,
    },
    defaultsUsed,
    missingInputs: deps.buildMissingList([
      ['roundType', providedInputs.has('roundType')],
      ['raiseAmount', providedInputs.has('raiseAmount')],
      ['preMoney', providedInputs.has('preMoney')],
      ['founderShares', providedInputs.has('founderShares')],
      ['optionPoolRefresh', providedInputs.has('optionPoolRefresh')],
    ]),
    missingCriticalInputs: deps.evaluateCriticalInputs('CAP_TABLE', providedInputs),
    provenanceSummary: deps.buildProvenanceSummary({
      source: 'prompt_inputs',
      fallbackUsed: Object.keys(defaultsUsed),
    }),
  };
}

export async function buildDebtCapacityLiteInputs(
  prompt: string,
  options: ExtractInputsOptions,
  deps: BasicBuilderDeps,
): Promise<ExtractInputsResult> {
  const providedInputs = new Set<string>();
  const defaultsUsed: Record<string, unknown> = {};
  const parsedCompanyName = deps.extractCompanyName(prompt);
  const resolutionPrompt = parsedCompanyName ?? prompt;
  const stored = await deps.resolveStoredCompany(resolutionPrompt);
  const resolved =
    stored?.snapshot
      ? null
      : (await deps.resolveDemoCompany(resolutionPrompt, options)) ??
        (resolutionPrompt === prompt ? null : await deps.resolveDemoCompany(prompt, options));

  const companyType =
    deps.extractCompanyType(prompt) ??
    stored?.company.companyType ??
    resolved?.snapshot.sector ??
    null;
  const companyName =
    parsedCompanyName || stored?.company.name || resolved?.snapshot.companyName || deps.deriveCompanyLabel(companyType, 'Credit Subject');
  const ticker = stored?.company.ticker ?? resolved?.ticker;

  if (companyType) providedInputs.add('companyType');
  if (parsedCompanyName || stored?.company.name || resolved?.snapshot.companyName) providedInputs.add('companyName');

  const ebitda = stored?.snapshot?.ebitdaLtm ?? resolved?.snapshot.ebitdaLtm ?? null;
  const currentNetDebt =
    (stored?.snapshot?.totalDebt ?? resolved?.snapshot.totalDebt ?? 0) - (stored?.snapshot?.cash ?? resolved?.snapshot.cash ?? 0);
  if (ebitda !== null) providedInputs.add('ebitda');

  const maxLeverageInput =
    deps.extractMultiple(prompt, /max leverage\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*x?/i) ??
    deps.extractMultiple(prompt, /(\d+(?:\.\d+)?)\s*x\s*(?:max )?leverage/i);
  const minCoverageInput =
    deps.extractMultiple(prompt, /min(?:imum)? interest coverage\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*x?/i) ??
    deps.extractMultiple(prompt, /(\d+(?:\.\d+)?)\s*x\s*(?:minimum )?interest coverage/i);
  const interestRateInput = deps.extractMargin(prompt, /interest rate\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*%/i);

  const maxLeverage = maxLeverageInput ?? DEBT_CAPACITY_LITE_DEFAULTS.maxLeverage;
  const minInterestCoverage = minCoverageInput ?? DEBT_CAPACITY_LITE_DEFAULTS.minInterestCoverage;
  const interestRate = interestRateInput ?? DEBT_CAPACITY_LITE_DEFAULTS.interestRate;

  if (maxLeverageInput !== undefined) providedInputs.add('maxLeverage');
  else defaultsUsed.maxLeverage = DEBT_CAPACITY_LITE_DEFAULTS.maxLeverage;
  if (minCoverageInput !== undefined) providedInputs.add('minInterestCoverage');
  else defaultsUsed.minInterestCoverage = DEBT_CAPACITY_LITE_DEFAULTS.minInterestCoverage;
  if (interestRateInput !== undefined) providedInputs.add('interestRate');
  else defaultsUsed.interestRate = DEBT_CAPACITY_LITE_DEFAULTS.interestRate;

  return {
    extractedInputs: {
      modelType: 'DEBT_CAPACITY_LITE',
      companyName,
      companyType: companyType ?? undefined,
      ticker,
      source: stored?.snapshot?.source ?? (resolved ? 'demo_company_snapshots' : companyType ? 'company_type_defaults' : 'demo_defaults'),
      ebitda,
      currentNetDebt: Number.isFinite(currentNetDebt) ? currentNetDebt : null,
      maxLeverage,
      minInterestCoverage,
      interestRate,
    },
    defaultsUsed,
    missingInputs: deps.buildMissingList([
      ['companyName or companyType', providedInputs.has('companyName') || providedInputs.has('companyType')],
      ['EBITDA anchor', ebitda !== null],
    ]),
    missingCriticalInputs: deps.evaluateCriticalInputs('DEBT_CAPACITY_LITE', providedInputs),
    provenanceSummary: deps.buildProvenanceSummary({
      source: stored?.snapshot?.source ?? (resolved ? 'demo_company_snapshots' : companyType ? 'company_type_defaults' : 'demo_defaults'),
      asOfDate: stored?.snapshot?.asOfDate ?? resolved?.snapshot.updatedAt ?? null,
      lastSynced: stored?.snapshot?.createdAt ?? stored?.latestPrice?.createdAt ?? resolved?.snapshot.updatedAt ?? null,
      fallbackUsed: Object.keys(defaultsUsed),
    }),
  };
}

export async function buildSaasInputs(
  prompt: string,
  deps: BasicBuilderDeps,
): Promise<ExtractInputsResult> {
  const providedInputs = new Set<string>();
  const stored = await deps.resolveStoredCompany(prompt);
  const companyName = deps.extractCompanyName(prompt);
  const extractedCompanyType = deps.extractCompanyType(prompt);
  const companyType = extractedCompanyType ?? stored?.company.companyType ?? (stored?.company.isSaas ? 'SaaS' : null) ?? 'SaaS';
  const companyScale = deps.extractCompanyScale(prompt);
  const scaleProfile = deps.getScaleProfile(companyScale);

  if (companyName) providedInputs.add('companyName');
  if (extractedCompanyType) providedInputs.add('companyType');
  if (companyScale) providedInputs.add('companyScale');

  const growthInput = deps.extractGrowthRate(prompt);
  const arrMatch =
    prompt.match(/starting arr\s+(?:of\s+)?\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)/i) ||
    prompt.match(/arr\s+(?:of\s+)?\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)/i);
  const churnInput = deps.extractMargin(prompt, /churn\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*%/i);
  const grossMarginInput = deps.extractMargin(prompt, /gross\s+margin\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*%/i);
  const cacMatch = prompt.match(/cac\s+(?:of\s+)?\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)/i);
  const arpuMatch = prompt.match(/arpu\s+(?:of\s+)?\$?([\d.,]+(?:\.\d+)?\s*[kmb]?)/i);

  const startingArrInput = deps.parseMoneyToken(arrMatch?.[1]);
  if (startingArrInput !== undefined) providedInputs.add('startingArr');
  if (growthInput !== undefined) providedInputs.add('growthRate');
  if (churnInput !== undefined) providedInputs.add('churn');
  if (grossMarginInput !== undefined) providedInputs.add('grossMargin');
  if (cacMatch) providedInputs.add('cac');
  if (arpuMatch) providedInputs.add('arpu');

  const profile = deps.getCompanyProfile(companyType);
  const latestKpi = stored?.kpis?.[0] ?? null;
  const startingArr = startingArrInput ?? latestKpi?.arr ?? scaleProfile?.startingArr ?? SAAS_OPERATING_DEFAULTS.startingArr;
  const growthRate = growthInput ?? profile.saasGrowthRate ?? scaleProfile?.growthRate ?? SAAS_OPERATING_DEFAULTS.growthRate;
  const grossMargin = grossMarginInput ?? latestKpi?.grossMargin ?? profile.saasGrossMargin ?? SAAS_OPERATING_DEFAULTS.grossMargin;
  const churn = churnInput ?? profile.saasChurn ?? scaleProfile?.churn ?? SAAS_OPERATING_DEFAULTS.churn;
  const cac = deps.parseMoneyToken(cacMatch?.[1]) ?? profile.saasCac ?? scaleProfile?.cac ?? SAAS_OPERATING_DEFAULTS.cac;
  const arpu = deps.parseMoneyToken(arpuMatch?.[1]) ?? latestKpi?.arpu ?? profile.saasArpu ?? scaleProfile?.arpu ?? SAAS_OPERATING_DEFAULTS.arpu;
  const resolvedCompanyName = companyName ?? stored?.company.name ?? (companyScale ? `${companyScale} ${companyType} Co.` : SAAS_OPERATING_DEFAULTS.companyName);

  const defaultsUsed: Record<string, unknown> = {
    years: SAAS_OPERATING_DEFAULTS.years,
  };
  if (startingArrInput === undefined) defaultsUsed.startingArr = startingArr;
  if (growthInput === undefined) defaultsUsed.growthRate = growthRate;
  if (grossMarginInput === undefined) defaultsUsed.grossMargin = grossMargin;
  if (churnInput === undefined) defaultsUsed.churn = churn;
  if (!cacMatch) defaultsUsed.cac = cac;
  if (!arpuMatch) defaultsUsed.arpu = arpu;
  if (!companyName) defaultsUsed.companyName = resolvedCompanyName;

  return {
    extractedInputs: {
      modelType: 'SAAS_OPERATING_MODEL',
      companyName: resolvedCompanyName,
      companyType,
      companyScale: companyScale ?? undefined,
      years: SAAS_OPERATING_DEFAULTS.years,
      source: latestKpi ? latestKpi.source ?? 'company_profile_defaults' : providedInputs.has('companyScale') || providedInputs.has('companyType') ? 'company_profile_defaults' : 'demo_defaults',
      startingArr,
      growthRate,
      grossMargin,
      churn,
      cac,
      arpu,
    },
    defaultsUsed,
    missingInputs: deps.buildMissingList([
      ['startingArr or companyScale', providedInputs.has('startingArr') || providedInputs.has('companyScale') || providedInputs.has('companyType')],
      ['growthRate', providedInputs.has('growthRate')],
      ['grossMargin', providedInputs.has('grossMargin')],
      ['churn', providedInputs.has('churn')],
      ['cac', providedInputs.has('cac')],
      ['arpu', providedInputs.has('arpu')],
    ]),
    missingCriticalInputs: deps.evaluateCriticalInputs('SAAS_OPERATING_MODEL', providedInputs),
    provenanceSummary: deps.buildProvenanceSummary({
      source: latestKpi ? latestKpi.source ?? 'company_profile_defaults' : providedInputs.has('companyScale') || providedInputs.has('companyType') ? 'company_profile_defaults' : 'demo_defaults',
      asOfDate: latestKpi?.asOfDate ?? stored?.snapshot?.asOfDate ?? null,
      lastSynced: stored?.snapshot?.createdAt ?? stored?.latestPrice?.createdAt ?? null,
      fallbackUsed: Object.keys(defaultsUsed),
    }),
  };
}
