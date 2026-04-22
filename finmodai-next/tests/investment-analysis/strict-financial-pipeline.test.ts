import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { NextRequest } from 'next/server';
import { POST as strictPipelinePost } from '@/app/api/financial-pipeline/strict/route';
import { strictFinancialPipelineDeps } from '@/lib/data/financial-extraction/strict/deps';
import { runStrictFinancialPipeline } from '@/lib/data/financial-extraction/strict/orchestrator';

test('SOURCE_FETCHER fails when SEC and FMP produce no usable artifacts', async () => {
  const resolveMock = mock.method(strictFinancialPipelineDeps, 'resolvePublicCompany', async () => ({
    identity: {
      companyName: 'Acme Corp',
      ticker: 'ACME',
      cik: '0000000001',
      lane: 'public',
      source: 'catalog',
      resolvedFrom: ['ticker'],
    },
    profile: null,
  }));
  const secMock = mock.method(strictFinancialPipelineDeps, 'fetchSecCompanyFactsRaw', async () => ({
    ok: false as const,
    error: 'sec down',
  }));
  const fmpMock = mock.method(strictFinancialPipelineDeps, 'fetchFmpRawBundle', async () => ({
    ok: false as const,
    error: 'fmp down',
  }));

  try {
    const result = await runStrictFinancialPipeline({
      ticker: 'ACME',
      company_identifier: null,
      period_type: 'annual',
      target_model_type: 'scorecard',
      explicit_assumptions: { wacc: null, terminal_growth: null, tax_rate: null },
    });
    assert.equal(result.status, 'FAILURE');
    if (result.status === 'FAILURE') {
      assert.equal(result.step, 'SOURCE_FETCHER');
    }
  } finally {
    resolveMock.mock.restore();
    secMock.mock.restore();
    fmpMock.mock.restore();
  }
});

test('EXTRACTOR emits null observations when a metric is absent', async () => {
  const resolveMock = mock.method(strictFinancialPipelineDeps, 'resolvePublicCompany', async () => ({
    identity: {
      companyName: 'Acme Corp',
      ticker: 'ACME',
      cik: '0000000001',
      lane: 'public',
      source: 'catalog',
      resolvedFrom: ['ticker'],
    },
    profile: null,
  }));
  const secMock = mock.method(strictFinancialPipelineDeps, 'fetchSecCompanyFactsRaw', async () => ({
    ok: true as const,
    cik: '0000000001',
    sourceUrl: 'https://sec.example/companyfacts',
    data: {
      facts: {
        'us-gaap': {
          Revenues: { units: { USD: [{ val: 100, fp: 'FY', end: '2025-12-31' }] } },
        },
      },
    },
  }));
  const fmpMock = mock.method(strictFinancialPipelineDeps, 'fetchFmpRawBundle', async () => ({
    ok: false as const,
    error: 'skip fmp',
  }));

  try {
    const result = await runStrictFinancialPipeline({
      ticker: 'ACME',
      company_identifier: null,
      period_type: 'annual',
      target_model_type: 'scorecard',
      explicit_assumptions: { wacc: null, terminal_growth: null, tax_rate: null },
    });
    assert.equal(result.status, 'FAILURE');
    if (result.status === 'FAILURE') {
      assert.equal(result.step, 'VALIDATOR');
      assert.ok(result.missing_fields.includes('ebitda'));
    }
  } finally {
    resolveMock.mock.restore();
    secMock.mock.restore();
    fmpMock.mock.restore();
  }
});

