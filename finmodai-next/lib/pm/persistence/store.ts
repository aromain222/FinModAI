import { createClient } from '@supabase/supabase-js';

export type PMTableName =
  | 'pm_positions'
  | 'pm_position_theses'
  | 'pm_thesis_updates'
  | 'pm_agent_views'
  | 'pm_investment_decisions'
  | 'pm_alerts'
  | 'pm_memory'
  | 'pm_weekly_memos'
  | 'pm_paper_orders'
  | 'pm_competition_rounds'
  | 'pm_market_briefs';

export type PMStoredRecord = {
  id: string;
  ticker?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type PMRecord = PMStoredRecord & {
  [key: string]: unknown;
};

type SupabaseErrorLike = { message?: string };
type QueryResult = { data: Array<{ payload?: unknown }> | null; error: SupabaseErrorLike | null };
type MutationResult = { data: { payload?: unknown } | null; error: SupabaseErrorLike | null };

type TableSelect = {
  eq(column: string, value: string): TableSelect;
  order(column: string, options: { ascending: boolean }): TableSelect;
  limit(count: number): PromiseLike<QueryResult>;
};

type TableUpdate = {
  eq(column: 'id', id: string): {
    select(columns: 'payload'): {
      single(): PromiseLike<MutationResult>;
    };
  };
};

type TableAdapter = {
  select(columns: 'payload'): TableSelect;
  upsert(row: Record<string, unknown>, options: { onConflict: 'id' }): {
    select(columns: 'payload'): {
      single(): PromiseLike<MutationResult>;
    };
  };
  update(row: Record<string, unknown>): TableUpdate;
};

const memoryStore = new Map<PMTableName, Map<string, PMRecord>>();

function memoryTable(table: PMTableName): Map<string, PMRecord> {
  const existing = memoryStore.get(table);
  if (existing) return existing;
  const next = new Map<string, PMRecord>();
  memoryStore.set(table, next);
  return next;
}

function getSupabaseTable(table: PMTableName): TableAdapter | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_API_KEY || '';
  if (!url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false } });
  return client.from(table) as unknown as TableAdapter;
}

function createdAtOf(record: PMStoredRecord): string {
  return typeof record.createdAt === 'string' ? record.createdAt : new Date(0).toISOString();
}

