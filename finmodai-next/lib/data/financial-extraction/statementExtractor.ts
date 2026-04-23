import fs from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';
import {
  type PdfStatementPackage,
} from '@/lib/analyst/pdfFinancialStatements';
import { fetchSecEdgarAnnualFundamentals, fetchSecEdgarQuarterlyFundamentals } from '@/lib/data/providers/secEdgar';
import { extractPdfStatementPackageWithFallback } from '@/lib/data/financial-extraction/pdfStatementProcessing';
import { getSignedUrlForKey, isObjectStoreConfigured } from '@/lib/storage/objectStore';
import type { ResolvedCompanyProfile } from '@/lib/data/company/types';
import type {
  ExtractionSourceArtifact,
  FinancialExtractionJobRequest,
  FinancialFactScale,
  FinancialMetricKey,
  NormalizedFinancialFact,
  ResolvedCompanyIdentity,
} from '@/lib/data/financial-extraction/types';

function nowIso(): string {
  return new Date().toISOString();
}

function createFact(args: {
  metricKey: FinancialMetricKey;
  value: number | null | undefined;
  scale: FinancialFactScale;
  periodType: NonNullable<FinancialExtractionJobRequest['targetPeriodType']>;
  source: ExtractionSourceArtifact;
  confidence: number;
  asOfDate?: string | null;
  fiscalYear?: number | null;
  fiscalPeriod?: string | null;
  notes?: string | null;
  page?: number | null;
  sheetName?: string | null;
}): NormalizedFinancialFact | null {
  if (typeof args.value !== 'number' || !Number.isFinite(args.value)) return null;

  const unit =
    args.metricKey === 'shares_outstanding'
      ? 'shares'
      : args.metricKey === 'share_price'
        ? 'price'
        : 'currency';

  return {
    metricKey: args.metricKey,
    value: args.value,
    unit,
    scale: args.scale,
    periodType: args.periodType,
    fiscalYear: args.fiscalYear ?? null,
    fiscalPeriod: args.fiscalPeriod ?? null,
    asOfDate: args.asOfDate ?? null,
    sourceType: args.source.sourceType,
    sourceLabel: args.source.sourceLabel,
    sourceUrlOrFileId: args.source.sourceUrlOrFileId,
    confidence: args.confidence,
    notes: args.notes ?? null,
    page: args.page ?? null,
    sheetName: args.sheetName ?? null,
  };
}

function toActualFromMillions(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value * 1_000_000 : null;
}

function profileFacts(args: {
  request: FinancialExtractionJobRequest;
  identity: ResolvedCompanyIdentity;
  profile: ResolvedCompanyProfile;
  sourceArtifacts: ExtractionSourceArtifact[];
}): NormalizedFinancialFact[] {
  const effectivePeriod = args.request.targetPeriodType ?? 'ltm';
  const snapshotArtifact =
    args.sourceArtifacts.find((artifact) => artifact.sourceType === 'stored_company_snapshot' || artifact.sourceType === 'provider_snapshot') ??
    args.sourceArtifacts[0];
  if (!snapshotArtifact) return [];

  const snapshot = args.profile.snapshot;
  const facts: Array<NormalizedFinancialFact | null> = [];
  if (snapshot) {
    facts.push(
      createFact({
        metricKey: 'revenue',
        value: toActualFromMillions(snapshot.revenueLtm),
        scale: 'millions',
        periodType: effectivePeriod,
        source: snapshotArtifact,
        confidence: 0.95,
        asOfDate: snapshot.asOfDate,
      }),
      createFact({
        metricKey: 'gross_profit',
        value: toActualFromMillions(snapshot.grossProfitLtm),
        scale: 'millions',
        periodType: effectivePeriod,
        source: snapshotArtifact,
        confidence: 0.9,
        asOfDate: snapshot.asOfDate,
      }),
      createFact({
        metricKey: 'ebitda',
        value: toActualFromMillions(snapshot.ebitdaLtm),
        scale: 'millions',
        periodType: effectivePeriod,
        source: snapshotArtifact,
        confidence: 0.95,
        asOfDate: snapshot.asOfDate,
      }),
      createFact({
        metricKey: 'ebit',
        value: toActualFromMillions(snapshot.ebitLtm),
        scale: 'millions',
        periodType: effectivePeriod,
        source: snapshotArtifact,
        confidence: 0.95,
        asOfDate: snapshot.asOfDate,
      }),
      createFact({
        metricKey: 'cash',
        value: toActualFromMillions(snapshot.cash),
        scale: 'millions',
        periodType: effectivePeriod,
        source: snapshotArtifact,
        confidence: 0.95,
        asOfDate: snapshot.asOfDate,
      }),
      createFact({
        metricKey: 'total_debt',
        value: toActualFromMillions(snapshot.totalDebt),
        scale: 'millions',
        periodType: effectivePeriod,
        source: snapshotArtifact,
        confidence: 0.95,
        asOfDate: snapshot.asOfDate,
      }),
      createFact({
        metricKey: 'shares_outstanding',
        value: snapshot.sharesOutstanding,
        scale: 'actual',
        periodType: effectivePeriod,
        source: snapshotArtifact,
        confidence: 0.95,
        asOfDate: snapshot.asOfDate,
      }),
      createFact({
        metricKey: 'market_cap',
        value: toActualFromMillions(snapshot.marketCap),
        scale: 'millions',
        periodType: effectivePeriod,
        source: snapshotArtifact,
        confidence: 0.95,
        asOfDate: snapshot.asOfDate,
      }),
    );
  }

  const priceArtifact = args.sourceArtifacts.find((artifact) => artifact.sourceType === 'provider_snapshot') ?? snapshotArtifact;
  if (args.profile.latestPrice?.close) {
    facts.push(
      createFact({
        metricKey: 'share_price',
        value: args.profile.latestPrice.close,
        scale: 'actual',
        periodType: effectivePeriod,
        source: priceArtifact,
        confidence: 0.98,
        asOfDate: args.profile.latestPrice.date,
      }),
    );
  }

  return facts.filter((item): item is NormalizedFinancialFact => Boolean(item));
}

