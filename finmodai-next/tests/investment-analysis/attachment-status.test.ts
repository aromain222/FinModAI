import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAttachmentStatus } from '@/lib/analyst/attachmentStatus';
import type { UploadedAttachmentContext } from '@/lib/analyst/attachmentContext';

function baseAttachment(): UploadedAttachmentContext {
  return {
    name: 'FY26_Q1_Consolidated_Financial_Statements.pdf',
    mimeType: 'application/pdf',
    sizeKb: 1000,
    kind: 'document',
    summary: 'Attachment summary',
    warnings: [],
    statementExtractionStatus: 'low_confidence',
    isFinancialModelSeedable: false,
    statementExtractionWarnings: ['PDF text extracted but package is partial.'],
    signals: {
      companyName: 'Apple Inc.',
      ticker: 'AAPL',
      fiscalPeriod: 'Q1 FY26',
      keyLines: [],
    },
    filingClassification: {
      rawFilingType: '10-Q',
      familiarCategory: 'Earnings',
      packetFamily: 'Earnings',
      periodKey: 'Q1_FY26',
      companyKey: 'AAPL',
      confidence: 'high',
      warnings: [],
    },
    filingPacket: {
      packetKey: 'AAPL::Q1_FY26::Earnings',
      family: 'Earnings',
      label: 'Apple Inc. Q1 FY26 Earnings packet',
      companyKey: 'AAPL',
      periodKey: 'Q1_FY26',
      rawFilingTypes: ['10-Q'],
      filings: [
        {
          label: '10-Q',
          rawFilingType: '10-Q',
          primary: true,
          kind: 'document',
        },
      ],
      provenanceSources: ['FY26_Q1_Consolidated_Financial_Statements.pdf'],
    },
  };
}

test('buildAttachmentStatus maps trusted package to read_success', () => {
  const attachment = baseAttachment();
  attachment.statementExtractionStatus = 'trusted';
  attachment.isFinancialModelSeedable = true;
  attachment.statementPackage = {
    companyName: 'Apple Inc.',
    ticker: 'AAPL',
    fiscalPeriod: 'Q1 FY26',
    reportEndDate: '2025-12-27',
    currency: 'USD',
    units: 'millions',
    periodType: 'quarter',
    confidence: 'high',
    incomeStatement: [{ label: 'Revenue', value: 143_756, normalizedLabel: 'revenue', statement: 'income_statement', rawValue: '143,756', page: 1, lineNumber: 10, rawLine: 'Revenue 143,756' }],
    balanceSheet: [{ label: 'Cash', value: 45_317, normalizedLabel: 'cash', statement: 'balance_sheet', rawValue: '45,317', page: 2, lineNumber: 8, rawLine: 'Cash 45,317' }],
    cashFlowStatement: [{ label: 'Capex', value: -2_250, normalizedLabel: 'capex', statement: 'cash_flow_statement', rawValue: '(2,250)', page: 3, lineNumber: 7, rawLine: 'Capex (2,250)' }],
    missingStatements: [],
    warnings: [],
    snapshot: {
      source: 'attachment_pdf_statement',
      companyName: 'Apple Inc.',
      ticker: 'AAPL',
      fiscalPeriod: 'Q1 FY26',
      reportEndDate: '2025-12-27',
      periodType: 'quarter',
      currency: 'USD',
      units: 'millions',
      annualizedFromQuarter: true,
      revenue: 143_756,
      grossProfit: 69_231,
      operatingIncome: 50_852,
      ebitda: null,
      netIncome: 42_097,
      cash: 45_317,
      totalDebt: null,
      sharesOutstanding: null,
      capex: -2_250,
      depreciationAndAmortization: null,
      warnings: [],
    },
  };

  const status = buildAttachmentStatus({
    attachment,
    attachmentInputProvided: true,
    isPdf: true,
  });

  assert.ok(status);
  assert.equal(status.readStatus, 'read_success');
  assert.equal(status.hasStatementPackage, true);
  assert.equal(status.isFinancialModelSeedable, true);
  assert.equal(status.statementCoverage.incomeStatement, true);
  assert.equal(status.statementCoverage.balanceSheet, true);
  assert.equal(status.statementCoverage.cashFlowStatement, true);
  assert.equal(status.extractedIdentity.ticker, 'AAPL');
  assert.equal(status.filingView.rawFilingType, '10-Q');
  assert.equal(status.filingView.familiarCategory, 'Earnings');
  assert.equal(status.packetView?.label, 'Apple Inc. Q1 FY26 Earnings packet');
});

test('buildAttachmentStatus maps failed extraction to read_failed', () => {
  const attachment = baseAttachment();
  attachment.statementExtractionStatus = 'failed';
  attachment.statementExtractionWarnings = ['PDF text extraction failed: DOMMatrix is not defined'];

  const status = buildAttachmentStatus({
    attachment,
    attachmentInputProvided: true,
    isPdf: true,
  });

  assert.ok(status);
  assert.equal(status.readStatus, 'read_failed');
  assert.equal(status.hasStatementPackage, false);
  assert.equal(status.warnings[0], 'PDF text extraction failed: DOMMatrix is not defined');
});

test('buildAttachmentStatus returns null for non-PDF context', () => {
  const status = buildAttachmentStatus({
    attachment: baseAttachment(),
    attachmentInputProvided: true,
    isPdf: false,
  });

  assert.equal(status, null);
});
