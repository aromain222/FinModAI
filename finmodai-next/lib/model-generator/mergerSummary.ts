type MergerSummaryInputs = {
  purchasePrice: number | null;
  cashPct: number;
  stockPct: number;
  debtPct: number;
  newDebt: number;
  newDebtRate: number;
  taxRate: number;
  synergies: number;
  oneTimeCosts: number;
  acquirerPrice: number | null;
  acquirerShares: number | null;
  acquirerRevenue: number | null;
  acquirerEbitda: number | null;
  acquirerEbit: number | null;
  acquirerNetIncome: number | null;
  targetRevenue: number | null;
  targetEbitda: number | null;
  targetEbit: number | null;
  targetNetIncome: number | null;
};

export function calculateMergerSummary(inputs: MergerSummaryInputs) {
  const dealValue = inputs.purchasePrice ?? 0;
  const cashPct = inputs.cashPct ?? 0;
  const stockPct = inputs.stockPct ?? 0;
  const debtPct = inputs.debtPct ?? 0;
  const totalMix = cashPct + stockPct + debtPct;
  const normalizedCashPct = totalMix > 0 ? cashPct / totalMix : 0;
  const normalizedStockPct = totalMix > 0 ? stockPct / totalMix : 0;
  const normalizedDebtPct = totalMix > 0 ? debtPct / totalMix : 0;
  const stockValue = dealValue * normalizedStockPct;
  const debtValue = dealValue * normalizedDebtPct + (inputs.newDebt ?? 0);
  const interestExpense = debtValue * (inputs.newDebtRate ?? 0);
  const newShares =
    stockValue > 0 && inputs.acquirerPrice && inputs.acquirerPrice > 0 ? stockValue / inputs.acquirerPrice : 0;
  const proFormaShares = (inputs.acquirerShares ?? 0) + newShares;
  const proFormaRevenue = (inputs.acquirerRevenue ?? 0) + (inputs.targetRevenue ?? 0);
  const proFormaEbitda =
    (inputs.acquirerEbitda ?? 0) + (inputs.targetEbitda ?? 0) + (inputs.synergies ?? 0) - (inputs.oneTimeCosts ?? 0);
  const proFormaEbit =
    (inputs.acquirerEbit ?? 0) + (inputs.targetEbit ?? 0) + (inputs.synergies ?? 0) - (inputs.oneTimeCosts ?? 0);
  const proFormaEbt = proFormaEbit - interestExpense;
  const proFormaTax = Math.max(0, proFormaEbt * (inputs.taxRate ?? 0.25));
  const proFormaNetIncome = proFormaEbt - proFormaTax;
  const standaloneEps =
    inputs.acquirerShares && inputs.acquirerShares > 0 && inputs.acquirerNetIncome !== null
      ? inputs.acquirerNetIncome / inputs.acquirerShares
      : 0;
  const proFormaEps = proFormaShares > 0 ? proFormaNetIncome / proFormaShares : 0;
  const epsAccretion = proFormaEps - standaloneEps;
  const epsAccretionPct = standaloneEps !== 0 ? epsAccretion / standaloneEps : 0;

  return {
    consideration: {
      cash: dealValue * normalizedCashPct,
      stock: stockValue,
      debt: dealValue * normalizedDebtPct,
    },
    standaloneEps,
    proFormaRevenue,
    proFormaEbitda,
    proFormaNetIncome,
    proFormaEps,
    epsAccretion,
    epsAccretionPct,
  };
}