function secFactsFromAnnual(args: {
  result: Awaited<ReturnType<typeof fetchSecEdgarAnnualFundamentals>>;
  source: ExtractionSourceArtifact;
  periodType: NonNullable<FinancialExtractionJobRequest['targetPeriodType']>;
}): NormalizedFinancialFact[] {
  if (!args.result.ok) return [];
  const data = args.result.data;
  return [
    createFact({
      metricKey: 'revenue',
      value: data.revenueFY,
      scale: 'actual',
      periodType: args.periodType,
      source: args.source,
      confidence: 0.97,
      asOfDate: data.reportEndDate,
      fiscalYear: data.fiscalYear,
      fiscalPeriod: data.period,
    }),
    createFact({
      metricKey: 'gross_profit',
      value: data.grossProfitFY,
      scale: 'actual',
      periodType: args.periodType,
      source: args.source,
      confidence: 0.95,
      asOfDate: data.reportEndDate,
      fiscalYear: data.fiscalYear,
      fiscalPeriod: data.period,
    }),
    createFact({
      metricKey: 'ebitda',
      value: data.ebitdaFY,
      scale: 'actual',
      periodType: args.periodType,
      source: args.source,
      confidence: 0.95,
      asOfDate: data.reportEndDate,
      fiscalYear: data.fiscalYear,
      fiscalPeriod: data.period,
    }),
    createFact({
      metricKey: 'ebit',
      value: data.ebitFY,
      scale: 'actual',
      periodType: args.periodType,
      source: args.source,
      confidence: 0.97,
      asOfDate: data.reportEndDate,
      fiscalYear: data.fiscalYear,
      fiscalPeriod: data.period,
    }),
    createFact({
      metricKey: 'cash',
      value: data.cash,
      scale: 'actual',
      periodType: args.periodType,
      source: args.source,
      confidence: 0.95,
      asOfDate: data.reportEndDate,
      fiscalYear: data.fiscalYear,
      fiscalPeriod: data.period,
    }),
    createFact({
      metricKey: 'total_debt',
      value: data.totalDebt,
      scale: 'actual',
      periodType: args.periodType,
      source: args.source,
      confidence: 0.95,
      asOfDate: data.reportEndDate,
      fiscalYear: data.fiscalYear,
      fiscalPeriod: data.period,
    }),
  ].filter((item): item is NormalizedFinancialFact => Boolean(item));
}

