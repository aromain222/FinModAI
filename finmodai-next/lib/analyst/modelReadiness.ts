import type { AttachmentStatementSnapshot } from '@/lib/analyst/pdfFinancialStatements';
import type { ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';

export type AttachmentDrivenModelType = Extract<ModelGeneratorType, 'DCF' | 'THREE_STATEMENT' | 'COMPS' | 'LBO'>;
export type ClarificationParseType = 'text' | 'money' | 'number' | 'percent';

export type PendingModelRequest = {
  modelType: AttachmentDrivenModelType;
  originalPrompt: string;
  attachmentName?: string | null;
  inputOverrides?: Record<string, unknown>;
  clarificationField?: string | null;
};

export type AttachmentModelReadiness = {
  ready: boolean;
  missingInputs: string[];
  clarificationField?: string;
  clarificationFieldLabel?: string;
  clarificationParseType?: ClarificationParseType;
  clarificationQuestion?: string;
};

type ReadinessFieldSpec = {
  field: string;
  label: string;
  parseType: ClarificationParseType;
  question: string;
  present: (snapshot: AttachmentStatementSnapshot | null, overrides: Record<string, unknown>) => boolean;
};

type ParsedClarificationAnswer = {
  inputOverrides: Record<string, unknown>;
  matchedFields: string[];
};

type ScalarField = 'companyName' | 'baseRevenue' | 'revenue' | 'ebitMargin' | 'grossMargin' | 'opexPctRevenue' | 'cash' | 'debt' | 'sharesOutstanding' | 'ebitda';

const MODEL_FIELD_ORDER: Record<AttachmentDrivenModelType, ReadinessFieldSpec[]> = {
  DCF: [
    {
      field: 'companyName',
      label: 'company identity',
      parseType: 'text',
      question: 'What company name should I use for this DCF?',
      present: (snapshot, overrides) => hasTextOverride(overrides.companyName) || hasTextValue(snapshot?.companyName) || hasTextValue(snapshot?.ticker),
    },
    {
      field: 'baseRevenue',
      label: 'base revenue',
      parseType: 'money',
      question: 'What base revenue should I use for this DCF?',
      present: (snapshot, overrides) => hasFiniteOverride(overrides.baseRevenue) || hasPositiveNumber(snapshot?.revenue),
    },
    {
      field: 'ebitMargin',
      label: 'EBIT / operating margin',
      parseType: 'percent',
      question: 'What EBIT or operating margin should I use for this DCF?',
      present: (snapshot, overrides) =>
        hasFiniteOverride(overrides.ebitMargin) ||
        hasPositiveNumber(snapshot?.operatingIncome) ||
        hasPositiveNumber(snapshot?.ebitda),
    },
    {
      field: 'cashOrDebt',
      label: 'cash or debt anchor',
      parseType: 'money',
      question: 'What cash balance or total debt should I use for this DCF?',
      present: (snapshot, overrides) =>
        hasFiniteOverride(overrides.cash) ||
        hasFiniteOverride(overrides.debt) ||
        typeof snapshot?.cash === 'number' ||
        typeof snapshot?.totalDebt === 'number',
    },
    {
      field: 'sharesOutstanding',
      label: 'shares outstanding',
      parseType: 'number',
      question: 'What diluted shares outstanding should I use for the per-share output?',
      present: (snapshot, overrides) => hasFiniteOverride(overrides.sharesOutstanding) || hasPositiveNumber(snapshot?.sharesOutstanding),
    },
  ],
  THREE_STATEMENT: [
    {
      field: 'companyName',
      label: 'company identity',
      parseType: 'text',
      question: 'What company name should I use for this three-statement model?',
      present: (snapshot, overrides) => hasTextOverride(overrides.companyName) || hasTextValue(snapshot?.companyName) || hasTextValue(snapshot?.ticker),
    },
    {
      field: 'baseRevenue',
      label: 'base revenue',
      parseType: 'money',
      question: 'What base revenue should I use for this forecast model?',
      present: (snapshot, overrides) => hasFiniteOverride(overrides.baseRevenue) || hasPositiveNumber(snapshot?.revenue),
    },
    {
      field: 'grossMargin',
      label: 'gross margin',
      parseType: 'percent',
      question: 'What gross margin should I use for this forecast model?',
      present: (snapshot, overrides) =>
        hasFiniteOverride(overrides.grossMargin) ||
        (hasPositiveNumber(snapshot?.grossProfit) && hasPositiveNumber(snapshot?.revenue)),
    },
    {
      field: 'opexPctRevenue',
      label: 'opex as % of revenue',
      parseType: 'percent',
      question: 'What operating expense as a percent of revenue should I use for this forecast model?',
      present: (snapshot, overrides) =>
        hasFiniteOverride(overrides.opexPctRevenue) ||
        (hasPositiveNumber(snapshot?.grossProfit) && typeof snapshot?.operatingIncome === 'number' && hasPositiveNumber(snapshot?.revenue)),
    },
    {
      field: 'cash',
      label: 'cash',
      parseType: 'money',
      question: 'What cash balance should I use for this forecast model?',
      present: (snapshot, overrides) => hasFiniteOverride(overrides.cash) || typeof snapshot?.cash === 'number',
    },
    {
      field: 'debt',
      label: 'debt',
      parseType: 'money',
      question: 'What debt balance should I use for this forecast model?',
      present: (snapshot, overrides) => hasFiniteOverride(overrides.debt) || typeof snapshot?.totalDebt === 'number',
    },
  ],
  COMPS: [
    {
      field: 'companyName',
      label: 'company identity',
      parseType: 'text',
      question: 'What company name should I use for this comps set?',
      present: (snapshot, overrides) => hasTextOverride(overrides.companyName) || hasTextValue(snapshot?.companyName) || hasTextValue(snapshot?.ticker),
    },
    {
      field: 'subjectRevenueOrEbitda',
      label: 'subject revenue or EBITDA',
      parseType: 'money',
      question: 'What subject revenue or EBITDA should I use for this comps analysis?',
      present: (snapshot, overrides) =>
        hasFiniteOverride(getNestedOverride(overrides, 'subject.revenue')) ||
        hasFiniteOverride(getNestedOverride(overrides, 'subject.ebitda')) ||
        typeof snapshot?.revenue === 'number' ||
        typeof snapshot?.ebitda === 'number',
    },
  ],
  LBO: [
    {
      field: 'companyName',
      label: 'company identity',
      parseType: 'text',
      question: 'What company name should I use for this LBO?',
      present: (snapshot, overrides) => hasTextOverride(overrides.companyName) || hasTextValue(snapshot?.companyName) || hasTextValue(snapshot?.ticker),
    },
    {
      field: 'revenue',
      label: 'revenue',
      parseType: 'money',
      question: 'What revenue should I use for this LBO?',
      present: (snapshot, overrides) => hasFiniteOverride(overrides.revenue) || hasPositiveNumber(snapshot?.revenue),
    },
    {
      field: 'ebitda',
      label: 'EBITDA',
      parseType: 'money',
      question: 'What EBITDA should I use for this LBO?',
      present: (snapshot, overrides) =>
        hasFiniteOverride(overrides.ebitda) ||
        hasPositiveNumber(snapshot?.ebitda) ||
        hasPositiveNumber(snapshot?.operatingIncome),
    },
    {
      field: 'cashOrDebt',
      label: 'cash or debt context',
      parseType: 'money',
      question: 'What cash balance or total debt should I use for this LBO?',
      present: (snapshot, overrides) =>
        hasFiniteOverride(overrides.cash) ||
        hasFiniteOverride(overrides.debt) ||
        typeof snapshot?.cash === 'number' ||
        typeof snapshot?.totalDebt === 'number',
    },
  ],
};

export function evaluateAttachmentModelReadiness(params: {
  modelType: AttachmentDrivenModelType;
  attachmentSnapshot?: AttachmentStatementSnapshot | null;
  inputOverrides?: Record<string, unknown>;
}): AttachmentModelReadiness {
  const snapshot = params.attachmentSnapshot ?? null;
  const overrides = params.inputOverrides ?? {};
  const specs = MODEL_FIELD_ORDER[params.modelType];
  const missing = specs.filter((spec) => !spec.present(snapshot, overrides));

  if (missing.length === 0) {
    return { ready: true, missingInputs: [] };
  }

  const current = missing[0];
  return {
    ready: false,
    missingInputs: missing.map((item) => item.label),
    clarificationField: current.field,
    clarificationFieldLabel: current.label,
    clarificationParseType: current.parseType,
    clarificationQuestion: current.question,
  };
}

export function parseAttachmentClarificationAnswer(params: {
  modelType: AttachmentDrivenModelType;
  answer: string;
  currentField?: string | null;
  inputOverrides?: Record<string, unknown>;
}): ParsedClarificationAnswer {
  const answer = params.answer.trim();
  if (!answer) {
    return { inputOverrides: params.inputOverrides ?? {}, matchedFields: [] };
  }

  const next = cloneOverrides(params.inputOverrides ?? {});
  const matchedFields = new Set<string>();
  const currentField = params.currentField ?? null;

  for (const spec of MODEL_FIELD_ORDER[params.modelType]) {
    const parsed = parseFieldValue(spec.field, answer, currentField === spec.field);
    if (!parsed) continue;
    applyClarificationOverride(next, spec.field, parsed);
    matchedFields.add(spec.field);
  }

  return {
    inputOverrides: next,
    matchedFields: Array.from(matchedFields),
  };
}

function parseFieldValue(field: string, answer: string, isCurrentField: boolean): unknown {
  switch (field) {
    case 'companyName':
      return parseTextAnswer(answer, isCurrentField);
    case 'baseRevenue':
    case 'revenue':
    case 'cash':
    case 'debt':
    case 'ebitda':
      return parseNumericAnswer(answer, fieldAlias(field), isCurrentField);
    case 'sharesOutstanding':
      return parseNumericAnswer(answer, ['shares', 'share count', 'shares outstanding', 'diluted shares'], isCurrentField);
    case 'ebitMargin':
      return parsePercentAnswer(answer, ['ebit margin', 'operating margin', 'ebit', 'operating'], isCurrentField);
    case 'grossMargin':
      return parsePercentAnswer(answer, ['gross margin', 'gross'], isCurrentField);
    case 'opexPctRevenue':
      return parsePercentAnswer(answer, ['opex', 'operating expense', 'operating expenses'], isCurrentField);
    case 'cashOrDebt': {
      const cash = parseNumericAnswer(answer, ['cash'], false);
      const debt = parseNumericAnswer(answer, ['debt', 'total debt'], false);
      if (cash !== undefined || debt !== undefined) {
        return { cash, debt };
      }
      if (isCurrentField) {
        const fallback = parseStandaloneNumber(answer, 'money');
        if (fallback !== undefined) return { cash: fallback };
      }
      return undefined;
    }
    case 'subjectRevenueOrEbitda': {
      const revenue = parseNumericAnswer(answer, ['revenue', 'sales'], false);
      const ebitda = parseNumericAnswer(answer, ['ebitda'], false);
      if (revenue !== undefined || ebitda !== undefined) {
        return { revenue, ebitda };
      }
      if (isCurrentField) {
        const fallback = parseStandaloneNumber(answer, 'money');
        if (fallback !== undefined) return { revenue: fallback };
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

function applyClarificationOverride(target: Record<string, unknown>, field: string, value: unknown) {
  switch (field) {
    case 'subjectRevenueOrEbitda': {
      const currentSubject =
        target.subject && typeof target.subject === 'object' && !Array.isArray(target.subject)
          ? { ...(target.subject as Record<string, unknown>) }
          : {};
      const row = value as { revenue?: number; ebitda?: number };
      if (typeof row.revenue === 'number') currentSubject.revenue = row.revenue;
      if (typeof row.ebitda === 'number') currentSubject.ebitda = row.ebitda;
      target.subject = currentSubject;
      return;
    }
    case 'cashOrDebt': {
      const row = value as { cash?: number; debt?: number };
      if (typeof row.cash === 'number') target.cash = row.cash;
      if (typeof row.debt === 'number') target.debt = row.debt;
      return;
    }
    default:
      target[field] = value;
  }
}

function parseTextAnswer(answer: string, isCurrentField: boolean): string | undefined {
  const directMatch =
    answer.match(/(?:company|name)\s*(?:is|should be|=|:)?\s*(.+)$/i)?.[1]?.trim() ??
    answer.match(/^use\s+(.+)$/i)?.[1]?.trim();
  if (directMatch) return directMatch.replace(/[.]+$/, '').trim();
  if (isCurrentField && answer.trim().length > 0) return answer.replace(/[.]+$/, '').trim();
  return undefined;
}

function parseNumericAnswer(answer: string, aliases: string[], isCurrentField: boolean): number | undefined {
  const labeled = parseLabeledNumber(answer, aliases);
  if (labeled !== undefined) return labeled;
  if (isCurrentField) return parseStandaloneNumber(answer, 'money');
  return undefined;
}

function parsePercentAnswer(answer: string, aliases: string[], isCurrentField: boolean): number | undefined {
  const labeled = parseLabeledNumber(answer, aliases, true);
  if (labeled !== undefined) return labeled;
  if (isCurrentField) return parseStandaloneNumber(answer, 'percent');
  return undefined;
}

function parseLabeledNumber(answer: string, aliases: string[], expectPercent = false): number | undefined {
  for (const alias of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const match = answer.match(new RegExp(`${escaped}\\s*(?:is|=|of|at|to|:)?\\s*([^,;\\n]+)`, 'i'));
    const parsed = match?.[1] ? parseStandaloneNumber(match[1], expectPercent ? 'percent' : 'money') : undefined;
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function parseStandaloneNumber(raw: string, type: 'money' | 'percent'): number | undefined {
  const compact = raw
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .replace(/\b(?:usd|dollars?|million|millions|billion|billions|thousand|thousands|shares?)\b/gi, (token) => {
      const lower = token.toLowerCase();
      if (lower.startsWith('million')) return 'm';
      if (lower.startsWith('billion')) return 'b';
      if (lower.startsWith('thousand')) return 'k';
      return '';
    })
    .trim();
  const basisPoints = compact.match(/^(-?\d*\.?\d+)\s*(?:bp|bps|basis points?)$/i);
  if (basisPoints) {
    const parsed = Number(basisPoints[1]);
    return Number.isFinite(parsed) ? parsed / 10000 : undefined;
  }

  const match = compact.match(/^(-?\d*\.?\d+)\s*([kmb])?\s*(%)?$/i);
  if (!match) return undefined;

  let value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;

  const suffix = match[2]?.toLowerCase();
  if (suffix === 'k') value *= 1e3;
  if (suffix === 'm') value *= 1e6;
  if (suffix === 'b') value *= 1e9;

  if (type === 'percent' || match[3]) {
    return value > 1 ? value / 100 : value;
  }

  return value;
}

function fieldAlias(field: ScalarField): string[] {
  switch (field) {
    case 'baseRevenue':
    case 'revenue':
      return ['revenue', 'sales', 'base revenue'];
    case 'cash':
      return ['cash'];
    case 'debt':
      return ['debt', 'total debt'];
    case 'ebitda':
      return ['ebitda'];
    default:
      return [field];
  }
}

function getNestedOverride(overrides: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[key];
  }, overrides);
}

function hasPositiveNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hasFiniteOverride(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasTextValue(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasTextOverride(value: unknown): boolean {
  return hasTextValue(value);
}

function cloneOverrides(input: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
}
