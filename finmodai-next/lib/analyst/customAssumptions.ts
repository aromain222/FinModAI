import type { ExtractedModelInputs } from '@/lib/model-generator/extractInputs';
import type { SmartAssumptionDriverKey } from '@/lib/smart-assumptions/types';

export type CustomAssumptionDriverValue = Partial<Record<SmartAssumptionDriverKey, number | null>>;

export type CustomAssumptionResult = {
  sourceType: 'custom_assumption_input';
  companyName: string | null;
  ticker: string | null;
  changedDrivers: Array<{
    driver: SmartAssumptionDriverKey;
    label: string;
    old: number | null;
    new: number | null;
  }>;
  warnings: string[];
};

type DriverConfig = {
  driver: SmartAssumptionDriverKey;
  label: string;
  aliases: string[];
  min: number;
  max: number;
};

const DRIVER_CONFIG: DriverConfig[] = [
  {
    driver: 'revenue_growth',
    label: 'Revenue growth',
    aliases: ['revenue growth', 'sales growth', 'top line growth', 'topline growth'],
    min: -0.2,
    max: 0.6,
  },
  {
    driver: 'operating_margin',
    label: 'Operating margin',
    aliases: ['operating margin', 'ebit margin', 'ebitda margin'],
    min: -0.3,
    max: 0.7,
  },
  {
    driver: 'wacc',
    label: 'WACC',
    aliases: ['wacc', 'discount rate', 'cost of capital'],
    min: 0.03,
    max: 0.3,
  },
  {
    driver: 'terminal_growth_rate',
    label: 'Terminal growth',
    aliases: ['terminal growth', 'terminal growth rate', 'perpetual growth', 'perpetual growth rate'],
    min: 0,
    max: 0.08,
  },
];

