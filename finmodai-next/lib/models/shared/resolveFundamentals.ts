import { fetchNormalizedFundamentals } from '@/lib/data/normalized';

type ResolveFundamentalsParams = {
  ticker: string;
  body?: Record<string, any> | null;
  sanitizedAssumptions?: Record<string, any> | null;
  ltmFinancials?: Record<string, any> | null;
  normalizedFinancials?: Record<string, any> | null;
  canonicalFinancials?: { values?: Record<string, { value: number | null }> } | null;
};

export type ResolvedFundamentals = {
  revenue: number | null;
  ebitda: number | null;
  netIncome: number | null;
  cash: number | null;
  totalDebt: number | null;
  missing: string[];
  sources: Record<string, string>;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const parsed = toFiniteNumber(entry);
      if (parsed !== null) return parsed;
    }
  }
  return null;
};

const pickValue = (
  label: string,
  candidates: Array<{ value: unknown; source: string }>
): { value: number | null; source: string } => {
  for (const candidate of candidates) {
    const resolved = toFiniteNumber(candidate.value);
    if (resolved !== null) {
      return { value: resolved, source: candidate.source };
    }
  }
  return { value: null, source: 'missing' };
};

export async function resolveFundamentals({
  ticker,
  body,
  sanitizedAssumptions,
  ltmFinancials,
  normalizedFinancials,
  canonicalFinancials,
}: ResolveFundamentalsParams): Promise<ResolvedFundamentals> {
  const manualInputs = body?.manualInputs ?? {};
  const overrides = body?.canonicalOverrides ?? body?.overrides ?? {};
  const canonicalValues = canonicalFinancials?.values ?? {};

  const override = (key: string) => manualInputs?.[key] ?? overrides?.[key] ?? body?.[key];

  const normalizedFundamentals = await fetchNormalizedFundamentals(ticker).catch(() => null);
  const normalized = normalizedFundamentals?.fundamentals ?? null;

  const revenuePick = pickValue('revenue', [
    { value: override('revenue'), source: 'user_override' },
    { value: override('revenueLTM'), source: 'user_override' },
    { value: override('revenue_ltm'), source: 'user_override' },
    { value: canonicalValues.revenue?.value, source: 'canonical' },
    { value: sanitizedAssumptions?.revenue?.[0], source: 'assumptions' },
    { value: ltmFinancials?.revenue, source: 'ltm' },
    { value: normalizedFinancials?.revenue, source: 'normalized' },
    { value: normalizedFinancials?.revenueM, source: 'normalized' },
    { value: normalizedFinancials?.revenueLTM, source: 'normalized' },
    { value: normalized?.revenueLTM, source: 'normalized' },
  ]);

  const ebitdaPick = pickValue('ebitda', [
    { value: override('ebitda'), source: 'user_override' },
    { value: override('ebitdaLTM'), source: 'user_override' },
    { value: override('ebitda_ltm'), source: 'user_override' },
    { value: canonicalValues.ebitda?.value, source: 'canonical' },
    { value: sanitizedAssumptions?.ebitda?.[0], source: 'assumptions' },
    { value: ltmFinancials?.ebitda, source: 'ltm' },
    { value: normalizedFinancials?.ebitda, source: 'normalized' },
    { value: normalizedFinancials?.ebitdaM, source: 'normalized' },
    { value: normalizedFinancials?.ebitdaLTM, source: 'normalized' },
    { value: normalized?.ebitdaLTM, source: 'normalized' },
  ]);

  const netIncomePick = pickValue('netIncome', [
    { value: override('netIncome'), source: 'user_override' },
    { value: override('net_income'), source: 'user_override' },
    { value: override('netIncomeLTM'), source: 'user_override' },
    { value: canonicalValues.netIncome?.value, source: 'canonical' },
    { value: sanitizedAssumptions?.netIncome?.[0], source: 'assumptions' },
    { value: ltmFinancials?.netIncome, source: 'ltm' },
    { value: normalizedFinancials?.netIncome, source: 'normalized' },
    { value: normalizedFinancials?.netIncomeM, source: 'normalized' },
    { value: normalizedFinancials?.netIncomeLTM, source: 'normalized' },
    { value: normalized?.netIncomeLTM, source: 'normalized' },
  ]);

  const cashPick = pickValue('cash', [
    { value: override('cash'), source: 'user_override' },
    { value: override('cashAndEquivalents'), source: 'user_override' },
    { value: canonicalValues.cash?.value, source: 'canonical' },
    { value: sanitizedAssumptions?.startingCash, source: 'assumptions' },
    { value: ltmFinancials?.cash, source: 'ltm' },
    { value: normalizedFinancials?.cash, source: 'normalized' },
    { value: normalizedFinancials?.cashM, source: 'normalized' },
    { value: normalized?.cash, source: 'normalized' },
  ]);

  const totalDebtPick = pickValue('totalDebt', [
    { value: override('totalDebt'), source: 'user_override' },
    { value: override('total_debt'), source: 'user_override' },
    { value: canonicalValues.totalDebt?.value, source: 'canonical' },
    { value: sanitizedAssumptions?.debt, source: 'assumptions' },
    { value: ltmFinancials?.totalDebt, source: 'ltm' },
    { value: normalizedFinancials?.totalDebt, source: 'normalized' },
    { value: normalizedFinancials?.totalDebtM, source: 'normalized' },
    { value: normalized?.totalDebt, source: 'normalized' },
  ]);

  const missing: string[] = [];
  if (revenuePick.value === null) missing.push('revenue');
  if (ebitdaPick.value === null) missing.push('ebitda');
  if (netIncomePick.value === null) missing.push('net_income');
  if (cashPick.value === null) missing.push('cash');
  if (totalDebtPick.value === null) missing.push('total_debt');

  return {
    revenue: revenuePick.value,
    ebitda: ebitdaPick.value,
    netIncome: netIncomePick.value,
    cash: cashPick.value,
    totalDebt: totalDebtPick.value,
    missing,
    sources: {
      revenue: revenuePick.source,
      ebitda: ebitdaPick.source,
      netIncome: netIncomePick.source,
      cash: cashPick.source,
      totalDebt: totalDebtPick.source,
    },
  };
}
