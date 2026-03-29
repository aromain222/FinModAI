import assert from 'node:assert/strict';
import test from 'node:test';

import { extractPdfStatementPackage } from '@/lib/analyst/pdfFinancialStatements';
import { assessPdfModelCoverage, assessPdfStatementExtraction } from '@/lib/analyst/pdfModelSeeding';
import { extractInputs } from '@/lib/model-generator/extractInputs';

const SAMPLE_FINANCIAL_PDF_TEXT = `
Microsoft Corporation (MSFT)
Condensed Consolidated Statements of Income
(In millions, except per share amounts)
Three Months Ended 2025-12-31
Revenue 70,000 62,000
Gross profit 48,000 42,000
Operating income 32,000 27,000
Net income 25,000 21,000
Diluted weighted average shares outstanding 7,400 7,450

Condensed Consolidated Balance Sheets
Cash and cash equivalents 30,000 28,000
Short-term debt 3,000 2,500
Long-term debt 12,000 12,500

Condensed Consolidated Statements of Cash Flows
Capital expenditures (6,000) (5,500)
Depreciation and amortization 4,000 3,600
`;

test('extractPdfStatementPackage parses structured statements from text-based financial PDFs', () => {
  const parsed = extractPdfStatementPackage(SAMPLE_FINANCIAL_PDF_TEXT);

  assert.ok(parsed, 'expected statement package');
  assert.equal(parsed?.ticker, 'MSFT');
  assert.equal(parsed?.units, 'millions');
  assert.equal(parsed?.periodType, 'quarter');
  assert.equal(parsed?.snapshot?.annualizedFromQuarter, true);
  assert.equal(parsed?.snapshot?.revenue, 280_000_000_000);
  assert.equal(parsed?.snapshot?.operatingIncome, 128_000_000_000);
  assert.equal(parsed?.snapshot?.cash, 30_000_000_000);
  assert.equal(parsed?.snapshot?.totalDebt, 15_000_000_000);
  assert.equal(parsed?.snapshot?.capex, 24_000_000_000);
});

test('financial PDF extraction only becomes seedable after trusted server-side extraction', () => {
  const parsed = extractPdfStatementPackage(SAMPLE_FINANCIAL_PDF_TEXT);
  assert.ok(parsed, 'expected statement package');

  const clientAssessment = assessPdfStatementExtraction({
    statementPackage: parsed,
    authoritative: false,
  });
  assert.equal(clientAssessment.statementExtractionStatus, 'low_confidence');
  assert.equal(clientAssessment.isFinancialModelSeedable, false);

  const serverAssessment = assessPdfStatementExtraction({
    statementPackage: parsed,
    authoritative: true,
  });
  assert.equal(serverAssessment.statementExtractionStatus, 'trusted');
  assert.equal(serverAssessment.isFinancialModelSeedable, true);

  const unsupportedAssessment = assessPdfStatementExtraction({
    failureMode: 'unsupported',
    authoritative: true,
  });
  assert.equal(unsupportedAssessment.statementExtractionStatus, 'unsupported');
  assert.equal(unsupportedAssessment.isFinancialModelSeedable, false);

  const failedAssessment = assessPdfStatementExtraction({
    failureMode: 'failed',
    authoritative: true,
  });
  assert.equal(failedAssessment.statementExtractionStatus, 'failed');
  assert.equal(failedAssessment.isFinancialModelSeedable, false);
});

