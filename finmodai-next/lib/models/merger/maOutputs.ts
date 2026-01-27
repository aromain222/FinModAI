import Decimal from 'decimal.js';
import type { MaDealInputs } from './maDealInputs';
import type { MaOutput, MaOutputs } from '@/lib/models/outputTypes';
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

const buildMissingOutputs = (reason: string): MaOutputs<number> => ({
  targetEquityValue: { reason },
  newSharesIssued: { reason },
  proFormaNetIncome: { reason },
  proFormaShares: { reason },
  standaloneEps: { reason },
  proFormaEps: { reason },
  accretionPct: { reason },
});

const safeCompute = <T>(label: string, fn: () => T): MaOutput<T> => {
  try {
    return { value: fn() };
  } catch (error: any) {
    return { reason: error?.message || `Missing ${label}` };
  }
};

export function computeMaOutputs(inputs: MaDealInputs): MaOutputs<Decimal> {
  const targetEquityValue = safeCompute('target equity value', () => computeTargetEquityValue(inputs));
  const stockConsideration = safeCompute('stock consideration', () =>
    computeStockConsideration(targetEquityValue.value ?? new Decimal(0), inputs)
  );
  const newSharesIssued = safeCompute('new shares issued', () =>
    computeNewSharesIssued(stockConsideration.value ?? new Decimal(0), inputs)
  );
  const proFormaNetIncome = safeCompute('pro forma net income', () => computeProFormaNetIncome(inputs));
  const proFormaShares = safeCompute('pro forma shares', () =>
    computeProFormaShares(newSharesIssued.value ?? new Decimal(0), inputs)
  );
  const standaloneEps = safeCompute('standalone EPS', () => computeStandaloneEps(inputs));
  const proFormaEps = safeCompute('pro forma EPS', () =>
    computeProFormaEps(
      proFormaNetIncome.value ?? new Decimal(0),
      proFormaShares.value ?? new Decimal(1)
    )
  );
  const accretionPct = safeCompute('accretion %', () =>
    computeAccretionPct(
      proFormaEps.value ?? new Decimal(0),
      standaloneEps.value ?? new Decimal(1)
    )
  );

  return {
    targetEquityValue,
    newSharesIssued,
    proFormaNetIncome,
    proFormaShares,
    standaloneEps,
    proFormaEps,
    accretionPct,
  };
}

const toNumber = (value: Decimal): number => value.toNumber();

const serializeField = (field: MaOutput<Decimal>): MaOutput<number> =>
  field.value !== undefined
    ? { value: toNumber(field.value) }
    : { reason: field.reason ?? 'Missing value' };

export function serializeMaOutputs(outputs: MaOutputs<Decimal>): MaOutputs<number> {
  return {
    targetEquityValue: serializeField(outputs.targetEquityValue),
    newSharesIssued: serializeField(outputs.newSharesIssued),
    proFormaNetIncome: serializeField(outputs.proFormaNetIncome),
    proFormaShares: serializeField(outputs.proFormaShares),
    standaloneEps: serializeField(outputs.standaloneEps),
    proFormaEps: serializeField(outputs.proFormaEps),
    accretionPct: serializeField(outputs.accretionPct),
  };
}

export function computeMaOutputsSafe(
  inputs: MaDealInputs | null,
  reason?: string
): MaOutputs<number> {
  if (!inputs) {
    return buildMissingOutputs(reason || 'Missing M&A inputs');
  }
  try {
    return serializeMaOutputs(computeMaOutputs(inputs));
  } catch (error: any) {
    return buildMissingOutputs(error?.message || 'Unable to compute M&A outputs');
  }
}
