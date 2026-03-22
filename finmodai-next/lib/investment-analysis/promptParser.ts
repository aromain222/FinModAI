import { extractCompanyQuery } from '@/lib/data/company/extractCompanyQuery';
import { classifyPrompt, type ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';

export type InvestmentPromptAnalysisType =
  | ModelGeneratorType
  | 'INVESTMENT_MEMO'
  | 'COMPANY_ANALYSIS'
  | null;

export type ParsedPromptTimeHorizon = {
  value: number;
  unit: 'years' | 'months' | 'quarters';
  rawText: string;
};

export type ParsedPromptEventContext = {
  rawPrompt: string;
  normalizedPrompt: string;
  companyName?: string;
  ticker?: string;
  sector?: string | null;
  analysisType: InvestmentPromptAnalysisType;
  eventContextText?: string | null;
  timeHorizon?: ParsedPromptTimeHorizon | null;
};

const SECTOR_PATTERNS: Array<{ sector: string; pattern: RegExp }> = [
  { sector: 'Defense Tech', pattern: /\bdefen[cs]e\s+tech\b/i },
  { sector: 'Semiconductors', pattern: /\bsemiconductor|chip(s)?\b/i },
  { sector: 'Software', pattern: /\bsoftware\b|\bsaas\b|\bcloud\b/i },
  { sector: 'Fintech', pattern: /\bfintech\b|\bpayments\b|\bbanking\b/i },
  { sector: 'Energy', pattern: /\benergy\b|\boil\b|\bgas\b/i },
  { sector: 'Healthcare', pattern: /\bhealthcare\b|\bbiotech\b|\bmedtech\b/i },
  { sector: 'Consumer', pattern: /\bconsumer\b|\bretail\b|\be-?commerce\b/i },
  { sector: 'Industrial', pattern: /\bindustrial\b|\bmanufacturing\b|\blogistics\b/i },
];

const EVENT_PATTERNS: RegExp[] = [
  /\bceo\b.*?\b(step(?:ping)? down|retir(?:e|es|ing)|resign(?:s|ed|ing)|leave(?:s|ing)?)\b/i,
  /\bwar\b.*?(?:for\s+the\s+next\s+\d+\s+years?|for\s+\d+\s+years?)?/i,
  /\bconflict\b.*?(?:for\s+the\s+next\s+\d+\s+years?|for\s+\d+\s+years?)?/i,
  /\bhigher\s+for\s+longer\b/i,
  /\btariff(?:s)?\b.*?(?:up|increase|higher)?/i,
  /\boil\b.*?\b(spike|shock|higher)\b/i,
  /\bregulat(?:ion|ory)\b.*?(?:change|pressure|crackdown)?/i,
];

const EVENT_CUE_PATTERNS: RegExp[] = [
  /\bknowing\s+(.+)$/i,
  /\bassuming\s+(.+)$/i,
  /\bgiven\s+(.+)$/i,
  /\bamid\s+(.+)$/i,
  /\bwith\s+(.+)$/i,
];

const EVENT_SIGNAL_PATTERN =
  /\b(ceo|step(?:ping)? down|retir(?:e|es|ing)|resign(?:s|ed|ing)|war|conflict|tariff|oil|shock|rates?|higher for longer|regulat(?:ion|ory)|crackdown|sanction|geopolitical)\b/i;

function normalizePrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, ' ');
}

function detectSector(prompt: string): string | null {
  for (const candidate of SECTOR_PATTERNS) {
    if (candidate.pattern.test(prompt)) return candidate.sector;
  }
  return null;
}

function inferAnalysisType(prompt: string): InvestmentPromptAnalysisType {
  const structuredModelType = classifyPrompt(prompt);
  if (structuredModelType) return structuredModelType;

  const text = prompt.toLowerCase();
  if (/\binvestment memo\b|\bwrite .*memo\b|\bmemo\b/.test(text)) return 'INVESTMENT_MEMO';
  if (/\banaly[sz]e\b|\binvestment\b|\bcompany analysis\b/.test(text)) return 'COMPANY_ANALYSIS';

  return null;
}

function parseTimeHorizon(prompt: string): ParsedPromptTimeHorizon | null {
  const match =
    prompt.match(/\bfor\s+the\s+next\s+(\d+)\s+(years?|months?|quarters?)\b/i) ||
    prompt.match(/\bfor\s+(\d+)\s+(years?|months?|quarters?)\b/i) ||
    prompt.match(/\bover\s+(\d+)\s+(years?|months?|quarters?)\b/i);

  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  const rawUnit = match[2].toLowerCase();
  const unit =
    rawUnit.startsWith('year') ? 'years' : rawUnit.startsWith('month') ? 'months' : 'quarters';

  return {
    value,
    unit,
    rawText: match[0],
  };
}

function hasEventSignal(text: string): boolean {
  return EVENT_SIGNAL_PATTERN.test(text);
}

function extractEventContextText(prompt: string): string | null {
  for (const pattern of EVENT_PATTERNS) {
    const match = prompt.match(pattern);
    if (match?.[0]) return match[0].trim();
  }

  for (const cuePattern of EVENT_CUE_PATTERNS) {
    const match = prompt.match(cuePattern);
    const candidate = match?.[1]?.trim();
    if (candidate && candidate.length > 6 && hasEventSignal(candidate)) {
      return candidate.replace(/[.]+$/, '');
    }
  }

  return null;
}

export function parseInvestmentPromptContext(prompt: string): ParsedPromptEventContext {
  const normalizedPrompt = normalizePrompt(prompt);
  const companyQuery = extractCompanyQuery({ prompt: normalizedPrompt });

  return {
    rawPrompt: prompt,
    normalizedPrompt,
    companyName: companyQuery.companyName,
    ticker: companyQuery.ticker,
    sector: detectSector(normalizedPrompt),
    analysisType: inferAnalysisType(normalizedPrompt),
    eventContextText: extractEventContextText(normalizedPrompt),
    timeHorizon: parseTimeHorizon(normalizedPrompt),
  };
}