function secFactsFromQuarterly(args: {
  result: Awaited<ReturnType<typeof fetchSecEdgarQuarterlyFundamentals>>;
  source: ExtractionSourceArtifact;
}): NormalizedFinancialFact[] {
  if (!args.result.ok) return [];
  const data = args.result.data;
  return [
    createFact({
      metricKey: 'revenue',
      value: data.revenueQ,
      scale: 'actual',
      periodType: 'quarterly',
      source: args.source,
      confidence: 0.97,
      asOfDate: data.reportEndDate,
      fiscalYear: data.fiscalYear,
      fiscalPeriod: data.period,
    }),
    createFact({
      metricKey: 'ebit',
      value: data.operatingIncomeQ,
      scale: 'actual',
      periodType: 'quarterly',
      source: args.source,
      confidence: 0.97,
      asOfDate: data.reportEndDate,
      fiscalYear: data.fiscalYear,
      fiscalPeriod: data.period,
    }),
  ].filter((item): item is NormalizedFinancialFact => Boolean(item));
}

async function readPrivateFileBuffer(fileId: string): Promise<Buffer> {
  if (path.isAbsolute(fileId)) {
    return fs.readFile(fileId);
  }

  try {
    return await fs.readFile(path.resolve(process.cwd(), fileId));
  } catch {
    if (!isObjectStoreConfigured()) {
      throw new Error(`Unable to read private extraction file: ${fileId}`);
    }
  }

  const signedUrl = await getSignedUrlForKey(fileId, 300);
  const response = await fetch(signedUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch object-store file ${fileId}: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function latestNumericValue(row: unknown[]): number | null {
  for (let index = row.length - 1; index >= 0; index -= 1) {
    const cell = row[index];
    if (typeof cell === 'number' && Number.isFinite(cell)) return cell;
    if (typeof cell === 'string') {
      const cleaned = cell.replace(/[$,]/g, '').trim();
      if (!cleaned) continue;
      const negative = /^\(.+\)$/.test(cleaned);
      const parsed = Number(cleaned.replace(/[()]/g, ''));
      if (Number.isFinite(parsed)) return negative ? -Math.abs(parsed) : parsed;
    }
  }
  return null;
}

function metricKeyFromLabel(label: string): FinancialMetricKey | null {
  const normalized = label.toLowerCase();
  if (/\b(total )?revenue|net sales|sales\b/.test(normalized)) return 'revenue';
  if (/\bgross profit\b/.test(normalized)) return 'gross_profit';
  if (/\bebitda\b/.test(normalized)) return 'ebitda';
  if (/\boperating income|ebit\b/.test(normalized)) return 'ebit';
  if (/\bcash and cash equivalents|cash\b/.test(normalized)) return 'cash';
  if (/\btotal debt|long term debt|short term debt|borrowings\b/.test(normalized)) return 'total_debt';
  if (/\bshares outstanding|diluted shares|weighted average shares\b/.test(normalized)) return 'shares_outstanding';
  if (/\bshare price\b/.test(normalized)) return 'share_price';
  if (/\bmarket cap|market capitalization\b/.test(normalized)) return 'market_cap';
  return null;
}

function spreadsheetFactsFromWorkbook(args: {
  buffer: Buffer;
  source: ExtractionSourceArtifact;
  periodType: NonNullable<FinancialExtractionJobRequest['targetPeriodType']>;
}): NormalizedFinancialFact[] {
  const workbook = XLSX.read(args.buffer, { type: 'buffer' });
  const facts: NormalizedFinancialFact[] = [];

  for (const sheetName of workbook.SheetNames.slice(0, 6)) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });
    for (const row of rows) {
      if (!Array.isArray(row) || row.length === 0) continue;
      const label = String(row[0] ?? '').trim();
      if (!label) continue;
      const metricKey = metricKeyFromLabel(label);
      if (!metricKey) continue;
      const value = latestNumericValue(row);
      const fact = createFact({
        metricKey,
        value,
        scale: metricKey === 'shares_outstanding' || metricKey === 'share_price' ? 'actual' : 'actual',
        periodType: args.periodType,
        source: args.source,
        confidence: 0.9,
        notes: 'Extracted from uploaded spreadsheet row.',
        sheetName,
      });
      if (fact) facts.push(fact);
    }
  }

  return facts;
}