test('VALIDATOR fails when two explicit source values differ', async () => {
  const resolveMock = mock.method(strictFinancialPipelineDeps, 'resolvePublicCompany', async () => ({
    identity: {
      companyName: 'Acme Corp',
      ticker: 'ACME',
      cik: '0000000001',
      lane: 'public',
      source: 'catalog',
      resolvedFrom: ['ticker'],
    },
    profile: null,
  }));
  const secMock = mock.method(strictFinancialPipelineDeps, 'fetchSecCompanyFactsRaw', async () => ({
    ok: true as const,
    cik: '0000000001',
    sourceUrl: 'https://sec.example/companyfacts',
    data: {
      facts: {
        'us-gaap': {
          Revenues: { units: { USD: [{ val: 100, fp: 'FY', end: '2025-12-31' }] } },
          NetIncomeLoss: { units: { USD: [{ val: 20, fp: 'FY', end: '2025-12-31' }] } },
          CashAndCashEquivalentsAtCarryingValue: { units: { USD: [{ val: 50, fp: 'FY', end: '2025-12-31' }] } },
          Debt: { units: { USD: [{ val: 30, fp: 'FY', end: '2025-12-31' }] } },
          EarningsBeforeInterestTaxesDepreciationAndAmortization: { units: { USD: [{ val: 40, fp: 'FY', end: '2025-12-31' }] } },
        },
      },
    },
  }));
  const fmpMock = mock.method(strictFinancialPipelineDeps, 'fetchFmpRawBundle', async () => ({
    ok: true as const,
    urls: {
      income: 'https://fmp.example/income',
      cashFlow: 'https://fmp.example/cashflow',
      balance: 'https://fmp.example/balance',
    },
    data: {
      income: [{ revenue: 101, ebitda: 40, netIncome: 20, date: '2025-12-31' }],
      cashFlow: [{ freeCashFlow: null, date: '2025-12-31' }],
      balance: [{ totalDebt: 30, cashAndCashEquivalents: 50, date: '2025-12-31' }],
    },
  }));

  try {
    const result = await runStrictFinancialPipeline({
      ticker: 'ACME',
      company_identifier: null,
      period_type: 'annual',
      target_model_type: 'scorecard',
      explicit_assumptions: { wacc: null, terminal_growth: null, tax_rate: null },
    });
    assert.equal(result.status, 'FAILURE');
    if (result.status === 'FAILURE') {
      assert.equal(result.step, 'VALIDATOR');
      assert.equal(result.conflicts[0]?.metric, 'revenue');
    }
  } finally {
    resolveMock.mock.restore();
    secMock.mock.restore();
    fmpMock.mock.restore();
  }
});

test('VALIDATOR passes when one source is null and the other is explicit', async () => {
  const resolveMock = mock.method(strictFinancialPipelineDeps, 'resolvePublicCompany', async () => ({
    identity: {
      companyName: 'Acme Corp',
      ticker: 'ACME',
      cik: '0000000001',
      lane: 'public',
      source: 'catalog',
      resolvedFrom: ['ticker'],
    },
    profile: null,
  }));
  const secMock = mock.method(strictFinancialPipelineDeps, 'fetchSecCompanyFactsRaw', async () => ({
    ok: true as const,
    cik: '0000000001',
    sourceUrl: 'https://sec.example/companyfacts',
    data: {
      facts: {
        'us-gaap': {
          Revenues: { units: { USD: [{ val: 100, fp: 'FY', end: '2025-12-31' }] } },
          NetIncomeLoss: { units: { USD: [{ val: 20, fp: 'FY', end: '2025-12-31' }] } },
          CashAndCashEquivalentsAtCarryingValue: { units: { USD: [{ val: 50, fp: 'FY', end: '2025-12-31' }] } },
          Debt: { units: { USD: [{ val: 30, fp: 'FY', end: '2025-12-31' }] } },
          EarningsBeforeInterestTaxesDepreciationAndAmortization: { units: { USD: [{ val: 40, fp: 'FY', end: '2025-12-31' }] } },
        },
      },
    },
  }));
  const fmpMock = mock.method(strictFinancialPipelineDeps, 'fetchFmpRawBundle', async () => ({
    ok: true as const,
    urls: {
      income: 'https://fmp.example/income',
      cashFlow: 'https://fmp.example/cashflow',
      balance: 'https://fmp.example/balance',
    },
    data: {
      income: [{ revenue: null, ebitda: 40, netIncome: 20, date: '2025-12-31' }],
      cashFlow: [{ freeCashFlow: null, date: '2025-12-31' }],
      balance: [{ totalDebt: 30, cashAndCashEquivalents: 50, date: '2025-12-31' }],
    },
  }));

  try {
    const result = await runStrictFinancialPipeline({
      ticker: 'ACME',
      company_identifier: null,
      period_type: 'annual',
      target_model_type: 'scorecard',
      explicit_assumptions: { wacc: null, terminal_growth: null, tax_rate: null },
    });
    assert.equal(result.status, 'SUCCESS');
  } finally {
    resolveMock.mock.restore();
    secMock.mock.restore();
    fmpMock.mock.restore();
  }
});

