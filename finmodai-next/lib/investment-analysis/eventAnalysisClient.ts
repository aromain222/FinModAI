import type {
  InvestmentEventAnalysisRunListItem,
  InvestmentEventAnalysisRunRecord,
  SaveInvestmentEventAnalysisRunInput,
} from '@/lib/investment-analysis/types';

async function parseJson<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error((payload as { error?: string })?.error ?? 'Request failed.');
  }
  return payload as T;
}

export async function saveInvestmentEventAnalysisRunViaApi(
  input: SaveInvestmentEventAnalysisRunInput,
): Promise<InvestmentEventAnalysisRunRecord> {
  const response = await fetch('/api/investment-analysis/event-runs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const payload = await parseJson<{ run: InvestmentEventAnalysisRunRecord }>(response);
  return payload.run;
}

export async function listInvestmentEventAnalysisRunsViaApi(args?: {
  ticker?: string;
  eventCategory?: string;
  limit?: number;
}): Promise<InvestmentEventAnalysisRunListItem[]> {
  const searchParams = new URLSearchParams();
  if (args?.ticker) searchParams.set('ticker', args.ticker);
  if (args?.eventCategory) searchParams.set('eventCategory', args.eventCategory);
  if (typeof args?.limit === 'number') searchParams.set('limit', String(args.limit));

  const response = await fetch(`/api/investment-analysis/event-runs?${searchParams.toString()}`, {
    method: 'GET',
  });

  const payload = await parseJson<{ runs: InvestmentEventAnalysisRunListItem[] }>(response);
  return payload.runs;
}

export async function getInvestmentEventAnalysisRunViaApi(
  id: string,
): Promise<InvestmentEventAnalysisRunRecord | null> {
  const response = await fetch(`/api/investment-analysis/event-runs?id=${encodeURIComponent(id)}`, {
    method: 'GET',
  });

  const payload = await parseJson<{ run: InvestmentEventAnalysisRunRecord | null }>(response);
  return payload.run;
}
