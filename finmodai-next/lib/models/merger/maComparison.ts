import Decimal from 'decimal.js';
import {
  computeAccretionPct,
  computeNewSharesIssued,
  computeProFormaEps,
  computeProFormaNetIncome,
  computeProFormaShares,
  computeStandaloneEps,
  computeStockConsideration,
  computeTargetEquityValue,
} from '@/lib/ma/math';
import type { MaDealInputs, SerializedMaDealInputs } from '@/lib/models/merger/maDealInputs';
import type { MaOutput, MaOutputs } from '@/lib/models/outputTypes';

const ONE_HUNDRED = new Decimal(100);

export type MaComputedOutputs = {
  targetEquityValue: Decimal;
  stockConsideration: Decimal;
  cashConsideration: Decimal;
  newSharesIssued: Decimal;
  proFormaShares: Decimal;
  standaloneEps: Decimal;
  proFormaEps: Decimal;
  accretionPct: Decimal;
};

export type ValueCell = {
  value?: Decimal;
  reason?: string;
};

export type MaTableRow = {
  label: string;
  units?: 'currency' | 'shares' | 'percent';
  standalone: ValueCell;
  proForma: ValueCell;
  note?: string;
};

const toDecimalInputs = (inputs: SerializedMaDealInputs): MaDealInputs => ({
  acquirer: {
    name: inputs.acquirer.name,
    ticker: inputs.acquirer.ticker,
    sharePrice: new Decimal(inputs.acquirer.sharePrice),
    sharesOutstanding: new Decimal(inputs.acquirer.sharesOutstanding),
    netIncome: new Decimal(inputs.acquirer.netIncome),
  },
  target: {
    name: inputs.target.name,
    ticker: inputs.target.ticker,
    sharePrice: new Decimal(inputs.target.sharePrice),
    sharesOutstanding: new Decimal(inputs.target.sharesOutstanding),
    netIncome: new Decimal(inputs.target.netIncome),
  },
  pricing: {
    offerPremiumPct: new Decimal(inputs.pricing.offerPremiumPct),
  },
  consideration: {
    cashPct: new Decimal(inputs.consideration.cashPct),
    stockPct: new Decimal(inputs.consideration.stockPct),
  },
  synergies: inputs.synergies
    ? {
        revenueSynergiesMm: inputs.synergies.revenueSynergiesMm !== undefined ? new Decimal(inputs.synergies.revenueSynergiesMm) : undefined,
        costSynergiesMm: inputs.synergies.costSynergiesMm !== undefined ? new Decimal(inputs.synergies.costSynergiesMm) : undefined,
      }
    : undefined,
  transaction: {
    feesMm: new Decimal(inputs.transaction.feesMm),
  },
});

export function computeMaComputedOutputs(inputs: SerializedMaDealInputs): MaComputedOutputs {
  const maInputs = toDecimalInputs(inputs);
  const targetEquityValue = computeTargetEquityValue(maInputs);
  const stockConsideration = computeStockConsideration(targetEquityValue, maInputs);
  const cashConsideration = targetEquityValue.mul(maInputs.consideration.cashPct.div(ONE_HUNDRED));
  const newSharesIssued = computeNewSharesIssued(stockConsideration, maInputs);
  const proFormaShares = computeProFormaShares(newSharesIssued, maInputs);
  const standaloneEps = computeStandaloneEps(maInputs);
  const proFormaNetIncome = computeProFormaNetIncome(maInputs);
  const proFormaEps = computeProFormaEps(proFormaNetIncome, proFormaShares);
  const accretionPct = computeAccretionPct(proFormaEps, standaloneEps);

  return {
    targetEquityValue,
    stockConsideration,
    cashConsideration,
    newSharesIssued,
    proFormaShares,
    standaloneEps,
    proFormaEps,
    accretionPct,
  };
}
const toValueCell = (value?: Decimal, reason?: string): ValueCell => ({
  value,
  reason,
});

const decimalFromOutput = (field?: MaOutput<number>): Decimal | undefined =>
  field?.value !== undefined ? new Decimal(field.value) : undefined;

export function buildMaComparisonRows(
  inputs: SerializedMaDealInputs,
  computed: MaComputedOutputs,
  outputs: MaOutputs<number>
): MaTableRow[] {
  const synergiesValue = new Decimal(inputs.synergies?.revenueSynergiesMm ?? 0)
    .plus(new Decimal(inputs.synergies?.costSynergiesMm ?? 0));
  const synergyRow: MaTableRow = synergiesValue.gt(0)
    ? {
        label: 'Synergies (run-rate)',
        units: 'currency',
        standalone: { reason: 'N/A for standalone acquirer' },
        proForma: toValueCell(synergiesValue, undefined),
        note: 'Adds to pro forma net income.',
      }
    : {
        label: 'Synergies (run-rate)',
        units: 'currency',
        standalone: { reason: 'N/A for standalone acquirer' },
        proForma: { reason: 'None assumed' },
        note: 'Adds to pro forma net income.',
      };

  return [
    {
      label: 'Net Income',
      units: 'currency',
      standalone: toValueCell(new Decimal(inputs.acquirer.netIncome)),
      proForma: toValueCell(decimalFromOutput(outputs.proFormaNetIncome), outputs.proFormaNetIncome?.reason),
      note: 'Includes synergies and fees.',
    },
    {
      label: 'Shares Outstanding',
      units: 'shares',
      standalone: toValueCell(new Decimal(inputs.acquirer.sharesOutstanding)),
      proForma: toValueCell(computed.proFormaShares, outputs.proFormaShares?.reason),
    },
    {
      label: 'EPS',
      units: 'currency',
      standalone: toValueCell(computed.standaloneEps, outputs.standaloneEps?.reason),
      proForma: toValueCell(computed.proFormaEps, outputs.proFormaEps?.reason),
      note: 'Accretion / dilution compares these values.',
    },
    synergyRow,
  ];
}
