import { describe, it, expect } from 'vitest';
import { buildLboPayload, LboDealInputError } from '@/lib/models/lbo/buildLboDealInputs';

describe('buildLboDealInputs', () => {
  it('builds a canonical deal input payload', () => {
    const inputs = buildLboPayload({
      selectedCompany: { ticker: 'aapl', name: 'Apple Inc.' },
      formValues: {
        entryMultiple: '8',
        exitEBITDAMultiple: '10',
        offerPremium: '30',
        exitYear: '5',
        leverageMultiple: '4.5',
        termLoanBRate: '6.5',
        revolverRate: '5.0',
        transactionFeesPercent: '2.0',
        financingFeesPercent: '3.0',
        minimumCashBalance: '50',
      },
      advancedValues: {
        managementRolloverPct: '10',
        preferredEquityAmount: '25',
      },
    });

    expect(inputs.company.name).toBe('Apple Inc.');
    expect(inputs.company.ticker).toBe('AAPL');
    expect(inputs.entry.ebitdaMultiple).toBe(8);
    expect(inputs.fees.financingFeePct).toBe(3);
    expect(inputs.advanced?.rolloverEquityPct).toBe(10);
    expect(inputs.advanced?.preferredEquity?.amountMm).toBe(25);

    const collectNulls = (value: unknown): number => {
      if (value === null) return 1;
      if (Array.isArray(value)) {
        return value.reduce((sum, item) => sum + collectNulls(item), 0);
      }
      if (value && typeof value === 'object') {
        return Object.values(value).reduce((sum, item) => sum + collectNulls(item), 0);
      }
      return 0;
    };
    expect(collectNulls(inputs)).toBe(0);
  });

  it('rejects missing company context', () => {
    expect(() =>
      buildLboPayload({
        selectedCompany: { ticker: '', name: '' },
        formValues: {
          entryMultiple: '8',
          exitEBITDAMultiple: '10',
          offerPremium: '30',
          exitYear: '5',
          leverageMultiple: '4.5',
          termLoanBRate: '6.5',
          revolverRate: '5.0',
          transactionFeesPercent: '2.0',
          financingFeesPercent: '3.0',
          minimumCashBalance: '50',
        },
      })
    ).toThrow(LboDealInputError);
  });
});
