import type Decimal from 'decimal.js';

export type SelectedMaCompany = {
  name: string;
  ticker: string;
  sharePrice: number | string | Decimal;
  sharesOutstanding: number | string | Decimal;
  netIncome: number | string | Decimal;
};

export type MaFormState = {
  dealStructure?: 'cash' | 'stock' | 'mixed';
  premiumPct?: number; // UI form uses decimal (0-1)
  stockPct?: number; // UI form uses decimal (0-1)
  feesTotal?: number; // $MM
  revenueSynergies?: { runRate?: number };
  cogsSavings?: { runRate?: number };
  opexSavings?: { runRate?: number };
};

export type MaDealInputs = {
  acquirer: {
    name: string;
    ticker: string;
    sharePrice: Decimal;
    sharesOutstanding: Decimal;
    netIncome: Decimal;
  };
  target: {
    name: string;
    ticker: string;
    sharePrice: Decimal;
    sharesOutstanding: Decimal;
    netIncome: Decimal;
  };
  pricing: {
    offerPremiumPct: Decimal; // 0-100
  };
  consideration: {
    cashPct: Decimal; // 0-100
    stockPct: Decimal; // 0-100
  };
  synergies?: {
    costSynergiesMm?: Decimal;
    revenueSynergiesMm?: Decimal;
  };
  transaction: {
    feesMm: Decimal;
  };
};

export type SerializedMaDealInputs = {
  acquirer: {
    name: string;
    ticker: string;
    sharePrice: number;
    sharesOutstanding: number;
    netIncome: number;
  };
  target: {
    name: string;
    ticker: string;
    sharePrice: number;
    sharesOutstanding: number;
    netIncome: number;
  };
  pricing: {
    offerPremiumPct: number;
  };
  consideration: {
    cashPct: number;
    stockPct: number;
  };
  synergies?: {
    revenueSynergiesMm?: number;
    costSynergiesMm?: number;
  };
  transaction: {
    feesMm: number;
  };
};

const toNumber = (value: Decimal) => value.toNumber();

const serializeCompany = (company: MaDealInputs['acquirer'] | MaDealInputs['target']) => ({
  name: company.name,
  ticker: company.ticker,
  sharePrice: toNumber(company.sharePrice),
  sharesOutstanding: toNumber(company.sharesOutstanding),
  netIncome: toNumber(company.netIncome),
});

const serializeSynergies = (synergies: MaDealInputs['synergies']) =>
  synergies
    ? {
        revenueSynergiesMm:
          synergies.revenueSynergiesMm !== undefined
            ? toNumber(synergies.revenueSynergiesMm)
            : undefined,
        costSynergiesMm:
          synergies.costSynergiesMm !== undefined ? toNumber(synergies.costSynergiesMm) : undefined,
      }
    : undefined;

export function serializeMaDealInputs(inputs: MaDealInputs): SerializedMaDealInputs {
  return {
    acquirer: serializeCompany(inputs.acquirer),
    target: serializeCompany(inputs.target),
    pricing: {
      offerPremiumPct: toNumber(inputs.pricing.offerPremiumPct),
    },
    consideration: {
      cashPct: toNumber(inputs.consideration.cashPct),
      stockPct: toNumber(inputs.consideration.stockPct),
    },
    synergies: serializeSynergies(inputs.synergies),
    transaction: {
      feesMm: toNumber(inputs.transaction.feesMm),
    },
  };
}