function normalizePercent(value: number): number {
  return Math.abs(value) > 1 ? value / 100 : value;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildCurrentAssumptionsFromExtractedInputs(
  extractedInputs: ExtractedModelInputs | Record<string, unknown>,
): CustomAssumptionDriverValue {
  const inputs = extractedInputs as Record<string, unknown>;
  const revenueGrowth = inputs.revenueGrowth;
  const ebitMargin = inputs.ebitMargin ?? inputs.ebitdaMargin;
  const terminalGrowth = inputs.terminalGrowth;

  return {
    revenue_growth:
      Array.isArray(revenueGrowth) && typeof revenueGrowth[0] === 'number'
        ? (revenueGrowth[0] as number)
        : typeof revenueGrowth === 'number'
          ? revenueGrowth
          : null,
    operating_margin:
      Array.isArray(ebitMargin) && typeof ebitMargin[0] === 'number'
        ? (ebitMargin[0] as number)
        : typeof ebitMargin === 'number'
          ? ebitMargin
          : null,
    wacc: typeof inputs.wacc === 'number' ? inputs.wacc : null,
    terminal_growth_rate: typeof terminalGrowth === 'number' ? terminalGrowth : null,
  };
}

export function buildAnalystCustomAssumptionOverrides(
  existingInputs: Record<string, unknown>,
  values: CustomAssumptionDriverValue,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  const applyArrayOrScalar = (key: string, value: number | null | undefined) => {
    if (typeof value !== 'number' || !(key in existingInputs)) return;
    const current = existingInputs[key];
    if (Array.isArray(current) && current.every((item) => typeof item === 'number')) {
      overrides[key] = current.map(() => value);
      return;
    }
    overrides[key] = value;
  };

  applyArrayOrScalar('revenueGrowth', values.revenue_growth);
  if ('ebitMargin' in existingInputs) {
    applyArrayOrScalar('ebitMargin', values.operating_margin);
  } else if ('ebitdaMargin' in existingInputs) {
    applyArrayOrScalar('ebitdaMargin', values.operating_margin);
  }
  applyArrayOrScalar('wacc', values.wacc);
  applyArrayOrScalar('terminalGrowth', values.terminal_growth_rate);

  return overrides;
}

function parsePromptValue(prompt: string, config: DriverConfig): number | null {
  for (const alias of config.aliases) {
    const escapedAlias = escapeRegex(alias);
    const patterns = [
      new RegExp(`(?:set|change|make|update|adjust|raise|lower|reduce|cut|bump|trim|revise)?\\s*(?:the\\s+)?${escapedAlias}\\s*(?:rate)?\\s*(?:to|at|=)?\\s*(-?\\d+(?:\\.\\d+)?)\\s*%?`, 'i'),
      new RegExp(`${escapedAlias}\\s*(?:should\\s+be|is|at|to|=)?\\s*(-?\\d+(?:\\.\\d+)?)\\s*%?`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      const parsed = toFiniteNumber(match?.[1]);
      if (parsed === null) continue;
      return normalizePercent(parsed);
    }
  }
  return null;
}

export function looksLikeCustomAssumptionPrompt(prompt: string): boolean {
  const text = prompt.toLowerCase();
  const hasIntent = /\b(set|change|make|update|adjust|raise|lower|reduce|cut|bump|trim|revise|assume)\b/.test(text);
  const hasDriver = DRIVER_CONFIG.some((config) => config.aliases.some((alias) => text.includes(alias)));
  const hasNumber = /-?\d+(?:\.\d+)?\s*%?/.test(text);
  return hasIntent && hasDriver && hasNumber;
}

export function buildCustomAssumptionResult(params: {
  companyName?: string | null;
  ticker?: string | null;
  currentAssumptions: CustomAssumptionDriverValue;
  requestedValues: CustomAssumptionDriverValue;
}): { summary: CustomAssumptionResult | null; errors: string[] } {
  const errors: string[] = [];
  const changedDrivers: CustomAssumptionResult['changedDrivers'] = [];

  for (const config of DRIVER_CONFIG) {
    const requestedValue = params.requestedValues[config.driver];
    if (requestedValue === undefined || requestedValue === null) continue;
    if (!Number.isFinite(requestedValue)) {
      errors.push(`${config.label} must be a valid percentage.`);
      continue;
    }
    if (requestedValue < config.min || requestedValue > config.max) {
      errors.push(`${config.label} must be between ${(config.min * 100).toFixed(1)}% and ${(config.max * 100).toFixed(1)}%.`);
      continue;
    }
    const currentValue = params.currentAssumptions[config.driver] ?? null;
    if (currentValue !== null && Math.abs(currentValue - requestedValue) < 0.0001) {
      continue;
    }
    changedDrivers.push({
      driver: config.driver,
      label: config.label,
      old: currentValue,
      new: Number(requestedValue.toFixed(4)),
    });
  }

  if (changedDrivers.length === 0) {
    return { summary: null, errors: errors.length > 0 ? errors : ['No valid custom assumptions were provided.'] };
  }

  return {
    summary: {
      sourceType: 'custom_assumption_input',
      companyName: params.companyName ?? null,
      ticker: params.ticker ?? null,
      changedDrivers,
      warnings: errors,
    },
    errors,
  };
}

export function parseCustomAssumptionPrompt(params: {
  prompt: string;
  companyName?: string | null;
  ticker?: string | null;
  currentAssumptions: CustomAssumptionDriverValue;
}): { summary: CustomAssumptionResult | null; changes: Record<string, unknown>; reply: string | null } {
  const requestedValues: CustomAssumptionDriverValue = {};
  for (const config of DRIVER_CONFIG) {
    const parsed = parsePromptValue(params.prompt, config);
    if (parsed !== null) requestedValues[config.driver] = parsed;
  }

  const { summary, errors } = buildCustomAssumptionResult({
    companyName: params.companyName,
    ticker: params.ticker,
    currentAssumptions: params.currentAssumptions,
    requestedValues,
  });

  if (!summary) {
    return {
      summary: null,
      changes: {},
      reply:
        errors.length > 0
          ? errors[0] ?? 'I could not validate those custom assumptions.'
          : 'Use explicit values like “set WACC to 10% and terminal growth to 2.5%”.',
    };
  }

  return {
    summary,
    changes: {},
    reply: null,
  };
}

export function buildCustomAssumptionReply(summary: CustomAssumptionResult): string {
  const changed = summary.changedDrivers
    .map((driver) => {
      const oldLabel = driver.old !== null ? `${(driver.old * 100).toFixed(1)}%` : 'n/a';
      const newLabel = driver.new !== null ? `${(driver.new * 100).toFixed(1)}%` : 'n/a';
      return `${driver.label} ${oldLabel} → ${newLabel}`;
    })
    .join(', ');

  return [
    `Applied custom assumptions for ${summary.companyName ?? summary.ticker ?? 'the active model'}: ${changed}.`,
    summary.warnings.length > 0 ? `Warnings: ${summary.warnings.join(' ')}` : null,
  ]
    .filter((item): item is string => Boolean(item))
    .join(' ');
}
