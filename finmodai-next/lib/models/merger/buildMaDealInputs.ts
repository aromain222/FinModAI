import Decimal from 'decimal.js';
import type { MaDealInputs, MaFormState, SelectedMaCompany } from './maDealInputs';

const ONE_HUNDRED = new Decimal(100);

type UiFieldMapping = {
  key: string;
  when: (form: MaFormState) => boolean;
  mapped: (inputs: MaDealInputs) => boolean;
};

const UI_FIELD_MAPPINGS: UiFieldMapping[] = [
  {
    key: 'buyerTicker',
    when: () => true,
    mapped: (inputs) => Boolean(inputs.acquirer.ticker),
  },
  {
    key: 'targetTicker',
    when: () => true,
    mapped: (inputs) => Boolean(inputs.target.ticker),
  },
  {
    key: 'dealStructure',
    when: () => true,
    mapped: (inputs) => inputs.consideration.cashPct !== undefined && inputs.consideration.stockPct !== undefined,
  },
  {
    key: 'premiumPct',
    when: () => true,
    mapped: (inputs) => inputs.pricing.offerPremiumPct !== undefined,
  },
  {
    key: 'stockPct',
    when: (form) => form.dealStructure === 'mixed',
    mapped: (inputs) => inputs.consideration.stockPct !== undefined,
  },
  {
    key: 'feesTotal',
    when: () => true,
    mapped: (inputs) => inputs.transaction.feesMm !== undefined,
  },
  {
    key: 'revenueSynergies.runRate',
    when: (form) => typeof form.revenueSynergies?.runRate === 'number',
    mapped: (inputs) => inputs.synergies?.revenueSynergiesMm !== undefined,
  },
  {
    key: 'cogsSavings.runRate',
    when: (form) => typeof form.cogsSavings?.runRate === 'number',
    mapped: (inputs) => inputs.synergies?.costSynergiesMm !== undefined,
  },
  {
    key: 'opexSavings.runRate',
    when: (form) => typeof form.opexSavings?.runRate === 'number',
    mapped: (inputs) => inputs.synergies?.costSynergiesMm !== undefined,
  },
];

const toDecimalRequired = (value: unknown, label: string): Decimal => {
  if (value instanceof Decimal) {
    if (!value.isFinite()) {
      throw new Error(`${label} must be a finite number.`);
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const dec = new Decimal(value);
    if (!dec.isFinite()) {
      throw new Error(`${label} must be a finite number.`);
    }
    return dec;
  }
  throw new Error(`${label} is required.`);
};

const normalizePctInput = (value: unknown, label: string): Decimal => {
  const dec = toDecimalRequired(value, label);
  const pct = dec.gt(1) ? dec : dec.mul(ONE_HUNDRED);
  if (pct.lt(0) || pct.gt(ONE_HUNDRED)) {
    throw new Error(`${label} must be between 0 and 100.`);
  }
  return pct;
};

const requireCompanyField = (value: unknown, label: string): Decimal => {
  const dec = toDecimalRequired(value, label);
  if (dec.isZero()) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return dec;
};

export function buildMaDealInputs(
  selectedAcquirer: SelectedMaCompany | null | undefined,
  selectedTarget: SelectedMaCompany | null | undefined,
  formState: MaFormState
): MaDealInputs {
  if (!selectedAcquirer) {
    throw new Error('Acquirer data is required.');
  }
  if (!selectedTarget) {
    throw new Error('Target data is required.');
  }

  if (!selectedAcquirer.name || !selectedAcquirer.ticker) {
    throw new Error('Acquirer name and ticker are required.');
  }
  if (!selectedTarget.name || !selectedTarget.ticker) {
    throw new Error('Target name and ticker are required.');
  }

  if (!formState.dealStructure) {
    throw new Error('Deal structure is required.');
  }

  const offerPremiumPct = normalizePctInput(formState.premiumPct, 'Offer premium');

  let stockPct: Decimal;
  if (formState.dealStructure === 'cash') {
    stockPct = new Decimal(0);
  } else if (formState.dealStructure === 'stock') {
    stockPct = new Decimal(100);
  } else {
    stockPct = normalizePctInput(formState.stockPct, 'Stock consideration %');
  }
  const cashPct = ONE_HUNDRED.minus(stockPct);
  if (!cashPct.isFinite() || cashPct.lt(0)) {
    throw new Error('Cash consideration % must be between 0 and 100.');
  }

  const feesMm = toDecimalRequired(formState.feesTotal, 'Transaction fees');
  if (feesMm.lt(0)) {
    throw new Error('Transaction fees must be non-negative.');
  }

  const revenueSynergiesRaw = formState.revenueSynergies?.runRate;
  const cogsSynergiesRaw = formState.cogsSavings?.runRate;
  const opexSynergiesRaw = formState.opexSavings?.runRate;

  const revenueSynergiesMm =
    typeof revenueSynergiesRaw === 'number'
      ? new Decimal(revenueSynergiesRaw)
      : undefined;
  const costSynergiesMmValue =
    (typeof cogsSynergiesRaw === 'number' ? new Decimal(cogsSynergiesRaw) : new Decimal(0))
      .plus(typeof opexSynergiesRaw === 'number' ? new Decimal(opexSynergiesRaw) : new Decimal(0));
  const costSynergiesMm = costSynergiesMmValue.gt(0) ? costSynergiesMmValue : undefined;

  const inputs: MaDealInputs = {
    acquirer: {
      name: selectedAcquirer.name,
      ticker: selectedAcquirer.ticker,
      sharePrice: requireCompanyField(selectedAcquirer.sharePrice, 'Acquirer share price'),
      sharesOutstanding: requireCompanyField(selectedAcquirer.sharesOutstanding, 'Acquirer shares outstanding'),
      netIncome: toDecimalRequired(selectedAcquirer.netIncome, 'Acquirer net income'),
    },
    target: {
      name: selectedTarget.name,
      ticker: selectedTarget.ticker,
      sharePrice: requireCompanyField(selectedTarget.sharePrice, 'Target share price'),
      sharesOutstanding: requireCompanyField(selectedTarget.sharesOutstanding, 'Target shares outstanding'),
      netIncome: toDecimalRequired(selectedTarget.netIncome, 'Target net income'),
    },
    pricing: {
      offerPremiumPct,
    },
    consideration: {
      cashPct,
      stockPct,
    },
    synergies:
      revenueSynergiesMm !== undefined || costSynergiesMm !== undefined
        ? {
            revenueSynergiesMm,
            costSynergiesMm,
          }
        : undefined,
    transaction: {
      feesMm,
    },
  };

  if (!inputs.consideration.cashPct.plus(inputs.consideration.stockPct).equals(ONE_HUNDRED)) {
    throw new Error('Cash % and Stock % must sum to 100.');
  }

  if (process.env.NODE_ENV !== 'production') {
    const missingMappings = UI_FIELD_MAPPINGS.filter((mapping) =>
      mapping.when(formState)
    ).filter((mapping) => !mapping.mapped(inputs));
    if (missingMappings.length > 0) {
      throw new Error(
        `M&A v1 mapping incomplete for: ${missingMappings.map((m) => m.key).join(', ')}`
      );
    }
  }

  return inputs;
}