function factsFromPdfPackage(args: {
  pkg: PdfStatementPackage;
  source: ExtractionSourceArtifact;
  extractionMethod?: 'pdf_text' | 'ocr' | 'none';
  ocrProvider?: string | null;
}): NormalizedFinancialFact[] {
  const snapshot = args.pkg.snapshot;
  if (!snapshot) return [];
  const periodType =
    snapshot.periodType === 'annual'
      ? 'annual'
      : snapshot.periodType === 'quarter'
        ? 'quarterly'
        : 'ltm';

  const factForLine = (metricKey: FinancialMetricKey, normalizedLabel: string, value: number | null | undefined) => {
    const line = [
      ...args.pkg.incomeStatement,
      ...args.pkg.balanceSheet,
      ...args.pkg.cashFlowStatement,
    ].find((item) => item.normalizedLabel === normalizedLabel);
    return createFact({
      metricKey,
      value,
      scale: metricKey === 'shares_outstanding' ? 'actual' : snapshot.units === 'thousands' ? 'thousands' : snapshot.units === 'millions' ? 'millions' : 'actual',
      periodType,
      source: args.source,
      confidence:
        (args.pkg.confidence === 'high' ? 0.9 : args.pkg.confidence === 'medium' ? 0.75 : 0.55) -
        (args.extractionMethod === 'ocr' ? 0.15 : 0),
      asOfDate: snapshot.reportEndDate,
      fiscalPeriod: snapshot.fiscalPeriod,
      notes:
        [
          snapshot.annualizedFromQuarter ? 'Quarterly PDF value annualized from statement package.' : null,
          args.extractionMethod === 'ocr'
            ? `OCR-backed PDF extraction${args.ocrProvider ? ` via ${args.ocrProvider}` : ''}.`
            : null,
        ]
          .filter(Boolean)
          .join(' ') || null,
      page: line?.page ?? null,
    });
  };

  return [
    factForLine('revenue', 'revenue', snapshot.revenue),
    factForLine('gross_profit', 'gross_profit', snapshot.grossProfit),
    factForLine('ebitda', 'ebitda', snapshot.ebitda),
    factForLine('ebit', 'operating_income', snapshot.operatingIncome),
    factForLine('cash', 'cash', snapshot.cash),
    factForLine('total_debt', 'total_debt', snapshot.totalDebt),
    factForLine('shares_outstanding', 'shares_outstanding', snapshot.sharesOutstanding),
  ].filter((item): item is NormalizedFinancialFact => Boolean(item));
}

export async function extractFinancialFacts(params: {
  request: FinancialExtractionJobRequest;
  identity: ResolvedCompanyIdentity;
  profile: ResolvedCompanyProfile | null;
  sourceArtifacts: ExtractionSourceArtifact[];
}): Promise<NormalizedFinancialFact[]> {
  if (params.request.lane === 'public') {
    if (!params.profile) return [];
    const periodType = params.request.targetPeriodType ?? 'ltm';
    const facts = profileFacts({
      request: params.request,
      identity: params.identity,
      profile: params.profile,
      sourceArtifacts: params.sourceArtifacts,
    });

    const secArtifact = params.sourceArtifacts.find((artifact) => artifact.sourceType === 'sec_companyfacts');
    if (params.identity.ticker && secArtifact && periodType !== 'ltm') {
      if (periodType === 'annual') {
        const secAnnual = await fetchSecEdgarAnnualFundamentals(params.identity.ticker);
        facts.push(...secFactsFromAnnual({ result: secAnnual, source: secArtifact, periodType }));
      } else if (periodType === 'quarterly') {
        const secQuarterly = await fetchSecEdgarQuarterlyFundamentals(params.identity.ticker);
        facts.push(...secFactsFromQuarterly({ result: secQuarterly, source: secArtifact }));
      }
    }

    return facts;
  }

  const facts: NormalizedFinancialFact[] = [];
  const periodType = params.request.targetPeriodType ?? 'annual';
  for (const source of params.sourceArtifacts) {
    const buffer = await readPrivateFileBuffer(source.sourceUrlOrFileId);
    const lower = source.sourceUrlOrFileId.toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
      facts.push(...spreadsheetFactsFromWorkbook({ buffer, source, periodType }));
      continue;
    }

    if (lower.endsWith('.pdf')) {
      const pdfResult = await extractPdfStatementPackageWithFallback({
        buffer,
        fileId: source.sourceUrlOrFileId,
      });
      if (pdfResult.statementPackage) {
        facts.push(
          ...factsFromPdfPackage({
            pkg: pdfResult.statementPackage,
            source,
            extractionMethod: pdfResult.extractionMethod,
            ocrProvider: pdfResult.ocrProvider,
          }),
        );
      }
    }
  }

  return facts;
}
