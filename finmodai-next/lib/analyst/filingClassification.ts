import type { AttachmentKind, AttachmentSignals } from '@/lib/analyst/attachmentContext';
import type { PdfStatementPackage } from '@/lib/analyst/pdfFinancialStatements';

export type RawFilingType =
  | '10-Q'
  | '10-K'
  | '8-K'
  | 'S-1'
  | 'S-4'
  | 'DEF 14A'
  | 'earnings_release'
  | 'transcript'
  | 'supplemental_deck'
  | 'shareholder_letter'
  | 'investor_presentation'
  | 'credit_agreement'
  | 'debt_offering'
  | 'refinancing'
  | 'merger_announcement'
  | 'other_document';

export type FamiliarFilingCategory =
  | 'Earnings'
  | 'Financial Statements'
  | 'Capitalization'
  | 'Debt/Credit'
  | 'M&A';

export type FilingClassification = {
  rawFilingType: RawFilingType | null;
  familiarCategory: FamiliarFilingCategory | null;
  packetFamily: FamiliarFilingCategory | null;
  periodKey: string | null;
  companyKey: string | null;
  confidence: 'low' | 'medium' | 'high';
  warnings: string[];
};

export type FilingPacketMember = {
  label: string;
  rawFilingType: RawFilingType | null;
  primary: boolean;
  kind: AttachmentKind;
};

export type FilingPacket = {
  packetKey: string | null;
  family: FamiliarFilingCategory | null;
  label: string | null;
  companyKey: string | null;
  periodKey: string | null;
  rawFilingTypes: RawFilingType[];
  filings: FilingPacketMember[];
  provenanceSources: string[];
};

function normalizeCompanyKey(signals?: AttachmentSignals, statementPackage?: PdfStatementPackage): string | null {
  const ticker = signals?.ticker ?? statementPackage?.ticker ?? null;
  if (ticker && ticker.trim()) return ticker.trim().toUpperCase();
  const companyName = signals?.companyName ?? statementPackage?.companyName ?? null;
  if (!companyName?.trim()) return null;
  return companyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || null;
}

function normalizePeriodKey(signals?: AttachmentSignals, statementPackage?: PdfStatementPackage): string | null {
  const raw = signals?.fiscalPeriod ?? statementPackage?.fiscalPeriod ?? statementPackage?.reportEndDate ?? null;
  if (!raw?.trim()) return null;
  return raw.trim().toUpperCase().replace(/\s+/g, '_');
}

function detectRawFilingType(params: {
  name: string;
  mimeType: string;
  summary: string;
  rawText?: string;
  kind: AttachmentKind;
}): { rawFilingType: RawFilingType | null; confidence: 'low' | 'medium' | 'high' } | null {
  const haystack = `${params.name}\n${params.mimeType}\n${params.summary}\n${params.rawText ?? ''}`.toLowerCase();
  const byPattern = (pattern: RegExp, type: RawFilingType, confidence: 'low' | 'medium' | 'high' = 'high') =>
    pattern.test(haystack) ? { rawFilingType: type, confidence } : null;

  return (
    byPattern(/\b10[-\s]?q\b/, '10-Q') ||
    byPattern(/\b10[-\s]?k\b/, '10-K') ||
    byPattern(/\b8[-\s]?k\b/, '8-K') ||
    byPattern(/\bs[-\s]?1\b/, 'S-1') ||
    byPattern(/\bs[-\s]?4\b/, 'S-4') ||
    byPattern(/\bdef\s*14a\b|\bproxy\b/, 'DEF 14A', 'medium') ||
    byPattern(/\bearnings release\b|\bresults release\b/, 'earnings_release', 'medium') ||
    byPattern(/\btranscript\b|\bprepared remarks\b|\bconference call\b/, 'transcript', 'medium') ||
    byPattern(/\bsupplemental\b|\bdeck\b/, 'supplemental_deck', 'medium') ||
    byPattern(/\bshareholder letter\b/, 'shareholder_letter', 'medium') ||
    byPattern(/\binvestor presentation\b|\bpresentation\b/, 'investor_presentation', 'low') ||
    byPattern(/\bcredit agreement\b|\bterm loan\b|\brevolver\b/, 'credit_agreement', 'medium') ||
    byPattern(/\bnotes offering\b|\bsenior notes\b|\bdebt offering\b/, 'debt_offering', 'medium') ||
    byPattern(/\brefinanc(?:ing|e)\b/, 'refinancing', 'medium') ||
    byPattern(/\bmerger\b|\bacquisition\b|\bdeal announcement\b/, 'merger_announcement', 'medium') ||
    (params.kind === 'earnings_report' ? { rawFilingType: 'earnings_release', confidence: 'low' } : null) ||
    null
  );
}

