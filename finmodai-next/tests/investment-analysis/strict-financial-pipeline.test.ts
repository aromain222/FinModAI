import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { NextRequest } from 'next/server';

import { POST as strictPipelinePost } from '@/app/api/financial-pipeline/strict/route';
import { strictFinancialPipelineDeps } from '@/lib/data/financial-extraction/strict/deps';
import { runStrictExtractor } from '@/lib/data/financial-extraction/strict/extractor';
import { runStrictFinancialPipeline } from '@/lib/data/financial-extraction/strict/orchestrator';
import {
  executeSourceFetchPlan,
  strictSourceFetchExecutorDeps,
} from '@/lib/data/financial-extraction/strict/sourceFetchExecutor';
import type { StrictSourceDiscoveryPlan } from '@/lib/data/financial-extraction/strict/types';

function makeDiscoveryPlan(overrides: Partial<StrictSourceDiscoveryPlan> = {}): StrictSourceDiscoveryPlan {
  const candidateSources = overrides.candidate_sources ?? [
    {
      source_id: 'sec_companyfacts:0000320193',
      provider: 'sec_edgar',
      source_family: 'filing',
      source_url: 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json',
      requires_robots_check: false,
      rationale: 'Official SEC companyfacts endpoint.',
    },
  ];

  return {
    requested_subject: {
      ticker: 'AAPL',
      company_name: 'Apple Inc.',
    },
    requested_period: 'annual',
    candidate_sources: candidateSources,
    chosen_source_ids: overrides.chosen_source_ids ?? candidateSources.map((candidate) => candidate.source_id),
    chosen_sources: overrides.chosen_sources ?? candidateSources,
    metric_preferences: overrides.metric_preferences ?? {
      revenue: [candidateSources[0].source_id],
      ebitda: [candidateSources[0].source_id],
      net_income: [candidateSources[0].source_id],
      cash: [candidateSources[0].source_id],
      debt: [candidateSources[0].source_id],
      free_cash_flow: [candidateSources[0].source_id],
    },
    warnings: overrides.warnings ?? [],
    rationale: overrides.rationale ?? 'Official SEC sources selected.',
  };
}

function companyFactsPayload(overrides: Record<string, unknown> = {}) {
  return {
    facts: {
      'us-gaap': {
        Revenues: { units: { USD: [{ val: 100, fp: 'FY', end: '2025-09-28' }] } },
        EarningsBeforeInterestTaxesDepreciationAndAmortization: {
          units: { USD: [{ val: 40, fp: 'FY', end: '2025-09-28' }] },
        },
        NetIncomeLoss: { units: { USD: [{ val: 20, fp: 'FY', end: '2025-09-28' }] } },
        FreeCashFlow: { units: { USD: [{ val: 18, fp: 'FY', end: '2025-09-28' }] } },
        Debt: { units: { USD: [{ val: 30, fp: 'FY', end: '2025-09-28' }] } },
        CashAndCashEquivalentsAtCarryingValue: {
          units: { USD: [{ val: 50, fp: 'FY', end: '2025-09-28' }] },
        },
        ...overrides,
      },
    },
  };
}

test('SOURCE_DISCOVERY_AGENT fails closed when no acceptable official plan can be produced', async () => {
  const resolveMock = mock.method(strictFinancialPipelineDeps, 'resolvePublicCompany', async () => ({
    identity: {
      companyName: 'Apple Inc.',
      ticker: 'AAPL',
      cik: '0000320193',
      lane: 'public',
      source: 'catalog',
      resolvedFrom: ['ticker'],
    },
    profile: null,
  }));
  const discoveryMock = mock.method(strictFinancialPipelineDeps, 'runSourceDiscoveryAgent', async () => ({
    ok: false as const,
    reason: 'No acceptable official-source plan was available.',
  }));

  try {
    const result = await runStrictFinancialPipeline({
      ticker: 'AAPL',
      company_identifier: null,
      period_type: 'annual',
      target_model_type: 'scorecard',
      explicit_assumptions: { wacc: null, terminal_growth: null, tax_rate: null },
    });

    assert.equal(result.status, 'FAILURE');
    if (result.status === 'FAILURE') {
      assert.equal(result.step, 'SOURCE_DISCOVERY_AGENT');
      assert.match(result.reason, /official-source plan/i);
    }
  } finally {
    resolveMock.mock.restore();
    discoveryMock.mock.restore();
  }
});

