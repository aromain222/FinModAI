import type {
  InvestmentSavedScenarioListItem,
  InvestmentSavedScenarioRecord,
  SaveInvestmentScenarioInput,
} from '@/lib/investment-analysis/types';

async function parseJson<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error((payload as { error?: string })?.error ?? 'Request failed.');
  }
  return payload as T;
}

export async function saveInvestmentScenarioViaApi(
  input: SaveInvestmentScenarioInput,
): Promise<InvestmentSavedScenarioRecord> {
  const response = await fetch('/api/investment-analysis/scenarios', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const payload = await parseJson<{ scenario: InvestmentSavedScenarioRecord }>(response);
  return payload.scenario;
}

export async function listSavedInvestmentScenariosViaApi(args?: {
  ticker?: string;
  limit?: number;
}): Promise<InvestmentSavedScenarioListItem[]> {
  const searchParams = new URLSearchParams();
  if (args?.ticker) searchParams.set('ticker', args.ticker);
  if (typeof args?.limit === 'number') searchParams.set('limit', String(args.limit));

  const response = await fetch(`/api/investment-analysis/scenarios?${searchParams.toString()}`, {
    method: 'GET',
  });

  const payload = await parseJson<{ scenarios: InvestmentSavedScenarioListItem[] }>(response);
  return payload.scenarios;
}

export async function getSavedInvestmentScenarioViaApi(
  id: string,
): Promise<InvestmentSavedScenarioRecord | null> {
  const response = await fetch(`/api/investment-analysis/scenarios?id=${encodeURIComponent(id)}`, {
    method: 'GET',
  });

  const payload = await parseJson<{ scenario: InvestmentSavedScenarioRecord | null }>(response);
  return payload.scenario;
}
