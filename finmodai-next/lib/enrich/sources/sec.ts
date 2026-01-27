import type { FactCandidate } from '@/lib/enrich/validate';

const USER_AGENT = 'CapitalBase/1.0 (enrichment; contact: dev@capitalbase.local)';

const clip = (text: string, max = 20000) => (text.length > max ? `${text.slice(0, max)}\n...[TRUNCATED]` : text);

let cikMapPromise: Promise<Record<string, { ticker: string; cik_str: number }>> | null = null;

async function fetchCikMap() {
  if (!cikMapPromise) {
    cikMapPromise = fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'User-Agent': USER_AGENT },
      cache: 'no-store',
    })
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}));
  }
  return cikMapPromise;
}

async function resolveCik(ticker: string): Promise<string | null> {
  const map = await fetchCikMap();
  const upper = ticker.toUpperCase();
  const match = Object.values(map).find((row: any) => row?.ticker?.toUpperCase() === upper);
  if (!match?.cik_str) return null;
  return String(match.cik_str).padStart(10, '0');
}

type FactValue = { value: number; unit: string; asOf?: string };

const pickLatestFact = (units: Record<string, Array<{ val: number; end?: string }>>): FactValue | null => {
  for (const [unit, entries] of Object.entries(units || {})) {
    const sorted = [...entries].filter((e) => typeof e.val === 'number').sort((a, b) => {
      const aDate = a.end ? new Date(a.end).getTime() : 0;
      const bDate = b.end ? new Date(b.end).getTime() : 0;
      return bDate - aDate;
    });
    if (sorted.length) {
      return { value: sorted[0].val, unit, asOf: sorted[0].end };
    }
  }
  return null;
};

const findFact = (facts: any, tags: string[]): FactValue | null => {
  for (const tag of tags) {
    const data = facts?.[tag]?.units;
    if (!data) continue;
    const latest = pickLatestFact(data);
    if (latest) return latest;
  }
  return null;
};

export async function getSecCandidates(ticker: string) {
  const cik = await resolveCik(ticker);
  if (!cik) {
    return { sharesCandidate: null, netDebtCandidate: null, rawText: null };
  }

  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, cache: 'no-store' });
  if (!res.ok) {
    return { sharesCandidate: null, netDebtCandidate: null, rawText: null };
  }
  const json = await res.json();
  const facts = json?.facts?.['us-gaap'] || {};

  const sharesFact = findFact(facts, [
    'EntityCommonStockSharesOutstanding',
    'CommonStockSharesOutstanding',
    'EntityCommonStockSharesIssued',
  ]);

  const debtFact = findFact(facts, [
    'Debt',
    'DebtAndCapitalLeaseObligations',
    'LongTermDebtAndCapitalLeaseObligations',
    'LongTermDebt',
    'DebtCurrent',
  ]);

  const cashFact = findFact(facts, [
    'CashAndCashEquivalentsAtCarryingValue',
    'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
    'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations',
  ]);

  const sharesCandidate: FactCandidate | null = sharesFact
    ? {
        value: sharesFact.value,
        source: 'sec',
        confidence: 0.7,
        unit: sharesFact.unit?.toLowerCase().includes('shares') ? 'shares' : null,
        asOf: sharesFact.asOf ?? null,
        notes: ['SEC companyfacts'],
      }
    : null;

  let netDebtCandidate: FactCandidate | null = null;
  if (debtFact?.value && cashFact?.value) {
    const netDebt = debtFact.value - cashFact.value;
    netDebtCandidate = {
      value: netDebt,
      source: 'sec',
      confidence: 0.5,
      unit: 'usd',
      asOf: debtFact.asOf ?? cashFact.asOf ?? null,
      notes: ['Net debt derived from SEC debt and cash facts'],
    };
  }

  const rawText = clip(JSON.stringify(json));

  return { sharesCandidate, netDebtCandidate, rawText, cik };
}