test('SOURCE_FETCH_EXECUTOR records robots and terms metadata for non-SEC pages', async () => {
  const robotsMock = mock.method(strictSourceFetchExecutorDeps, 'fetchRobotsStatus', async () => ({
    robotsUrl: 'https://investors.example.com/robots.txt',
    allowed: true,
  }));
  const textMock = mock.method(strictSourceFetchExecutorDeps, 'fetchTextWithRetry', async () => ({
    ok: true as const,
    text: `
      <html>
        <body>
          <a href="/terms">Terms of Use</a>
          <table>
            <tr><td>Revenue</td><td>$123,456,789</td></tr>
          </table>
        </body>
      </html>
    `,
  }));

  try {
    const result = await executeSourceFetchPlan({
      plan: makeDiscoveryPlan({
        candidate_sources: [
          {
            source_id: 'company_ir_root:aapl',
            provider: 'company_ir',
            source_family: 'company_results',
            source_url: 'https://investors.example.com/results/q1',
            requires_robots_check: true,
            rationale: 'Official IR results page.',
          },
        ],
        chosen_sources: [
          {
            source_id: 'company_ir_root:aapl',
            provider: 'company_ir',
            source_family: 'company_results',
            source_url: 'https://investors.example.com/results/q1',
            requires_robots_check: true,
            rationale: 'Official IR results page.',
          },
        ],
        chosen_source_ids: ['company_ir_root:aapl'],
      }),
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.artifacts[0]?.artifact.robots_url, 'https://investors.example.com/robots.txt');
      assert.equal(result.artifacts[0]?.artifact.robots_allowed, true);
      assert.equal(result.artifacts[0]?.artifact.terms_url, 'https://investors.example.com/terms');
    }
  } finally {
    robotsMock.mock.restore();
    textMock.mock.restore();
  }
});

test('EXTRACTOR emits null observations when an official HTML artifact does not contain explicit metrics', () => {
  const metrics = runStrictExtractor({
    periodType: 'annual',
    artifacts: [
      {
        artifact: {
          source_id: 'company_ir_root:aapl',
          provider: 'company_ir',
          artifact_type: 'html_page',
          source_url: 'https://investors.example.com/results/q1',
          fetched_at: '2026-04-22T12:00:00.000Z',
          as_of_date: null,
          period_type: 'annual',
          robots_url: 'https://investors.example.com/robots.txt',
          robots_allowed: true,
          terms_url: 'https://investors.example.com/terms',
        },
        raw: '<html><body><h1>Quarterly Results</h1><p>No tabular metrics here.</p></body></html>',
      },
    ],
  });

  assert.equal(metrics.revenue.observations[0]?.value, null);
  assert.equal(metrics.ebitda.observations[0]?.value, null);
  assert.equal(metrics.net_income.observations[0]?.value, null);
});

