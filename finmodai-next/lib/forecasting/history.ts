import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type ForecastDirection = 'up' | 'down';

export type ForecastRecord = {
  id: string;
  ticker: string;
  forecast: number[];
  predictedDirection: ForecastDirection;
  timestamp: number;
  horizon: number;
  actualDirection?: ForecastDirection;
};

type ForecastRecordRow = {
  id: string;
  ticker: string;
  forecast: number[] | null;
  predicted_direction: ForecastDirection;
  timestamp: number;
  horizon: number;
  actual_direction: ForecastDirection | null;
};

type ForecastRecordInsert = {
  id: string;
  ticker: string;
  forecast: number[];
  predicted_direction: ForecastDirection;
  timestamp: number;
  horizon: number;
  actual_direction?: ForecastDirection | null;
};

type ForecastRecordUpdate = {
  actual_direction?: ForecastDirection | null;
};

type ForecastHistoryDatabase = {
  public: {
    Tables: {
      forecast_records: {
        Row: ForecastRecordRow;
        Insert: ForecastRecordInsert;
        Update: ForecastRecordUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const memoryStore = new Map<string, ForecastRecord>();
const SUPABASE_TIMEOUT_MS = 750;

function getSupabaseClient(): SupabaseClient<ForecastHistoryDatabase> | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient<ForecastHistoryDatabase>(url, key, { auth: { persistSession: false } });
}

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

function isDirection(value: unknown): value is ForecastDirection {
  return value === 'up' || value === 'down';
}

function sanitizeForecast(values: number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

function toRow(record: ForecastRecord): ForecastRecordInsert {
  return {
    id: record.id,
    ticker: normalizeTicker(record.ticker),
    forecast: sanitizeForecast(record.forecast),
    predicted_direction: record.predictedDirection,
    timestamp: record.timestamp,
    horizon: record.horizon,
    actual_direction: record.actualDirection ?? null,
  };
}

function fromRow(row: ForecastRecordRow): ForecastRecord | null {
  const forecast = Array.isArray(row.forecast) ? sanitizeForecast(row.forecast) : [];
  if (!row.id || !row.ticker || forecast.length === 0 || !isDirection(row.predicted_direction)) return null;
  return {
    id: row.id,
    ticker: normalizeTicker(row.ticker),
    forecast,
    predictedDirection: row.predicted_direction,
    timestamp: Number.isFinite(row.timestamp) ? row.timestamp : Date.now(),
    horizon: Number.isFinite(row.horizon) ? row.horizon : forecast.length,
    actualDirection: isDirection(row.actual_direction) ? row.actual_direction : undefined,
  };
}

function memoryHistory(ticker: string): ForecastRecord[] {
  const normalizedTicker = normalizeTicker(ticker);
  return Array.from(memoryStore.values())
    .filter((record) => normalizeTicker(record.ticker) === normalizedTicker)
    .sort((left, right) => right.timestamp - left.timestamp);
}

async function withTimeout<T>(promise: PromiseLike<T>): Promise<T | null> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), SUPABASE_TIMEOUT_MS);
  });
  const result = await Promise.race([Promise.resolve(promise), timeout]);
  if (timeoutId) clearTimeout(timeoutId);
  return result;
}

export async function saveForecastRecord(record: ForecastRecord): Promise<void> {
  const sanitized: ForecastRecord = {
    ...record,
    ticker: normalizeTicker(record.ticker),
    forecast: sanitizeForecast(record.forecast),
    horizon: Math.max(1, Math.round(record.horizon)),
    timestamp: Number.isFinite(record.timestamp) ? record.timestamp : Date.now(),
  };
  if (sanitized.forecast.length === 0) return;

  memoryStore.set(sanitized.id, sanitized);

  const client = getSupabaseClient();
  if (!client) return;

  try {
    await withTimeout(client.from('forecast_records').upsert(toRow(sanitized), { onConflict: 'id' }));
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[forecastHistory] save failed', error instanceof Error ? error.message : error);
    }
  }
}

export async function getForecastHistory(ticker: string): Promise<ForecastRecord[]> {
  const client = getSupabaseClient();
  if (!client) return memoryHistory(ticker);

  try {
    const result = await withTimeout(
      client
        .from('forecast_records')
        .select('id,ticker,forecast,predicted_direction,timestamp,horizon,actual_direction')
        .eq('ticker', normalizeTicker(ticker))
        .order('timestamp', { ascending: false })
        .limit(100),
    );
    if (!result || result.error || !Array.isArray(result.data)) return memoryHistory(ticker);
    const records = result.data
      .map((row) => fromRow(row))
      .filter((record): record is ForecastRecord => record !== null);
    return records.length > 0 ? records : memoryHistory(ticker);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[forecastHistory] read failed', error instanceof Error ? error.message : error);
    }
    return memoryHistory(ticker);
  }
}

export async function updateForecastOutcome(id: string, actualDirection: ForecastDirection): Promise<void> {
  const current = memoryStore.get(id);
  if (current) {
    memoryStore.set(id, { ...current, actualDirection });
  }

  const client = getSupabaseClient();
  if (!client) return;

  try {
    await withTimeout(
      client
        .from('forecast_records')
        .update({ actual_direction: actualDirection })
        .eq('id', id),
    );
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[forecastHistory] outcome update failed', error instanceof Error ? error.message : error);
    }
  }
}
