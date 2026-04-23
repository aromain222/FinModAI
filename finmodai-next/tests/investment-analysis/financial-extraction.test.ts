import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeAndReconcileFinancialFacts } from '@/lib/data/financial-extraction/normalizerReconciler';

test('public financial extraction blocks conflicting primary values', () => {
  const reconciled = normalizeAndReconcileFinancialFacts({
    lane: 'public',
    identity: {
      companyName: 'Acme Corp',
      ticker: 'ACME',
      lane: 'public',
      source: 'capitalbase_company_catalog',
      resolvedFrom: ['ticker'],
    },
    sourceArtifacts: [],
    facts: [
      {
        metricKey: 'revenue',
        value: 1_000_000_000,
        unit: 'currency',
        scale: 'actual',
        periodType: 'ltm',
        sourceType: 'sec_companyfacts',
        sourceLabel: 'sec_companyfacts',
        sourceUrlOrFileId: 'CIK0000001',
        confidence: 0.97,
      },
      {
        metricKey: 'revenue',
        value: 1_250_000_000,
        unit: 'currency',
        scale: 'actual',
        periodType: 'ltm',
        sourceType: 'sec_companyfacts',
        sourceLabel: 'sec_companyfacts_duplicate',
        sourceUrlOrFileId: 'CIK0000001-dup',
        confidence: 0.97,
      },
    ],
  });

  assert.equal(reconciled.snapshot.validationState, 'blocking_error');
  assert.match(reconciled.snapshot.blockingErrors.join(' '), /conflicting extracted values/i);
});

test('private financial extraction blocks incomplete operating anchors', () => {
  const reconciled = normalizeAndReconcileFinancialFacts({
    lane: 'private',
    identity: {
      companyName: 'PrivateCo',
      lane: 'private',
      source: 'private_upload_metadata',
      resolvedFrom: ['company_name'],
    },
    sourceArtifacts: [],
    facts: [
      {
        metricKey: 'cash',
        value: 4_000_000,
        unit: 'currency',
        scale: 'actual',
        periodType: 'annual',
        sourceType: 'uploaded_spreadsheet',
        sourceLabel: 'financials.xlsx',
        sourceUrlOrFileId: '/tmp/financials.xlsx',
        confidence: 0.9,
      },
    ],
  });

  assert.equal(reconciled.snapshot.validationState, 'blocking_error');
  assert.match(reconciled.snapshot.blockingErrors.join(' '), /revenue and EBITDA\/EBIT are still missing/i);
});

test('financial extraction mapped inputs normalize currencies to model millions', () => {
  const reconciled = normalizeAndReconcileFinancialFacts({
    lane: 'public',
    identity: {
      companyName: 'Acme Corp',
      ticker: 'ACME',
      lane: 'public',
      source: 'capitalbase_company_catalog',
      resolvedFrom: ['ticker'],
    },
    sourceArtifacts: [],
    facts: [
      {
        metricKey: 'revenue',
        value: 2_500_000_000,
        unit: 'currency',
        scale: 'actual',
        periodType: 'ltm',
        sourceType: 'stored_company_snapshot',
        sourceLabel: 'company_snapshot',
        sourceUrlOrFileId: 'ACME',
        confidence: 0.95,
      },
      {
        metricKey: 'ebitda',
        value: 500_000_000,
        unit: 'currency',
        scale: 'actual',
        periodType: 'ltm',
        sourceType: 'stored_company_snapshot',
        sourceLabel: 'company_snapshot',
        sourceUrlOrFileId: 'ACME',
        confidence: 0.95,
      },
      {
        metricKey: 'cash',
        value: 100_000_000,
        unit: 'currency',
        scale: 'actual',
        periodType: 'ltm',
        sourceType: 'stored_company_snapshot',
        sourceLabel: 'company_snapshot',
        sourceUrlOrFileId: 'ACME',
        confidence: 0.95,
      },
      {
        metricKey: 'total_debt',
        value: 300_000_000,
        unit: 'currency',
        scale: 'actual',
        periodType: 'ltm',
        sourceType: 'stored_company_snapshot',
        sourceLabel: 'company_snapshot',
        sourceUrlOrFileId: 'ACME',
        confidence: 0.95,
      },
    ],
  });

  assert.equal(reconciled.snapshot.validationState, 'ok');
  assert.equal(reconciled.snapshot.mappedModelInputs?.revenue, 2500);
  assert.equal(reconciled.snapshot.mappedModelInputs?.ebitda, 500);
  assert.equal(reconciled.snapshot.mappedModelInputs?.netDebt, 200);
});