test('trusted financial PDFs must satisfy minimum field coverage for each model type', () => {
  const parsed = extractPdfStatementPackage(SAMPLE_FINANCIAL_PDF_TEXT);
  assert.ok(parsed, 'expected statement package');

  assert.equal(assessPdfModelCoverage('DCF', parsed).ok, true);
  assert.equal(assessPdfModelCoverage('THREE_STATEMENT', parsed).ok, true);
  assert.equal(assessPdfModelCoverage('COMPS', parsed).ok, true);
  assert.equal(assessPdfModelCoverage('LBO', parsed).ok, true);

  const sparse = extractPdfStatementPackage(`
Microsoft Corporation (MSFT)
Condensed Consolidated Statements of Income
(In millions)
Three Months Ended 2025-12-31
Revenue 70,000
`);
  assert.equal(sparse, null);
  const sparseCoverage = assessPdfModelCoverage('DCF', sparse);
  assert.equal(sparseCoverage.ok, false);
  assert.deepEqual(sparseCoverage.missing, ['trusted statement package']);
});

test('extractInputs uses attachment statement snapshots ahead of defaults for DCF and three-statement models', async () => {
  const parsed = extractPdfStatementPackage(SAMPLE_FINANCIAL_PDF_TEXT);
  assert.ok(parsed?.snapshot, 'expected attachment snapshot');

  const dcf = await extractInputs('Build a DCF from this PDF for Microsoft', 'DCF', {
    attachmentStatementSnapshot: parsed?.snapshot ?? null,
  });
  assert.equal(dcf.extractedInputs.modelType, 'DCF');
  if (dcf.extractedInputs.modelType !== 'DCF') return;
  assert.equal(dcf.extractedInputs.source, 'attachment_pdf_statement');
  assert.equal(dcf.extractedInputs.baseRevenue, 280_000_000_000);
  assert.equal(dcf.extractedInputs.cash, 30_000_000_000);
  assert.equal(dcf.extractedInputs.debt, 15_000_000_000);
  assert.equal(dcf.extractedInputs.sharesOutstanding, 7_400_000_000);

  const threeStatement = await extractInputs('Build a three statement model from this PDF for Microsoft', 'THREE_STATEMENT', {
    attachmentStatementSnapshot: parsed?.snapshot ?? null,
  });
  assert.equal(threeStatement.extractedInputs.modelType, 'THREE_STATEMENT');
  if (threeStatement.extractedInputs.modelType !== 'THREE_STATEMENT') return;
  assert.equal(threeStatement.extractedInputs.source, 'attachment_pdf_statement');
  assert.equal(threeStatement.extractedInputs.baseRevenue, 280_000_000_000);
  assert.equal(threeStatement.extractedInputs.capexPctRevenue, 24_000_000_000 / 280_000_000_000);
  assert.equal(threeStatement.extractedInputs.daPctRevenue, 16_000_000_000 / 280_000_000_000);
});

test('extractInputs uses attachment subject financials for comps and LBO', async () => {
  const parsed = extractPdfStatementPackage(SAMPLE_FINANCIAL_PDF_TEXT);
  assert.ok(parsed?.snapshot, 'expected attachment snapshot');

  const comps = await extractInputs('Run comps on this company using the attached PDF', 'COMPS', {
    attachmentStatementSnapshot: parsed?.snapshot ?? null,
  });
  assert.equal(comps.extractedInputs.modelType, 'COMPS');
  if (comps.extractedInputs.modelType !== 'COMPS') return;
  assert.equal(comps.extractedInputs.source, 'attachment_pdf_statement');
  assert.equal(comps.extractedInputs.subject.revenue, 280_000_000_000);
  assert.equal(comps.extractedInputs.subject.ebitda, 144_000_000_000);

  const lbo = await extractInputs('Build an LBO for this company from the attached PDF', 'LBO', {
    attachmentStatementSnapshot: parsed?.snapshot ?? null,
  });
  assert.equal(lbo.extractedInputs.modelType, 'LBO');
  if (lbo.extractedInputs.modelType !== 'LBO') return;
  assert.equal(lbo.extractedInputs.source, 'attachment_pdf_statement');
  assert.equal(lbo.extractedInputs.revenue, 280_000_000_000);
  assert.equal(lbo.extractedInputs.ebitda, 144_000_000_000);
  assert.equal(lbo.extractedInputs.netDebt, -15_000_000_000);
});