test('VALIDATOR fails when required metrics remain missing after official fetch', async () => {
  const resolveMock = mock.method(strictFinancialPipelineDeps, 'resolvePublicCompany', async () => ({
    identity: {
      companyName: 'Apple Inc.',
      ticker: 'AAPL',
      cik: '0000320193',
      lane: 'public',
      source: 'catalog',
      resolvedFrom: ['ticker'],
    },
    profile: null,
  }));
  const discoveryMock = mock.method(strictFinancialPipelineDeps, 'runSourceDiscoveryAgent', async () => ({
    ok: true as const,
    profile: {
      company: {
        id: 'company_1',
        ticker: 'AAPL',
        name: 'Apple Inc.',
        sector: null,
        industry: null,
        country: null,
        exchange: null,
        companyType: null,
        isSaas: false,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      identifiers: [{ id: 'id_1', companyId: 'company_1', ticker: 'AAPL', compositeFigi: null, shareClassFigi: null, cik: '0000320193', isin: null, cusip: null, source: 'sec', createdAt: '2026-01-01' }],
      snapshot: null,
      latestPrice: null,
      kpis: [],
    },
    plan: makeDiscoveryPlan(),
  }));
  const jsonMock = mock.method(strictSourceFetchExecutorDeps, 'fetchJsonWithRetry', async () => ({
    ok: true as const,
    data: companyFactsPayload({
      EarningsBeforeInterestTaxesDepreciationAndAmortization: undefined,
    }),
    raw: null,
    latencyMs: 0,
  }));

  try {
    const result = await runStrictFinancialPipeline({
      ticker: 'AAPL',
      company_identifier: null,
      period_type: 'annual',
      target_model_type: 'scorecard',
      explicit_assumptions: { wacc: null, terminal_growth: null, tax_rate: null },
    });

    assert.equal(result.status, 'FAILURE');
    if (result.status === 'FAILURE') {
      assert.equal(result.step, 'VALIDATOR');
      assert.equal(result.missing_fields.includes('ebitda'), true);
    }
  } finally {
    resolveMock.mock.restore();
    discoveryMock.mock.restore();
    jsonMock.mock.restore();
  }
});

test('strict pipeline succeeds with explicit non-null metrics from discovered official sources', async () => {
  const resolveMock = mock.method(strictFinancialPipelineDeps, 'resolvePublicCompany', async () => ({
    identity: {
      companyName: 'Apple Inc.',
      ticker: 'AAPL',
      cik: '0000320193',
      lane: 'public',
      source: 'catalog',
      resolvedFrom: ['ticker'],
    },
    profile: null,
  }));
  const discoveryMock = mock.method(strictFinancialPipelineDeps, 'runSourceDiscoveryAgent', async () => ({
    ok: true as const,
    profile: {
      company: {
        id: 'company_1',
        ticker: 'AAPL',
        name: 'Apple Inc.',
        sector: null,
        industry: null,
        country: null,
        exchange: null,
        companyType: null,
        isSaas: false,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      identifiers: [{ id: 'id_1', companyId: 'company_1', ticker: 'AAPL', compositeFigi: null, shareClassFigi: null, cik: '0000320193', isin: null, cusip: null, source: 'sec', createdAt: '2026-01-01' }],
      snapshot: null,
      latestPrice: null,
      kpis: [],
    },
    plan: makeDiscoveryPlan(),
  }));
  const jsonMock = mock.method(strictSourceFetchExecutorDeps, 'fetchJsonWithRetry', async () => ({
    ok: true as const,
    data: companyFactsPayload(),
    raw: null,
    latencyMs: 0,
  }));

  try {
    const result = await runStrictFinancialPipeline({
      ticker: 'AAPL',
      company_identifier: null,
      period_type: 'annual',
      target_model_type: 'scorecard',
      explicit_assumptions: { wacc: null, terminal_growth: null, tax_rate: null },
    });

    assert.equal(result.status, 'SUCCESS');
    if (result.status === 'SUCCESS') {
      assert.equal(result.steps.SOURCE_DISCOVERY_AGENT.chosen_sources[0]?.source_id, 'sec_companyfacts:0000320193');
      assert.equal(result.steps.MODEL_BUILDER.model_inputs.revenue?.value, 100);
      assert.equal(result.steps.MODEL_BUILDER.model_inputs.ebitda?.value, 40);
      assert.equal(result.steps.MODEL_BUILDER.model_inputs.net_income?.value, 20);
      assert.equal(result.steps.MODEL_BUILDER.model_inputs.cash?.value, 50);
      assert.equal(result.steps.MODEL_BUILDER.model_inputs.total_debt?.value, 30);
    }
  } finally {
    resolveMock.mock.restore();
    discoveryMock.mock.restore();
    jsonMock.mock.restore();
  }
});

test('strict route returns discovery failure JSON before extraction', async () => {
  const resolveMock = mock.method(strictFinancialPipelineDeps, 'resolvePublicCompany', async () => ({
    identity: {
      companyName: 'Apple Inc.',
      ticker: 'AAPL',
      cik: '0000320193',
      lane: 'public',
      source: 'catalog',
      resolvedFrom: ['ticker'],
    },
    profile: null,
  }));
  const discoveryMock = mock.method(strictFinancialPipelineDeps, 'runSourceDiscoveryAgent', async () => ({
    ok: false as const,
    reason: 'No acceptable official-source plan was available.',
  }));

  try {
    const response = await strictPipelinePost(
      new NextRequest('http://localhost/api/financial-pipeline/strict', {
        method: 'POST',
        body: JSON.stringify({
          ticker: 'AAPL',
          company_identifier: null,
          period_type: 'annual',
          target_model_type: 'scorecard',
          explicit_assumptions: {
            wacc: null,
            terminal_growth: null,
            tax_rate: null,
          },
        }),
      }),
    );

    const body = await response.json();
    assert.equal(body.status, 'FAILURE');
    assert.equal(body.step, 'SOURCE_DISCOVERY_AGENT');
  } finally {
    resolveMock.mock.restore();
    discoveryMock.mock.restore();
  }
});
