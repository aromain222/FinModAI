import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { PDFParse } from 'pdf-parse';
import { buildClientVisibleBackendError, responseBodyLooksLikeHtml } from '@/lib/analyst/clientErrorResponse';
import { extractPdfStatementPackage } from '@/lib/analyst/pdfFinancialStatements';
import { assessPdfModelCoverage, assessPdfStatementExtraction } from '@/lib/analyst/pdfModelSeeding';
import { ensurePdfRuntimeGlobals, extractPdfTextServer } from '@/lib/analyst/serverPdfExtraction';
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

const APPLE_STYLE_SHARE_UNITS_TEXT = `
Apple Inc.
Condensed Consolidated Statements of Operations
(In millions, except number of shares, which are reflected in thousands, and per-share amounts)
Three Months Ended December 27, 2025
Net sales 124,300 119,575
Operating income 42,832 39,449
Net income 36,330 33,916
Shares used in computing earnings per share:
Basic 14,748,158 15,081,724
Diluted 14,810,356 15,150,865

Condensed Consolidated Balance Sheets
Cash and cash equivalents 45,317 29,943
Commercial paper 10,000 10,998
Term debt 86,000 98,959

Condensed Consolidated Statements of Cash Flows
Payments for acquisition of property, plant and equipment (2,907) (2,465)
Depreciation and amortization 3,211 2,929
`;

const APPLE_PDF_PATH = '/Users/averyromain/Downloads/FY26_Q1_Consolidated_Financial_Statements (1).pdf';

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