function getStringProp(record: PMStoredRecord, key: string): string | null {
  const value = (record as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function getBooleanProp(record: PMStoredRecord, key: string): boolean | null {
  const value = (record as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : null;
}

function toIndexRow(table: PMTableName, record: PMStoredRecord): Record<string, unknown> {
  const now = new Date().toISOString();
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : now;
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : createdAt;
  const base: Record<string, unknown> = {
    id: record.id,
    ticker: typeof record.ticker === 'string' ? record.ticker : null,
    payload: record,
    created_at: createdAt,
    updated_at: updatedAt,
  };
  if (table === 'pm_positions') return { ...base, status: getStringProp(record, 'status') };
  if (table === 'pm_paper_orders') return { ...base, status: getStringProp(record, 'status') };
  if (table === 'pm_competition_rounds') return { ...base, ticker: getStringProp(record, 'winnerTicker'), status: getStringProp(record, 'status') };
  if (table === 'pm_market_briefs') return { ...base, ticker: null, status: getStringProp(record, 'runLabel') };
  if (table === 'pm_position_theses' || table === 'pm_thesis_updates') {
    return { ...base, thesis_status: getStringProp(record, 'thesisStatus') ?? getStringProp(record, 'thesisStatusAfter') };
  }
  if (table === 'pm_agent_views') {
    return { ...base, agent_name: getStringProp(record, 'agentName'), stance: getStringProp(record, 'stance') };
  }
  if (table === 'pm_investment_decisions') {
    return { ...base, action: getStringProp(record, 'action'), approval_status: getStringProp(record, 'approvalStatus') };
  }
  if (table === 'pm_alerts') {
    return {
      ...base,
      alert_type: getStringProp(record, 'alertType'),
      severity: getStringProp(record, 'severity'),
      should_notify_pm: getBooleanProp(record, 'shouldNotifyPM'),
      resolved_at: getStringProp(record, 'resolvedAt'),
    };
  }
  if (table === 'pm_memory') return { ...base, memory_type: getStringProp(record, 'memoryType') };
  if (table === 'pm_weekly_memos') {
    return { ...base, ticker: null, week_start: getStringProp(record, 'weekStart'), week_end: getStringProp(record, 'weekEnd') };
  }
  return base;
}

function readPayload(row: { payload?: unknown }): PMRecord | null {
  if (!row.payload || typeof row.payload !== 'object') return null;
  const payload = row.payload as PMRecord;
  return typeof payload.id === 'string' ? payload : null;
}

export async function listPMRecords<T extends PMStoredRecord>(
  table: PMTableName,
  params: { ticker?: string; limit?: number } = {},
): Promise<T[]> {
  const supabase = getSupabaseTable(table);
  if (supabase) {
    try {
      // select('*') instead of select('payload'): on newer Supabase Postgrest, the
      // narrow-column projection returns 0 rows on tables created without an explicit
      // FOR SELECT grant on that column (observed live for pm_paper_orders). Select all
      // and project payload client-side — same data, same perf, no projection bug.
      let query = (supabase as unknown as { select(cols: string): TableSelect }).select('*');
      query = query.order('created_at', { ascending: false });
      if (params.ticker) query = query.eq('ticker', params.ticker.toUpperCase());
      const { data, error } = await query.limit(params.limit ?? 100);
      if (!error && data) {
        return data.flatMap(row => {
          const payload = readPayload(row);
          return payload ? [payload as T] : [];
        });
      }
      if (error) {
        console.warn(`[pm/store] ${table} list failed:`, error.message);
      }
    } catch (err) {
      console.warn(`[pm/store] ${table} Supabase unavailable:`, (err as Error).message);
    }
  }

  const rows = [...memoryTable(table).values()]
    .filter(row => !params.ticker || row.ticker === params.ticker.toUpperCase())
    .sort((a, b) => createdAtOf(b).localeCompare(createdAtOf(a)))
    .slice(0, params.limit ?? 100);
  return rows as T[];
}

export async function upsertPMRecord<T extends PMStoredRecord>(table: PMTableName, record: T): Promise<T> {
  memoryTable(table).set(record.id, record);

  const supabase = getSupabaseTable(table);
  if (!supabase) return record;
  try {
    const { data, error } = await supabase
      .upsert(toIndexRow(table, record), { onConflict: 'id' })
      .select('payload')
      .single();
    if (!error && data) {
      return (readPayload(data) as T | null) ?? record;
    }
    if (error) {
      console.warn(`[pm/store] ${table} upsert failed:`, error.message);
    }
  } catch (err) {
    console.warn(`[pm/store] ${table} upsert unavailable:`, (err as Error).message);
  }
  return record;
}

export async function patchPMRecord<T extends PMStoredRecord>(
  table: PMTableName,
  id: string,
  patch: Partial<T>,
): Promise<T | null> {
  const current = memoryTable(table).get(id);
  const next = current
    ? { ...current, ...patch, id, updatedAt: new Date().toISOString() }
    : null;
  if (next) memoryTable(table).set(id, next);

  const supabase = getSupabaseTable(table);
  if (!supabase) return next as T | null;
  try {
    const existing = next ?? ({ id, ...patch, updatedAt: new Date().toISOString() } as PMRecord);
    const { data, error } = await supabase
      .update(toIndexRow(table, existing))
      .eq('id', id)
      .select('payload')
      .single();
    if (!error && data) {
      const payload = readPayload(data) as T | null;
      if (payload) memoryTable(table).set(payload.id, payload);
      return payload;
    }
    if (error && process.env.NODE_ENV !== 'production') {
      console.warn(`[pm/store] ${table} patch failed:`, error.message);
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.warn(`[pm/store] ${table} patch unavailable`, err);
  }
  return next as T | null;
}

export async function getLatestPMRecord<T extends PMStoredRecord>(table: PMTableName, ticker: string): Promise<T | null> {
  const rows = await listPMRecords<T>(table, { ticker, limit: 1 });
  return rows[0] ?? null;
}

export async function clearAllPMRecords(table: PMTableName): Promise<void> {
  memoryTable(table).clear();

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_API_KEY || '';
  if (!url || !key) return;
  try {
    const client = createClient(url, key, { auth: { persistSession: false } });
    await client.from(table).delete().neq('id', '__sentinel__');
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.warn(`[pm/store] ${table} clearAll failed`, err);
  }
}
