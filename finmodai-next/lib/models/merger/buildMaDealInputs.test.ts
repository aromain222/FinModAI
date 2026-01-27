import { describe, expect, it } from 'vitest';
import { buildMaDealInputs } from './buildMaDealInputs';

describe('buildMaDealInputs', () => {
  it('builds canonical inputs with normalized percentages', () => {
    const acquirer = {
      name: 'AcquirerCo',
      ticker: 'ACQ',
      sharePrice: 100,
      sharesOutstanding: 1000,
      netIncome: 2000,
    };
    const target = {
      name: 'TargetCo',
      ticker: 'TGT',
      sharePrice: 50,
      sharesOutstanding: 200,
      netIncome: 300,
    };

    const inputs = buildMaDealInputs(acquirer, target, {
      dealStructure: 'mixed',
      premiumPct: 0.2,
      stockPct: 0.4,
      feesTotal: 100,
      revenueSynergies: { runRate: 50 },
      cogsSavings: { runRate: 10 },
      opexSavings: { runRate: 5 },
    });

    expect(inputs.pricing.offerPremiumPct.toNumber()).toBeCloseTo(20, 6);
    expect(inputs.consideration.stockPct.toNumber()).toBeCloseTo(40, 6);
    expect(inputs.consideration.cashPct.toNumber()).toBeCloseTo(60, 6);
    expect(inputs.synergies?.costSynergiesMm?.toNumber()).toBeCloseTo(15, 6);
    expect(inputs.synergies?.revenueSynergiesMm?.toNumber()).toBeCloseTo(50, 6);
  });

  it('throws when premium is missing', () => {
    const acquirer = {
      name: 'AcquirerCo',
      ticker: 'ACQ',
      sharePrice: 100,
      sharesOutstanding: 1000,
      netIncome: 2000,
    };
    const target = {
      name: 'TargetCo',
      ticker: 'TGT',
      sharePrice: 50,
      sharesOutstanding: 200,
      netIncome: 300,
    };

    expect(() =>
      buildMaDealInputs(acquirer, target, {
        dealStructure: 'cash',
        feesTotal: 100,
      })
    ).toThrow('Offer premium');
  });
});
