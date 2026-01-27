import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import type { MaDealInputs } from '@/lib/models/merger/maDealInputs';
import {
  computeAccretionPct,
  computeNewSharesIssued,
  computeProFormaEps,
  computeProFormaNetIncome,
  computeProFormaShares,
  computeStandaloneEps,
  computeStockConsideration,
  computeTargetEquityValue,
} from './math';

describe('ma math', () => {
  it('computes accretion/dilution with Decimal precision', () => {
    const inputs: MaDealInputs = {
      acquirer: {
        name: 'AcquirerCo',
        ticker: 'ACQ',
        sharePrice: new Decimal(100),
        sharesOutstanding: new Decimal(1000),
        netIncome: new Decimal(2000),
      },
      target: {
        name: 'TargetCo',
        ticker: 'TGT',
        sharePrice: new Decimal(50),
        sharesOutstanding: new Decimal(200),
        netIncome: new Decimal(300),
      },
      pricing: {
        offerPremiumPct: new Decimal(20),
      },
      consideration: {
        cashPct: new Decimal(60),
        stockPct: new Decimal(40),
      },
      synergies: {
        revenueSynergiesMm: new Decimal(25),
        costSynergiesMm: new Decimal(50),
      },
      transaction: {
        feesMm: new Decimal(100),
      },
    };

    const equityValue = computeTargetEquityValue(inputs);
    expect(equityValue.toNumber()).toBeCloseTo(12000, 6);

    const stockConsideration = computeStockConsideration(equityValue, inputs);
    expect(stockConsideration.toNumber()).toBeCloseTo(4800, 6);

    const newShares = computeNewSharesIssued(stockConsideration, inputs);
    expect(newShares.toNumber()).toBeCloseTo(48, 6);

    const proFormaNetIncome = computeProFormaNetIncome(inputs);
    expect(proFormaNetIncome.toNumber()).toBeCloseTo(2275, 6);

    const proFormaShares = computeProFormaShares(newShares, inputs);
    expect(proFormaShares.toNumber()).toBeCloseTo(1048, 6);

    const standaloneEps = computeStandaloneEps(inputs);
    const proFormaEps = computeProFormaEps(proFormaNetIncome, proFormaShares);
    const accretionPct = computeAccretionPct(proFormaEps, standaloneEps);

    expect(standaloneEps.toNumber()).toBeCloseTo(2, 6);
    expect(proFormaEps.toNumber()).toBeCloseTo(2.17137, 5);
    expect(accretionPct.toNumber()).toBeCloseTo(0.0857, 4);
  });
});
