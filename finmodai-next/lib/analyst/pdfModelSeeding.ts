import type { ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';
import type { PdfStatementPackage } from '@/lib/analyst/pdfFinancialStatements';

export type StatementExtractionStatus = 'trusted' | 'low_confidence' | 'unsupported' | 'failed';

export type PdfStatementExtractionAssessment = {
  statementExtractionStatus: StatementExtractionStatus;
  statementExtractionWarnings: string[];
  isFinancialModelSeedable: boolean;
};

export type PdfModelSeedabilityAssessment = {
  ok: boolean;
  missing: string[];
};

export function isPdfAttachment(params: { mimeType: string; name: string }): boolean {
  return params.mimeType === 'application/pdf' || /\.pdf$/i.test(params.name);
}

export function assessPdfStatementExtraction(params: {
  statementPackage?: PdfStatementPackage | null;
  failureMode?: 'unsupported' | 'failed' | null;
  authoritative?: boolean;
}): PdfStatementExtractionAssessment {
  if (params.failureMode === 'unsupported') {
    return {
      statementExtractionStatus: 'unsupported',
      statementExtractionWarnings: ['This PDF did not expose a readable text layer for statement extraction.'],
      isFinancialModelSeedable: false,
    };
  }

  if (params.failureMode === 'failed') {
    return {
      statementExtractionStatus: 'failed',
      statementExtractionWarnings: ['Server-side PDF extraction failed before a trusted statement package could be built.'],
      isFinancialModelSeedable: false,
    };
  }

  const statementPackage = params.statementPackage ?? null;
  if (!statementPackage?.snapshot) {
    return {
      statementExtractionStatus: 'low_confidence',
      statementExtractionWarnings: ['The PDF did not produce a structured statement package suitable for model seeding.'],
      isFinancialModelSeedable: false,
    };
  }

  const warnings = [...statementPackage.warnings];
  const trustBlocked =
    statementPackage.confidence === 'low' ||
    statementPackage.periodType === 'unknown' ||
    statementPackage.missingStatements.length >= 2;

  if (!params.authoritative) {
    return {
      statementExtractionStatus: trustBlocked ? 'low_confidence' : 'low_confidence',
      statementExtractionWarnings: [
        ...warnings,
        'Waiting for server-side PDF extraction before this file can seed a model.',
      ],
      isFinancialModelSeedable: false,
    };
  }

  return {
    statementExtractionStatus: trustBlocked ? 'low_confidence' : 'trusted',
    statementExtractionWarnings: warnings,
    isFinancialModelSeedable: !trustBlocked,
  };
}

export function assessPdfModelCoverage(
  modelType: Extract<ModelGeneratorType, 'DCF' | 'THREE_STATEMENT' | 'COMPS' | 'LBO'>,
  statementPackage?: PdfStatementPackage | null,
): PdfModelSeedabilityAssessment {
  const snapshot = statementPackage?.snapshot ?? null;
  if (!snapshot || !statementPackage) {
    return {
      ok: false,
      missing: ['trusted statement package'],
    };
  }

  switch (modelType) {
    case 'DCF': {
      const missing = [
        typeof snapshot.revenue === 'number' && snapshot.revenue > 0 ? null : 'revenue',
        typeof snapshot.operatingIncome === 'number' || typeof snapshot.ebitda === 'number'
          ? null
          : 'profitability anchor',
        typeof snapshot.cash === 'number' || typeof snapshot.totalDebt === 'number'
          ? null
          : 'cash or debt anchor',
      ].filter((value): value is string => Boolean(value));
      return { ok: missing.length === 0, missing };
    }
    case 'THREE_STATEMENT': {
      const missing = [
        typeof snapshot.revenue === 'number' && snapshot.revenue > 0 ? null : 'revenue',
        statementPackage.incomeStatement.length > 0 ? null : 'income statement lines',
        statementPackage.balanceSheet.length > 0 ? null : 'balance sheet lines',
        statementPackage.cashFlowStatement.length > 0 ? null : 'cash flow statement lines',
      ].filter((value): value is string => Boolean(value));
      return { ok: missing.length === 0, missing };
    }
    case 'COMPS': {
      const missing = [
        snapshot.companyName || snapshot.ticker ? null : 'company identity',
        typeof snapshot.revenue === 'number' || typeof snapshot.ebitda === 'number'
          ? null
          : 'revenue or EBITDA',
      ].filter((value): value is string => Boolean(value));
      return { ok: missing.length === 0, missing };
    }
    case 'LBO': {
      const missing = [
        typeof snapshot.revenue === 'number' && snapshot.revenue > 0 ? null : 'revenue',
        typeof snapshot.ebitda === 'number' || typeof snapshot.operatingIncome === 'number'
          ? null
          : 'EBITDA or operating income',
        typeof snapshot.cash === 'number' || typeof snapshot.totalDebt === 'number'
          ? null
          : 'cash or debt context',
      ].filter((value): value is string => Boolean(value));
      return { ok: missing.length === 0, missing };
    }
  }
}
