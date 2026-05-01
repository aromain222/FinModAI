import test from 'node:test';
import assert from 'node:assert/strict';
import type { SmartAssumptionResult } from '@/lib/smart-assumptions/types';
import {
  applySmartAssumptionResultToDcf,
  buildDeterministicAssumptions,
  normalizeDcfSharesOutstanding,
  parseDcfPrompt,
  type DeterministicAssumptions,
} from './dcfDemo';

test('parseDcfPrompt extracts years and explicit valuation overrides', () => {
  const parsed = parseDcfPrompt('Build a 5-year DCF model for Google with 9% WACC and 3% terminal growth');

  assert.equal(parsed.years, 5);
  assert.equal(parsed.impliedTicker, 'GOOGL');
  assert.equal(parsed.overrides.wacc, 0.09);
  assert.equal(parsed.overrides.terminalGrowth, 0.03);
});

test('buildDeterministicAssumptions returns bounded arrays sized to the forecast horizon', () => {
  const assumptions = buildDeterministicAssumptions(
    {
      ticker: 'GOOGL',
      companyName: 'Alphabet Inc.',
      sector: 'Communication Services',
      revenueLtm: 350000,
      ebitdaLtm: 120000,
      netIncomeLtm: 90000,
      cash: 100000,
      totalDebt: 25000,
      sharesOutstanding: 12000,
      sharePrice: 180,
      marketCap: 2160000,
      updatedAt: '2026-03-07',
    },
    parseDcfPrompt('Build a 5-year DCF model for Google')
  );

  assert.equal(assumptions.revenueGrowth.length, 5);
  assert.equal(assumptions.ebitMargin.length, 5);
  assert.ok(assumptions.revenueGrowth[0] > assumptions.revenueGrowth[4]);
  assert.ok(assumptions.wacc >= 0.06 && assumptions.wacc <= 0.16);
  assert.ok(assumptions.terminalGrowth >= 0.01 && assumptions.terminalGrowth <= 0.04);
});

test('normalizeDcfSharesOutstanding converts billion-scale live shares to model millions', () => {
  const normalized = normalizeDcfSharesOutstanding(12.3, 4_710_000, 383);

  assert.ok(normalized !== null);
  assert.ok(normalized > 12_000);
  assert.ok(normalized < 13_000);
});

test('normalizeDcfSharesOutstanding leaves already-million share counts unchanged', () => {
  assert.equal(normalizeDcfSharesOutstanding(12_300, 4_710_000, 383), 12_300);
});

test('applySmartAssumptionResultToDcf makes company-aware DCF assumptions', () => {
  const base: DeterministicAssumptions = {
    revenueGrowth: [0.25, 0.22, 0.15, 0.1, 0.07],
    ebitMargin: [0.5, 0.5, 0.5, 0.5, 0.5],
    taxRate: 0.13,
    daPctRevenue: 0.025,
    capexPctRevenue: 0.03,
    nwcPctRevenue: 0.01,
    wacc: 0.115,
    terminalGrowth: 0.04,
    notes: ['Base note.'],
  };
  const smartResult: SmartAssumptionResult = {
    sourceType: 'smart_assumption_agent',
    subject: {
      companyName: 'NVIDIA Corp',
      ticker: 'NVDA',
      sector: 'Technology',
      industry: 'Semiconductors',
      regime: 'mature_compounder',
    },
    modelType: 'DCF',
    suggestions: {
      revenue_growth: 0.22,
      operating_margin: 0.45,
      wacc: 0.0875,
      terminal_growth_rate: 0.0335,
    },
    changedDrivers: [
      {
        driver: 'wacc',
        label: 'WACC',
        old: 0.115,
        new: 0.0875,
        rationale: 'Mega-cap scale and balance sheet justify a lower discount rate.',
        confidence: 'high',
      },
      {
        driver: 'terminal_growth_rate',
        label: 'Terminal growth',
        old: 0.04,
        new: 0.0335,
        rationale: 'Durable platform quality supports above-market steady-state growth.',
        confidence: 'medium',
      },
    ],
    driverRationales: {
      revenue_growth: 'Company-specific growth.',
      operating_margin: 'Company-specific margin.',
      wacc: 'Company-specific WACC.',
      terminal_growth_rate: 'Company-specific terminal growth.',
    },
    driverConfidence: {
      revenue_growth: 'medium',
      operating_margin: 'medium',
      wacc: 'high',
      terminal_growth_rate: 'medium',
    },
    provenanceSummary: {
      companyProfile: 'NVIDIA Corp screens as mature compounder.',
      peerContext: 'Semiconductor peer context.',
      macroContext: 'Neutral macro overlay.',
      sources: [],
    },
    warnings: [],
    normalizedOverrides: {},
  };

  const adjusted = applySmartAssumptionResultToDcf(base, smartResult, { years: 5 });

  assert.equal(adjusted.wacc, 0.0875);
  assert.equal(adjusted.terminalGrowth, 0.0335);
  assert.equal(adjusted.revenueGrowth[0], 0.22);
  assert.equal(adjusted.ebitMargin[0], 0.5, 'exceptional semiconductor margin should not be mechanically cut');
  assert.match(adjusted.notes.join(' '), /Smart assumptions applied/i);
});

test('applySmartAssumptionResultToDcf respects explicit user WACC overrides', () => {
  const base: DeterministicAssumptions = {
    revenueGrowth: [0.1, 0.08],
    ebitMargin: [0.2, 0.22],
    taxRate: 0.21,
    daPctRevenue: 0.03,
    capexPctRevenue: 0.04,
    nwcPctRevenue: 0.01,
    wacc: 0.12,
    terminalGrowth: 0.03,
    notes: [],
  };
  const smartResult: SmartAssumptionResult = {
    sourceType: 'smart_assumption_agent',
    subject: { companyName: 'TestCo', ticker: 'TST', sector: 'Technology', industry: null, regime: 'mature' },
    modelType: 'DCF',
    suggestions: {
      revenue_growth: 0.09,
      operating_margin: 0.24,
      wacc: 0.085,
      terminal_growth_rate: 0.032,
    },
    changedDrivers: [],
    driverRationales: {
      revenue_growth: '',
      operating_margin: '',
      wacc: '',
      terminal_growth_rate: '',
    },
    driverConfidence: {
      revenue_growth: 'medium',
      operating_margin: 'medium',
      wacc: 'high',
      terminal_growth_rate: 'medium',
    },
    provenanceSummary: { companyProfile: '', peerContext: '', macroContext: '', sources: [] },
    warnings: [],
    normalizedOverrides: {},
  };

  const adjusted = applySmartAssumptionResultToDcf(base, smartResult, {
    years: 2,
    preserveExplicitWacc: true,
  });

  assert.equal(adjusted.wacc, 0.12);
  assert.equal(adjusted.terminalGrowth, 0.032);
});