test('MODEL_BUILDER fails when requested model needs unsupported fields', async () => {
  const resolveMock = mock.method(strictFinancialPipelineDeps, 'resolvePublicCompany', async () => ({
    identity: {
      companyName: 'Acme Corp',
      ticker: 'ACME',
      cik: '0000000001',
      lane: 'public',
      source: 'catalog',
      resolvedFrom: ['ticker'],
    },
    profile: null,
  }));
  const secMock = mock.method(strictFinancialPipelineDeps, 'fetchSecCompanyFactsRaw', async () => ({
    ok: true as const,
    cik: '0000000001',
    sourceUrl: 'https://sec.example/companyfacts',
    data: {
      facts: {
        'us-gaap': {
          Revenues: { units: { USD: [{ val: 100, fp: 'FY', end: '2025-12-31' }] } },
          NetIncomeLoss: { units: { USD: [{ val: 20, fp: 'FY', end: '2025-12-31' }] } },
          CashAndCashEquivalentsAtCarryingValue: { units: { USD: [{ val: 50, fp: 'FY', end: '2025-12-31' }] } },
          Debt: { units: { USD: [{ val: 30, fp: 'FY', end: '2025-12-31' }] } },
          EarningsBeforeInterestTaxesDepreciationAndAmortization: { units: { USD: [{ val: 40, fp: 'FY', end: '2025-12-31' }] } },
        },
      },
    },
  }));
  const fmpMock = mock.method(strictFinancialPipelineDeps, 'fetchFmpRawBundle', async () => ({
    ok: false as const,
    error: 'skip fmp',
  }));

  try {
    const result = await runStrictFinancialPipeline({
      ticker: 'ACME',
      company_identifier: null,
      period_type: 'annual',
      target_model_type: 'dcf',
      explicit_assumptions: { wacc: 0.1, terminal_growth: 0.03, tax_rate: 0.21 },
    });
    assert.equal(result.status, 'FAILURE');
    if (result.status === 'FAILURE') {
      assert.equal(result.step, 'MODEL_BUILDER');
      assert.ok(result.missing_fields.includes('capex_pct_revenue'));
    }
  } finally {
    resolveMock.mock.restore();
    secMock.mock.restore();
    fmpMock.mock.restore();
  }
});

test('MODEL_BUILDER succeeds with sourced validated inputs only', async () => {
  const resolveMock = mock.method(strictFinancialPipelineDeps, 'resolvePublicCompany', async () => ({
    identity: {
      companyName: 'Acme Corp',
      ticker: 'ACME',
      cik: '0000000001',
      lane: 'public',
      source: 'catalog',
      resolvedFrom: ['ticker'],
    },
    profile: null,
  }));
  const secMock = mock.method(strictFinancialPipelineDeps, 'fetchSecCompanyFactsRaw', async () => ({
    ok: true as const,
    cik: '0000000001',
    sourceUrl: 'https://sec.example/companyfacts',
    data: {
      facts: {
        'us-gaap': {
          Revenues: { units: { USD: [{ val: 100, fp: 'FY', end: '2025-12-31' }] } },
          NetIncomeLoss: { units: { USD: [{ val: 20, fp: 'FY', end: '2025-12-31' }] } },
          CashAndCashEquivalentsAtCarryingValue: { units: { USD: [{ val: 50, fp: 'FY', end: '2025-12-31' }] } },
          Debt: { units: { USD: [{ val: 30, fp: 'FY', end: '2025-12-31' }] } },
          EarningsBeforeInterestTaxesDepreciationAndAmortization: { units: { USD: [{ val: 40, fp: 'FY', end: '2025-12-31' }] } },
        },
      },
    },
  }));
  const fmpMock = mock.method(strictFinancialPipelineDeps, 'fetchFmpRawBundle', async () => ({
    ok: false as const,
    error: 'skip fmp',
  }));

  try {
    const result = await runStrictFinancialPipeline({
      ticker: 'ACME',
      company_identifier: null,
      period_type: 'annual',
      target_model_type: 'scorecard',
      explicit_assumptions: { wacc: null, terminal_growth: null, tax_rate: null },
    });
    assert.equal(result.status, 'SUCCESS');
    if (result.status === 'SUCCESS') {
      assert.equal(result.steps.MODEL_BUILDER.model_inputs.revenue?.value, 100);
      assert.equal(
        result.steps.MODEL_BUILDER.model_inputs.total_debt?.source[0],
        'sec_edgar:0000000001',
      );
    }
  } finally {
    resolveMock.mock.restore();
    secMock.mock.restore();
    fmpMock.mock.restore();
  }
});

test('strict pipeline route returns failure schema on malformed request', async () => {
  const response = await strictPipelinePost(
    new NextRequest('http://localhost/api/financial-pipeline/strict', {
      method: 'POST',
      body: JSON.stringify({ period_type: 'annual' }),
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  const body = await response.json();
  assert.equal(body.status, 'FAILURE');
  assert.equal(body.step, 'SOURCE_FETCHER');
});
