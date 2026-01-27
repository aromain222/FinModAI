import Decimal from 'decimal.js';
import type { MaDealInputs } from '@/lib/models/merger/maDealInputs';

const ONE_HUNDRED = new Decimal(100);

export function computeTargetEquityValue(inputs: MaDealInputs): Decimal {
  const premiumMultiplier = new Decimal(1).plus(inputs.pricing.offerPremiumPct.div(ONE_HUNDRED));
  return inputs.target.sharePrice
    .mul(inputs.target.sharesOutstanding)
    .mul(premiumMultiplier);
}

export function computeStockConsideration(
  targetEquityValue: Decimal,
  inputs: MaDealInputs
): Decimal {
  return targetEquityValue.mul(inputs.consideration.stockPct.div(ONE_HUNDRED));
}

export function computeNewSharesIssued(
  stockConsideration: Decimal,
  inputs: MaDealInputs
): Decimal {
  return stockConsideration.div(inputs.acquirer.sharePrice);
}

export function computeProFormaNetIncome(
  inputs: MaDealInputs
): Decimal {
  const revenueSynergies = inputs.synergies?.revenueSynergiesMm ?? new Decimal(0);
  const costSynergies = inputs.synergies?.costSynergiesMm ?? new Decimal(0);
  return inputs.acquirer.netIncome
    .plus(inputs.target.netIncome)
    .plus(revenueSynergies)
    .plus(costSynergies)
    .minus(inputs.transaction.feesMm);
}

export function computeProFormaShares(
  newSharesIssued: Decimal,
  inputs: MaDealInputs
): Decimal {
  return inputs.acquirer.sharesOutstanding.plus(newSharesIssued);
}

export function computeStandaloneEps(inputs: MaDealInputs): Decimal {
  return inputs.acquirer.netIncome.div(inputs.acquirer.sharesOutstanding);
}

export function computeProFormaEps(
  proFormaNetIncome: Decimal,
  proFormaShares: Decimal
): Decimal {
  return proFormaNetIncome.div(proFormaShares);
}

export function computeAccretionPct(
  proFormaEps: Decimal,
  standaloneEps: Decimal
): Decimal {
  return proFormaEps.div(standaloneEps).minus(1);
}
