import { getSupabaseServiceClient } from '@/lib/events/store';
import { fetchJsonWithRetry } from '@/lib/data/providers/shared';
import { serverEnv } from '@/lib/env/server';

export type OpenFigiSyncSummary = {
  ticker: string;
  companyId: string | null;
  compositeFigi: string | null;
  shareClassFigi: string | null;
  warnings: string[];
};

type OpenFigiMapping = {
  ticker?: string;
  compositeFIGI?: string;
  shareClassFIGI?: string;
  exchCode?: string;
};

type OpenFigiResponseItem = {
  data?: OpenFigiMapping[];
  error?: string;
};

export async function syncIdentifiersFromOpenFigi(ticker: string): Promise<OpenFigiSyncSummary> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) throw new Error('Supabase service client is not configured');

  const normalizedTicker = ticker.trim().toUpperCase();
  const companyRow = await supabase.from('companies').select('id,exchange').eq('ticker', normalizedTicker).maybeSingle();
  if (!companyRow.data?.id) throw new Error(`Company ${normalizedTicker} must exist before syncing identifiers`);

  const openFigiApiKey = serverEnv.OPENFIGI_API_KEY;
  const payload = [{ idType: 'TICKER', idValue: normalizedTicker, marketSecDes: 'Equity' }];
  const response = await fetchJsonWithRetry<OpenFigiResponseItem[]>({
    provider: 'openfigi',
    url: 'https://api.openfigi.com/v3/mapping',
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(openFigiApiKey ? { 'X-OPENFIGI-APIKEY': openFigiApiKey } : {}),
      },
      body: JSON.stringify(payload),
    },
    cacheKey: `openfigi:mapping:${normalizedTicker}`,
    ttlMs: 24 * 60 * 60 * 1000,
  });

  if (!response.ok) {
    return {
      ticker: normalizedTicker,
      companyId: companyRow.data.id,
      compositeFigi: null,
      shareClassFigi: null,
      warnings: [response.error.message],
    };
  }

  const first = Array.isArray(response.data) ? response.data[0] : null;
  const mapping = first?.data?.[0];
  if (!mapping) {
    return {
      ticker: normalizedTicker,
      companyId: companyRow.data.id,
      compositeFigi: null,
      shareClassFigi: null,
      warnings: [first?.error ?? 'OpenFIGI returned no mapping.'],
    };
  }

  const identifierPayload = {
    company_id: companyRow.data.id,
    ticker: mapping.ticker ?? normalizedTicker,
    composite_figi: mapping.compositeFIGI ?? null,
    share_class_figi: mapping.shareClassFIGI ?? null,
    source: 'openfigi',
  };
  const upsert = await (supabase.from('company_identifiers') as any)
    .upsert(identifierPayload, { onConflict: 'company_id,source' })
    .select('id')
    .single();

  return {
    ticker: normalizedTicker,
    companyId: companyRow.data.id,
    compositeFigi: mapping.compositeFIGI ?? null,
    shareClassFigi: mapping.shareClassFIGI ?? null,
    warnings: upsert.error ? [upsert.error.message] : [],
  };
}
