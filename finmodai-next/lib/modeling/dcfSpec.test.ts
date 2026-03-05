import test from 'node:test';
import assert from 'node:assert/strict';
import { DcfSpecSchema } from '@/lib/modeling/dcfSpec';

const validSpec = {
  company: { name: 'Alphabet Inc.', ticker: 'GOOGL', currency: 'USD' },
  periods: { start_year: 2026, years: 5 },
  base_year: { revenue: 350000, ebit_margin: 0.29 },
  forecast: {
    revenue_growth: [0.1, 0.09, 0.08, 0.07, 0.06],
    ebit_margin: [0.29, 0.295, 0.3, 0.305, 0.31],
    tax_rate: 0.21,
    da_pct_rev: 0.03,
    capex_pct_rev: 0.045,
    nwc_pct_rev: 0.01,
  },
  valuation: {
    wacc: 0.1,
    terminal: { method: 'gordon' as const, g: 0.025 },
  },
  outputs: {
    sensitivity: {
      wacc: [0.08, 0.09, 0.1, 0.11, 0.12],
      terminal_g: [0.015, 0.02, 0.025, 0.03, 0.035],
    },
  },
};

test('DcfSpecSchema accepts valid gordon spec', () => {
  const parsed = DcfSpecSchema.parse(validSpec);
  assert.equal(parsed.company.ticker, 'GOOGL');
  assert.equal(parsed.valuation.terminal.method, 'gordon');
});

test('DcfSpecSchema rejects WACC below allowed range', () => {
  assert.throws(() => {
    DcfSpecSchema.parse({
      ...validSpec,
      valuation: {
        ...validSpec.valuation,
        wacc: 0.02,
      },
    });
  });
});

test('DcfSpecSchema enforces forecast array length == periods.years', () => {
  assert.throws(() => {
    DcfSpecSchema.parse({
      ...validSpec,
      forecast: {
        ...validSpec.forecast,
        revenue_growth: [0.1, 0.09, 0.08],
      },
    });
  });
});