test('extractPdfStatementPackage keeps statement values in millions while applying share-specific thousands exceptions', () => {
  const parsed = extractPdfStatementPackage(APPLE_STYLE_SHARE_UNITS_TEXT);

  assert.ok(parsed, 'expected statement package');
  assert.equal(parsed?.units, 'millions');
  assert.equal(parsed?.snapshot?.sharesOutstanding, 14_810_356_000);
  assert.equal(parsed?.snapshot?.revenue, 497_200_000_000);
  assert.equal(parsed?.snapshot?.cash, 45_317_000_000);
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

test('server-side extractor and statement parser handle the Apple quarterly financial PDF', async () => {
  if (!fs.existsSync(APPLE_PDF_PATH)) {
    assert.fail(`Expected Apple PDF fixture at ${APPLE_PDF_PATH}`);
  }

  const buffer = fs.readFileSync(APPLE_PDF_PATH);
  const extraction = await extractPdfTextServer(buffer);
  assert.equal(extraction.stage, 'text_extracted');
  assert.ok(extraction.text, 'expected extracted text');

  const parsed = extractPdfStatementPackage(extraction.text ?? '');
  assert.ok(parsed, 'expected trusted statement package');
  assert.equal(parsed?.companyName, 'Apple Inc.');
  assert.equal(parsed?.units, 'millions');
  assert.equal(parsed?.periodType, 'quarter');
  assert.ok(typeof parsed?.snapshot?.revenue === 'number' && parsed.snapshot.revenue > 0);
  assert.ok(typeof parsed?.snapshot?.operatingIncome === 'number' && parsed.snapshot.operatingIncome > 0);
  assert.ok(typeof parsed?.snapshot?.netIncome === 'number' && parsed.snapshot.netIncome > 0);
  assert.ok(typeof parsed?.snapshot?.cash === 'number' && parsed.snapshot.cash > 0);
  assert.ok(typeof parsed?.snapshot?.sharesOutstanding === 'number' && parsed.snapshot.sharesOutstanding > 10_000_000_000);

  const trust = assessPdfStatementExtraction({
    statementPackage: parsed,
    authoritative: true,
  });
  assert.equal(trust.statementExtractionStatus, 'trusted');
  assert.equal(trust.isFinancialModelSeedable, true);

  const dcfCoverage = assessPdfModelCoverage('DCF', parsed);
  assert.equal(dcfCoverage.ok, true);
});

test('pdf-parse class path returns clean text for the Apple quarterly financial PDF', async () => {
  if (!fs.existsSync(APPLE_PDF_PATH)) {
    assert.fail(`Expected Apple PDF fixture at ${APPLE_PDF_PATH}`);
  }

  const data = fs.readFileSync(APPLE_PDF_PATH);
  const parser = new PDFParse({ data });
  const parsed = await parser.getText();
  await parser.destroy();
  assert.match(parsed.text ?? '', /Apple Inc\./);
  assert.match(parsed.text ?? '', /Cash and cash equivalents/);
  assert.match(parsed.text ?? '', /Operating income/);
});

test('extractPdfTextServer returns dependency_failed when pdf-parse cannot load', async () => {
  const extraction = await extractPdfTextServer(Buffer.from('fake pdf'), {
    loadPdfParse: async () => {
      throw new Error('Cannot find package pdf-parse');
    },
  });

  assert.equal(extraction.stage, 'dependency_failed');
  assert.equal(extraction.text, null);
  assert.match(extraction.warnings.join(' '), /Cannot find package pdf-parse/);
});

test('extractPdfTextServer returns runtime_bootstrap_failed when pdf worker helper cannot load', async () => {
  const extraction = await extractPdfTextServer(Buffer.from('fake pdf'), {
    loadPdfParse: async () => ({
      PDFParse: class {
        static setWorker() {
          return '';
        }
        async getText() {
          assert.fail('parser should not run when worker bootstrap fails');
          return { text: '' };
        }
        destroy() {
          return undefined;
        }
      },
    }),
    loadPdfParseWorker: async () => {
      throw new Error('Cannot find module pdf-parse/worker');
    },
  });

  assert.equal(extraction.stage, 'runtime_bootstrap_failed');
  assert.equal(extraction.text, null);
  assert.match(extraction.warnings.join(' '), /PDF worker bootstrap failed: Cannot find module pdf-parse\/worker/);
});

test('ensurePdfRuntimeGlobals injects missing PDF.js globals from canvas runtime', async () => {
  const originalDomMatrix = globalThis.DOMMatrix;
  const originalImageData = globalThis.ImageData;
  const originalPath2D = globalThis.Path2D;

  try {
    delete (globalThis as Record<string, unknown>).DOMMatrix;
    delete (globalThis as Record<string, unknown>).ImageData;
    delete (globalThis as Record<string, unknown>).Path2D;

    class FakeDOMMatrix {}
    class FakeImageData {}
    class FakePath2D {}

    const injected = await ensurePdfRuntimeGlobals({
      loadCanvasRuntime: async () => ({
        DOMMatrix: FakeDOMMatrix as unknown as typeof globalThis.DOMMatrix,
        ImageData: FakeImageData as unknown as typeof globalThis.ImageData,
        Path2D: FakePath2D as unknown as typeof globalThis.Path2D,
      }),
    });

    assert.deepEqual(injected, ['DOMMatrix', 'ImageData', 'Path2D']);
    assert.equal(globalThis.DOMMatrix, FakeDOMMatrix as unknown as typeof globalThis.DOMMatrix);
    assert.equal(globalThis.ImageData, FakeImageData as unknown as typeof globalThis.ImageData);
    assert.equal(globalThis.Path2D, FakePath2D as unknown as typeof globalThis.Path2D);
  } finally {
    if (typeof originalDomMatrix === 'undefined') {
      delete (globalThis as Record<string, unknown>).DOMMatrix;
    } else {
      globalThis.DOMMatrix = originalDomMatrix;
    }
    if (typeof originalImageData === 'undefined') {
      delete (globalThis as Record<string, unknown>).ImageData;
    } else {
      globalThis.ImageData = originalImageData;
    }
    if (typeof originalPath2D === 'undefined') {
      delete (globalThis as Record<string, unknown>).Path2D;
    } else {
      globalThis.Path2D = originalPath2D;
    }
  }
});

test('extractPdfTextServer returns runtime_bootstrap_failed when canvas globals cannot be installed', async () => {
  const originalDomMatrix = globalThis.DOMMatrix;
  const originalImageData = globalThis.ImageData;
  const originalPath2D = globalThis.Path2D;

  try {
    delete (globalThis as Record<string, unknown>).DOMMatrix;
    delete (globalThis as Record<string, unknown>).ImageData;
    delete (globalThis as Record<string, unknown>).Path2D;

    const extraction = await extractPdfTextServer(Buffer.from('fake pdf'), {
      loadCanvasRuntime: async () => {
        throw new Error('DOMMatrix is not defined');
      },
      loadPdfParse: async () => {
        assert.fail('pdf-parse should not load when runtime bootstrap fails first');
      },
    });

    assert.equal(extraction.stage, 'runtime_bootstrap_failed');
    assert.equal(extraction.text, null);
    assert.match(extraction.warnings.join(' '), /DOMMatrix is not defined/);
  } finally {
    if (typeof originalDomMatrix === 'undefined') {
      delete (globalThis as Record<string, unknown>).DOMMatrix;
    } else {
      globalThis.DOMMatrix = originalDomMatrix;
    }
    if (typeof originalImageData === 'undefined') {
      delete (globalThis as Record<string, unknown>).ImageData;
    } else {
      globalThis.ImageData = originalImageData;
    }
    if (typeof originalPath2D === 'undefined') {
      delete (globalThis as Record<string, unknown>).Path2D;
    } else {
      globalThis.Path2D = originalPath2D;
    }
  }
});

test('extractPdfTextServer bootstraps runtime globals before constructing PDFParse', async () => {
  const originalDomMatrix = globalThis.DOMMatrix;
  const originalImageData = globalThis.ImageData;
  const originalPath2D = globalThis.Path2D;

  try {
    delete (globalThis as Record<string, unknown>).DOMMatrix;
    delete (globalThis as Record<string, unknown>).ImageData;
    delete (globalThis as Record<string, unknown>).Path2D;

    class FakeDOMMatrix {}
    class FakeImageData {}
    class FakePath2D {}
    let sawGlobalsAtConstruction = false;
    let workerPayloadSeen: string | null = null;

    const extraction = await extractPdfTextServer(Buffer.from('fake pdf'), {
      loadCanvasRuntime: async () => ({
        DOMMatrix: FakeDOMMatrix as unknown as typeof globalThis.DOMMatrix,
        ImageData: FakeImageData as unknown as typeof globalThis.ImageData,
        Path2D: FakePath2D as unknown as typeof globalThis.Path2D,
      }),
      loadPdfParse: async () => ({
        PDFParse: class {
          static setWorker(workerSrc?: string) {
            workerPayloadSeen = workerSrc ?? null;
            return workerSrc ?? '';
          }
          constructor() {
            sawGlobalsAtConstruction =
              globalThis.DOMMatrix === (FakeDOMMatrix as unknown as typeof globalThis.DOMMatrix) &&
              globalThis.ImageData === (FakeImageData as unknown as typeof globalThis.ImageData) &&
              globalThis.Path2D === (FakePath2D as unknown as typeof globalThis.Path2D);
          }
          async getText() {
            return { text: SAMPLE_FINANCIAL_PDF_TEXT };
          }
          destroy() {
            return undefined;
          }
        },
      }),
      loadPdfParseWorker: async () => ({
        getData: () => 'data:text/javascript;base64,ZmFrZQ==',
      }),
    });

    assert.equal(sawGlobalsAtConstruction, true);
    assert.equal(workerPayloadSeen, 'data:text/javascript;base64,ZmFrZQ==');
    assert.equal(extraction.stage, 'text_extracted');
    assert.deepEqual(extraction.runtimeBootstrap?.injectedGlobals ?? [], ['DOMMatrix', 'ImageData', 'Path2D']);
    assert.match(extraction.text ?? '', /Microsoft Corporation/);
  } finally {
    if (typeof originalDomMatrix === 'undefined') {
      delete (globalThis as Record<string, unknown>).DOMMatrix;
    } else {
      globalThis.DOMMatrix = originalDomMatrix;
    }
    if (typeof originalImageData === 'undefined') {
      delete (globalThis as Record<string, unknown>).ImageData;
    } else {
      globalThis.ImageData = originalImageData;
    }
    if (typeof originalPath2D === 'undefined') {
      delete (globalThis as Record<string, unknown>).Path2D;
    } else {
      globalThis.Path2D = originalPath2D;
    }
  }
});

test('client-visible backend error handling suppresses raw html 500 pages', () => {
  const html = '<!DOCTYPE html><html><head><title>500</title></head><body>Internal Server Error</body></html>';
  assert.equal(responseBodyLooksLikeHtml(html), true);
  assert.equal(
    buildClientVisibleBackendError({
      rawBody: html,
      payload: null,
      fallbackStatusText: 'Analyst Chat request failed (500).',
    }),
    'The server returned an unexpected internal error page before Analyst Chat could produce a structured response.',
  );
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