function inferFamiliarCategory(rawFilingType: RawFilingType | null, text: string, statementPackage?: PdfStatementPackage): FamiliarFilingCategory | null {
  const haystack = text.toLowerCase();
  const earningsSignals = /\bearnings|results|guidance|quarter|quarterly|transcript|prepared remarks|shareholder letter\b/.test(haystack);
  const debtSignals = /\bdebt|credit|term loan|revolver|refinanc|notes offering|covenant\b/.test(haystack);
  const maSignals = /\bmerger|acquisition|acquir(?:e|ing)|target|deal\b/.test(haystack);
  const equitySignals = /\bs-1\b|\bipo\b|\boffering\b|\bconvertible\b|\bpreferred\b|\bshare issuance\b|\bcapital raise\b/.test(haystack);
  const annualStatements = statementPackage?.periodType === 'annual' || /\bannual report\b/.test(haystack);

  switch (rawFilingType) {
    case '10-Q':
    case 'earnings_release':
    case 'transcript':
    case 'supplemental_deck':
    case 'shareholder_letter':
      return 'Earnings';
    case '10-K':
      return 'Financial Statements';
    case 'credit_agreement':
    case 'debt_offering':
    case 'refinancing':
      return 'Debt/Credit';
    case 'S-1':
      return 'Capitalization';
    case 'S-4':
      return maSignals ? 'M&A' : 'Capitalization';
    case 'DEF 14A':
      return maSignals ? 'M&A' : null;
    case 'merger_announcement':
      return 'M&A';
    case '8-K':
      if (maSignals) return 'M&A';
      if (debtSignals) return 'Debt/Credit';
      if (earningsSignals) return 'Earnings';
      if (equitySignals) return 'Capitalization';
      return null;
    case 'investor_presentation':
      if (maSignals) return 'M&A';
      if (earningsSignals) return 'Earnings';
      if (debtSignals) return 'Debt/Credit';
      if (equitySignals) return 'Capitalization';
      return null;
    default:
      if (annualStatements) return 'Financial Statements';
      if (earningsSignals) return 'Earnings';
      if (debtSignals) return 'Debt/Credit';
      if (maSignals) return 'M&A';
      if (equitySignals) return 'Capitalization';
      return null;
  }
}

export function classifyAttachmentFiling(params: {
  name: string;
  mimeType: string;
  summary: string;
  rawText?: string;
  kind: AttachmentKind;
  signals?: AttachmentSignals;
  statementPackage?: PdfStatementPackage;
}): FilingClassification {
  const detection = detectRawFilingType(params);
  const classificationText = `${params.name}\n${params.summary}\n${params.rawText ?? ''}`;
  const familiarCategory = inferFamiliarCategory(detection?.rawFilingType ?? null, classificationText, params.statementPackage);
  const warnings: string[] = [];
  if (!detection?.rawFilingType) warnings.push('Raw filing type could not be determined from the attachment text.');
  if (!familiarCategory) warnings.push('This filing did not map cleanly into a v1 familiar finance packet.');

  return {
    rawFilingType: detection?.rawFilingType ?? null,
    familiarCategory,
    packetFamily: familiarCategory,
    periodKey: normalizePeriodKey(params.signals, params.statementPackage),
    companyKey: normalizeCompanyKey(params.signals, params.statementPackage),
    confidence: detection?.confidence ?? (familiarCategory ? 'medium' : 'low'),
    warnings,
  };
}

export function buildFilingPacket(params: {
  attachmentName: string;
  kind: AttachmentKind;
  classification: FilingClassification;
  signals?: AttachmentSignals;
  statementPackage?: PdfStatementPackage;
}): FilingPacket | undefined {
  if (!params.classification.packetFamily) return undefined;
  const companyLabel =
    params.signals?.companyName ??
    params.statementPackage?.companyName ??
    params.signals?.ticker ??
    params.attachmentName;
  const periodLabel = params.signals?.fiscalPeriod ?? params.statementPackage?.fiscalPeriod ?? params.statementPackage?.reportEndDate ?? null;
  const family = params.classification.packetFamily;
  const packetKey =
    params.classification.companyKey && params.classification.periodKey
      ? `${params.classification.companyKey}::${params.classification.periodKey}::${family.replace(/[^A-Za-z0-9]+/g, '_')}`
      : null;

  return {
    packetKey,
    family,
    label: [companyLabel, periodLabel, `${family} packet`].filter(Boolean).join(' '),
    companyKey: params.classification.companyKey,
    periodKey: params.classification.periodKey,
    rawFilingTypes: params.classification.rawFilingType ? [params.classification.rawFilingType] : [],
    filings: [
      {
        label: params.classification.rawFilingType ?? params.kind,
        rawFilingType: params.classification.rawFilingType,
        primary: true,
        kind: params.kind,
      },
    ],
    provenanceSources: [params.attachmentName],
  };
}
